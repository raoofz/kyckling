import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, hatchOpeningsTable, hatchingDailyLogsTable } from "@workspace/db";

const router: IRouter = Router();

// ── Hatch Openings ────────────────────────────────────────────────────────────

/** List all openings for a cycle, newest first */
router.get("/hatching-cycles/:id/openings", async (req, res) => {
  try {
    const cycleId = Number(req.params.id);
    const rows = await db
      .select()
      .from(hatchOpeningsTable)
      .where(eq(hatchOpeningsTable.hatchingCycleId, cycleId))
      .orderBy(desc(hatchOpeningsTable.openedAt));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Record a new opening */
router.post("/hatching-cycles/:id/openings", async (req, res) => {
  try {
    const cycleId = Number(req.params.id);
    const body = req.body as {
      chicksCount: number;
      openedAt?: string;
      notes?: string;
    };
    const [row] = await db
      .insert(hatchOpeningsTable)
      .values({
        hatchingCycleId: cycleId,
        chicksCount: Number(body.chicksCount) || 0,
        openedAt: body.openedAt ? new Date(body.openedAt) : new Date(),
        notes: body.notes ?? null,
        openedByName: req.session.name ?? null,
      })
      .returning();
    res.status(201).json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Delete a single opening */
router.delete("/hatch-openings/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(hatchOpeningsTable).where(eq(hatchOpeningsTable.id, id));
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Summary: total chicks hatched from all openings of a cycle */
router.get("/hatching-cycles/:id/openings/summary", async (req, res) => {
  try {
    const cycleId = Number(req.params.id);
    const [row] = await db
      .select({
        totalChicks: sql<number>`coalesce(sum(${hatchOpeningsTable.chicksCount}), 0)::int`,
        openingsCount: sql<number>`count(*)::int`,
      })
      .from(hatchOpeningsTable)
      .where(eq(hatchOpeningsTable.hatchingCycleId, cycleId));
    res.json(row ?? { totalChicks: 0, openingsCount: 0 });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Daily Logs ────────────────────────────────────────────────────────────────

/** List all daily logs for a cycle */
router.get("/hatching-cycles/:id/daily-logs", async (req, res) => {
  try {
    const cycleId = Number(req.params.id);
    const rows = await db
      .select()
      .from(hatchingDailyLogsTable)
      .where(eq(hatchingDailyLogsTable.hatchingCycleId, cycleId))
      .orderBy(desc(hatchingDailyLogsTable.logDate));
    res.json(rows.map(r => ({
      ...r,
      temperature: r.temperature ? Number(r.temperature) : null,
      humidity:    r.humidity    ? Number(r.humidity)    : null,
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Upsert today's daily log (or any date) */
router.post("/hatching-cycles/:id/daily-logs", async (req, res) => {
  try {
    const cycleId = Number(req.params.id);
    const body = req.body as {
      logDate: string;
      temperature?: number | null;
      humidity?: number | null;
      turningDone?: boolean;
      notes?: string | null;
      issues?: string | null;
    };

    const values = {
      hatchingCycleId: cycleId,
      logDate: body.logDate,
      temperature: body.temperature != null ? String(body.temperature) : null,
      humidity:    body.humidity    != null ? String(body.humidity)    : null,
      turningDone: body.turningDone ?? false,
      notes:  body.notes  ?? null,
      issues: body.issues ?? null,
    };

    const [row] = await db
      .insert(hatchingDailyLogsTable)
      .values(values)
      .onConflictDoUpdate({
        target: [hatchingDailyLogsTable.hatchingCycleId, hatchingDailyLogsTable.logDate],
        set: {
          temperature: values.temperature,
          humidity:    values.humidity,
          turningDone: values.turningDone,
          notes:       values.notes,
          issues:      values.issues,
        },
      })
      .returning();

    res.status(201).json({
      ...row,
      temperature: row.temperature ? Number(row.temperature) : null,
      humidity:    row.humidity    ? Number(row.humidity)    : null,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
