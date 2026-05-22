import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, azollaProductionTable } from "@workspace/db";

const router: IRouter = Router();

function formatRecord(r: typeof azollaProductionTable.$inferSelect) {
  return {
    ...r,
    quantityKg: Number(r.quantityKg),
    pondAreaSqm: r.pondAreaSqm ? Number(r.pondAreaSqm) : null,
    estimatedSavings: r.estimatedSavings ? Number(r.estimatedSavings) : null,
  };
}

// ── List all production records ──────────────────────────────────────────────
router.get("/azolla", async (_req, res) => {
  try {
    const items = await db.select().from(azollaProductionTable).orderBy(azollaProductionTable.createdAt);
    res.json(items.map(formatRecord));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Summary: total kg, total savings, daily average ──────────────────────────
router.get("/azolla/summary", async (_req, res) => {
  try {
    const [summary] = await db
      .select({
        totalKg: sql<number>`coalesce(sum(${azollaProductionTable.quantityKg}::numeric), 0)`,
        totalSavings: sql<number>`coalesce(sum(${azollaProductionTable.estimatedSavings}::numeric), 0)`,
        records: sql<number>`count(*)::int`,
        distinctDays: sql<number>`count(distinct ${azollaProductionTable.date})::int`,
      })
      .from(azollaProductionTable);

    const totalKg = Number(summary.totalKg);
    const distinctDays = summary.distinctDays || 1;

    res.json({
      totalKg,
      totalSavings: Number(summary.totalSavings),
      dailyAverage: totalKg / distinctDays,
      records: summary.records,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Record production ────────────────────────────────────────────────────────
router.post("/azolla", async (req, res) => {
  try {
    const body = req.body;
    const [item] = await db
      .insert(azollaProductionTable)
      .values({
        ...body,
        quantityKg: String(body.quantityKg),
        pondAreaSqm: body.pondAreaSqm != null ? String(body.pondAreaSqm) : null,
        estimatedSavings: body.estimatedSavings != null ? String(body.estimatedSavings) : null,
      })
      .returning();
    res.status(201).json(formatRecord(item));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
