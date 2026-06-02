import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  salesTable,
  customersTable,
  hatchingCyclesTable,
  transactionsTable,
} from "@workspace/db";

const router: IRouter = Router();

function formatSale(s: typeof salesTable.$inferSelect) {
  return {
    ...s,
    unitPrice: Number(s.unitPrice),
    totalPrice: Number(s.totalPrice),
  };
}

// ── List all sales with customer and cycle info ──────────────────────────────
router.get("/sales", async (_req, res) => {
  try {
    const rows = await db
      .select({
        sale: salesTable,
        customerName: customersTable.name,
        cycleName: hatchingCyclesTable.batchName,
      })
      .from(salesTable)
      .leftJoin(customersTable, eq(salesTable.customerId, customersTable.id))
      .leftJoin(hatchingCyclesTable, eq(salesTable.hatchingCycleId, hatchingCyclesTable.id))
      .orderBy(salesTable.createdAt);

    res.json(
      rows.map((r: (typeof rows)[number]) => ({
        ...formatSale(r.sale),
        customerName: r.customerName,
        cycleName: r.cycleName,
      })),
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Sales summary ────────────────────────────────────────────────────────────
router.get("/sales/summary", async (_req, res) => {
  try {
    const [summary] = await db
      .select({
        totalSales: sql<number>`count(*)::int`,
        totalQuantity: sql<number>`coalesce(sum(${salesTable.quantity}), 0)::int`,
        totalRevenue: sql<number>`coalesce(sum(${salesTable.totalPrice}::numeric), 0)`,
      })
      .from(salesTable);
    res.json({
      totalSales: summary.totalSales,
      totalQuantity: summary.totalQuantity,
      totalRevenue: Number(summary.totalRevenue),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Create sale + matching income transaction ────────────────────────────────
router.post("/sales", async (req, res) => {
  try {
    const body = req.body;
    const result = await db.transaction(async (tx) => {
      const [sale] = await tx
        .insert(salesTable)
        .values({
          ...body,
          unitPrice: String(body.unitPrice),
          totalPrice: String(body.totalPrice),
        })
        .returning();

      await tx.insert(transactionsTable).values({
        date: body.date,
        type: "income",
        category: "chick_sale",
        domain: "income",
        description: `بيع ${body.quantity} صوص`,
        amount: String(body.totalPrice),
        quantity: String(body.quantity),
        unit: "صوص",
        authorId: req.session.userId,
        authorName: req.session.name,
      });

      return sale;
    });

    res.status(201).json(formatSale(result));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete sale ──────────────────────────────────────────────────────────────
router.delete("/sales/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(salesTable).where(eq(salesTable.id, id));
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
