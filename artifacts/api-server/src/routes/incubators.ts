import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import {
  db,
  incubatorsTable,
  incubatorReadingsTable,
  incubatorAlertsTable,
  hatchingCyclesTable,
} from "@workspace/db";

const router: IRouter = Router();

function formatIncubator(i: typeof incubatorsTable.$inferSelect) {
  return {
    ...i,
    purchaseCost: i.purchaseCost ? Number(i.purchaseCost) : null,
  };
}

function formatReading(r: typeof incubatorReadingsTable.$inferSelect) {
  return {
    ...r,
    temperature: Number(r.temperature),
    humidity: Number(r.humidity),
  };
}

// ── List all incubators with their current active hatching cycle ──────────────
router.get("/incubators", async (_req, res) => {
  try {
    const incubators = await db.select().from(incubatorsTable).orderBy(incubatorsTable.createdAt);
    const activeCycles = await db
      .select()
      .from(hatchingCyclesTable)
      .where(sql`${hatchingCyclesTable.status} IN ('incubating', 'hatching')`);

    type Cycle = typeof hatchingCyclesTable.$inferSelect;
    type Inc = typeof incubatorsTable.$inferSelect;

    const cycleByIncubator = new Map(
      activeCycles
        .filter((c: Cycle) => c.incubatorId != null)
        .map((c: Cycle) => [c.incubatorId!, c] as const),
    );

    res.json(
      incubators.map((inc: Inc) => ({
        ...formatIncubator(inc),
        activeCycle: cycleByIncubator.get(inc.id) ?? null,
      })),
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Create incubator ─────────────────────────────────────────────────────────
router.post("/incubators", async (req, res) => {
  try {
    const [item] = await db.insert(incubatorsTable).values(req.body).returning();
    res.status(201).json(formatIncubator(item));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get single incubator with cycles and latest readings ─────────────────────
router.get("/incubators/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [incubator] = await db.select().from(incubatorsTable).where(eq(incubatorsTable.id, id));
    if (!incubator) { res.status(404).json({ error: "Not found" }); return; }

    const cycles = await db
      .select()
      .from(hatchingCyclesTable)
      .where(eq(hatchingCyclesTable.incubatorId, id))
      .orderBy(desc(hatchingCyclesTable.createdAt));

    const readings = await db
      .select()
      .from(incubatorReadingsTable)
      .where(eq(incubatorReadingsTable.incubatorId, id))
      .orderBy(desc(incubatorReadingsTable.recordedAt))
      .limit(10);

    res.json({
      ...formatIncubator(incubator),
      cycles,
      latestReadings: readings.map(formatReading),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update incubator ─────────────────────────────────────────────────────────
router.put("/incubators/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [updated] = await db
      .update(incubatorsTable)
      .set(req.body)
      .where(eq(incubatorsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatIncubator(updated));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete incubator ─────────────────────────────────────────────────────────
router.delete("/incubators/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(incubatorsTable).where(eq(incubatorsTable.id, id));
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get sensor readings for an incubator (last 100) ──────────────────────────
router.get("/incubators/:id/readings", async (req, res) => {
  try {
    const incubatorId = Number(req.params.id);
    const readings = await db
      .select()
      .from(incubatorReadingsTable)
      .where(eq(incubatorReadingsTable.incubatorId, incubatorId))
      .orderBy(desc(incubatorReadingsTable.recordedAt))
      .limit(100);
    res.json(readings.map(formatReading));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Record a sensor reading ──────────────────────────────────────────────────
router.post("/incubators/:id/readings", async (req, res) => {
  try {
    const incubatorId = Number(req.params.id);
    const [reading] = await db
      .insert(incubatorReadingsTable)
      .values({
        ...req.body,
        incubatorId,
        temperature: String(req.body.temperature),
        humidity: String(req.body.humidity),
      })
      .returning();
    res.status(201).json(formatReading(reading));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get alerts for an incubator ──────────────────────────────────────────────
router.get("/incubators/:id/alerts", async (req, res) => {
  try {
    const incubatorId = Number(req.params.id);
    const alerts = await db
      .select()
      .from(incubatorAlertsTable)
      .where(eq(incubatorAlertsTable.incubatorId, incubatorId))
      .orderBy(desc(incubatorAlertsTable.createdAt));
    res.json(alerts);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Create alert ─────────────────────────────────────────────────────────────
router.post("/incubators/:id/alerts", async (req, res) => {
  try {
    const incubatorId = Number(req.params.id);
    const [alert] = await db
      .insert(incubatorAlertsTable)
      .values({ ...req.body, incubatorId })
      .returning();
    res.status(201).json(alert);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Acknowledge alert ────────────────────────────────────────────────────────
router.put("/incubator-alerts/:id/acknowledge", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [updated] = await db
      .update(incubatorAlertsTable)
      .set({ acknowledged: true, acknowledgedBy: req.session.userId })
      .where(eq(incubatorAlertsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
