import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, customersTable } from "@workspace/db";

const router: IRouter = Router();

function formatCustomer(c: typeof customersTable.$inferSelect) {
  return {
    ...c,
    totalSpent: c.totalSpent ? Number(c.totalSpent) : 0,
  };
}

router.get("/customers", async (_req, res) => {
  try {
    const items = await db.select().from(customersTable).orderBy(customersTable.createdAt);
    res.json(items.map(formatCustomer));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/customers", async (req, res) => {
  try {
    const [item] = await db.insert(customersTable).values(req.body).returning();
    res.status(201).json(formatCustomer(item));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/customers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [updated] = await db
      .update(customersTable)
      .set(req.body)
      .where(eq(customersTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatCustomer(updated));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/customers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(customersTable).where(eq(customersTable.id, id));
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
