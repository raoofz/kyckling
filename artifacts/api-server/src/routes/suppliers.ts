import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, suppliersTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/suppliers", async (_req, res) => {
  try {
    const items = await db.select().from(suppliersTable).orderBy(suppliersTable.createdAt);
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/suppliers", async (req, res) => {
  try {
    const [item] = await db.insert(suppliersTable).values(req.body).returning();
    res.status(201).json(item);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/suppliers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [updated] = await db
      .update(suppliersTable)
      .set(req.body)
      .where(eq(suppliersTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/suppliers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(suppliersTable).where(eq(suppliersTable.id, id));
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
