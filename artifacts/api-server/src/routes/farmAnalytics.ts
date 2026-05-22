import { Router, type IRouter } from "express";
import {
  db,
  hatchingCyclesTable,
  transactionsTable,
  salesTable,
  incubatorsTable,
  azollaProductionTable,
  flocksTable,
} from "@workspace/db";

type HatchingCycle = typeof hatchingCyclesTable.$inferSelect;
type Transaction   = typeof transactionsTable.$inferSelect;
type Sale          = typeof salesTable.$inferSelect;
type Incubator     = typeof incubatorsTable.$inferSelect;
type AzollaRecord  = typeof azollaProductionTable.$inferSelect;

const router: IRouter = Router();

router.get("/farm-analytics/overview", async (_req, res) => {
  try {
    const [cycles, transactions, sales, incubators, azolla, flocks] = await Promise.all([
      db.select().from(hatchingCyclesTable),
      db.select().from(transactionsTable),
      db.select().from(salesTable),
      db.select().from(incubatorsTable),
      db.select().from(azollaProductionTable),
      db.select().from(flocksTable),
    ]);

    const completedCycles = cycles.filter(
      (c: HatchingCycle) => c.status === "completed" && c.eggsHatched,
    );
    const avgHatchRate =
      completedCycles.reduce(
        (sum: number, c: HatchingCycle) => sum + (c.eggsHatched! / c.eggsSet) * 100,
        0,
      ) / (completedCycles.length || 1);

    const totalIncome = transactions
      .filter((t: Transaction) => t.type === "income")
      .reduce((sum: number, t: Transaction) => sum + Number(t.amount), 0);
    const totalExpenses = transactions
      .filter((t: Transaction) => t.type === "expense")
      .reduce((sum: number, t: Transaction) => sum + Number(t.amount), 0);

    const totalChicksSold = sales.reduce((sum: number, s: Sale) => sum + s.quantity, 0);
    const totalRevenue = sales.reduce(
      (sum: number, s: Sale) => sum + Number(s.totalPrice),
      0,
    );

    const totalAzollaKg = azolla.reduce(
      (sum: number, a: AzollaRecord) => sum + Number(a.quantityKg),
      0,
    );
    const totalSavings = azolla.reduce(
      (sum: number, a: AzollaRecord) => sum + Number(a.estimatedSavings || 0),
      0,
    );

    const activeCycles = cycles.filter(
      (c: HatchingCycle) => c.status === "incubating" || c.status === "hatching",
    );

    res.json({
      hatching: {
        totalCycles: cycles.length,
        completedCycles: completedCycles.length,
        avgHatchRate,
        activeCycles: activeCycles.length,
      },
      financial: {
        totalIncome,
        totalExpenses,
        netProfit: totalIncome - totalExpenses,
      },
      sales: {
        totalChicksSold,
        totalRevenue,
        totalSales: sales.length,
      },
      incubators: {
        total: incubators.length,
        active: incubators.filter((i: Incubator) => i.status === "active").length,
      },
      azolla: {
        totalKg: totalAzollaKg,
        totalSavings,
        records: azolla.length,
      },
      flocks: {
        totalFlocks: flocks.length,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
