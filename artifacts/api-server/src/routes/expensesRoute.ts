import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, expensesTable, transactionsTable } from "@workspace/db";

const router: IRouter = Router();

function formatExpense(e: typeof expensesTable.$inferSelect) {
  return {
    ...e,
    amount: Number(e.amount),
  };
}

// ── List all expenses ────────────────────────────────────────────────────────
router.get("/expenses", async (_req, res) => {
  try {
    const items = await db.select().from(expensesTable).orderBy(expensesTable.createdAt);
    res.json(items.map(formatExpense));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Expense totals by category ───────────────────────────────────────────────
router.get("/expenses/summary", async (_req, res) => {
  try {
    const rows = await db
      .select({
        category: expensesTable.category,
        total: sql<number>`coalesce(sum(${expensesTable.amount}::numeric), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(expensesTable)
      .groupBy(expensesTable.category);

    res.json(
      rows.map((r: (typeof rows)[number]) => ({
        category: r.category,
        total: Number(r.total),
        count: r.count,
      })),
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Create expense + matching expense transaction ────────────────────────────
router.post("/expenses", async (req, res) => {
  try {
    const body = req.body;
    const result = await db.transaction(async (tx) => {
      const [expense] = await tx
        .insert(expensesTable)
        .values({
          ...body,
          amount: String(body.amount),
        })
        .returning();

      await tx.insert(transactionsTable).values({
        date: body.date,
        type: "expense",
        category: body.category,
        domain: "expense",
        description: body.description,
        amount: String(body.amount),
        authorId: req.session.userId,
        authorName: req.session.name,
      });

      return expense;
    });

    res.status(201).json(formatExpense(result));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete expense ───────────────────────────────────────────────────────────
router.delete("/expenses/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(expensesTable).where(eq(expensesTable.id, id));
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
