import { Router, type IRouter, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db, hatchingCyclesTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface CyclePayload {
  id: number;
  batchName: string;
  eggsSet: number;
  eggsHatched: number | null;
  startDate: string;
  setTime: string | null;
  status: string;
  temperature: number | null;
  humidity: number | null;
  lockdownTemperature: number | null;
  lockdownHumidity: number | null;
  expectedHatchDate: string;
  actualHatchDate: string | null;
  lockdownDate: string | null;
  lockdownTime: string | null;
  isActive: boolean;
}

function formatCycle(c: typeof hatchingCyclesTable.$inferSelect): CyclePayload {
  return {
    id:                  c.id,
    batchName:           c.batchName,
    eggsSet:             c.eggsSet,
    eggsHatched:         c.eggsHatched ?? null,
    startDate:           c.startDate,
    setTime:             c.setTime ?? null,
    status:              c.status,
    temperature:         c.temperature         ? Number(c.temperature)         : null,
    humidity:            c.humidity            ? Number(c.humidity)            : null,
    lockdownTemperature: c.lockdownTemperature ? Number(c.lockdownTemperature) : null,
    lockdownHumidity:    c.lockdownHumidity    ? Number(c.lockdownHumidity)    : null,
    expectedHatchDate:   c.expectedHatchDate,
    actualHatchDate:     c.actualHatchDate ?? null,
    lockdownDate:        c.lockdownDate ?? null,
    lockdownTime:        c.lockdownTime ?? null,
    isActive:            c.isActive,
  };
}

async function queryActiveCycles(): Promise<CyclePayload[]> {
  const rows = await db
    .select()
    .from(hatchingCyclesTable)
    .where(sql`${hatchingCyclesTable.status} IN ('incubating', 'hatching')`);
  return rows.map(formatCycle);
}

// ── SSE endpoint: GET /api/hatching/live-stream ────────────────────────────────
// Streams real-time hatching state to the dashboard.
// Payload format: { serverTime: number, cycles: CyclePayload[] }
// Sends on connect + every 30 seconds.
router.get("/hatching/live-stream", async (req: Request, res: Response) => {
  // SSE response headers
  res.setHeader("Content-Type",     "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control",    "no-cache, no-transform");
  res.setHeader("Connection",       "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");   // disable nginx/proxy buffering
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.flushHeaders();

  let closed = false;

  async function emit() {
    if (closed || res.writableEnded) return;
    try {
      const cycles = await queryActiveCycles();
      const payload = JSON.stringify({ serverTime: Date.now(), cycles });
      res.write(`data: ${payload}\n\n`);
    } catch (err) {
      logger.warn({ err }, "hatchingStream: emit error");
      // Don't crash — will retry on next tick
    }
  }

  // Immediate first emission
  await emit();

  // Heartbeat comment every 25 s to keep proxy connections alive
  const heartbeat = setInterval(() => {
    if (!closed && !res.writableEnded) {
      res.write(": heartbeat\n\n");
    }
  }, 25_000);

  // Data refresh every 30 s
  const refresh = setInterval(emit, 30_000);

  req.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
    clearInterval(refresh);
  });
});

export default router;
