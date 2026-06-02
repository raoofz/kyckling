import { Router, type IRouter } from "express";
import {
  db,
  hatchingCyclesTable,
  transactionsTable,
  salesTable,
  incubatorsTable,
  azollaProductionTable,
  flocksTable,
  expensesTable,
} from "@workspace/db";

type HatchingCycle = typeof hatchingCyclesTable.$inferSelect;
type Transaction   = typeof transactionsTable.$inferSelect;
type Sale          = typeof salesTable.$inferSelect;
type Incubator     = typeof incubatorsTable.$inferSelect;
type AzollaRecord  = typeof azollaProductionTable.$inferSelect;

const router: IRouter = Router();

router.get("/farm-analytics/overview", async (_req, res) => {
  try {
    const [cycles, transactions, sales, incubators, azolla, flocks, expenses] = await Promise.all([
      db.select().from(hatchingCyclesTable),
      db.select().from(transactionsTable),
      db.select().from(salesTable),
      db.select().from(incubatorsTable),
      db.select().from(azollaProductionTable),
      db.select().from(flocksTable),
      db.select().from(expensesTable),
    ]);

    // ── Hatching stats ──
    const completedCycles = cycles.filter(
      (c: HatchingCycle) => c.status === "completed" && c.eggsHatched,
    );
    const activeCycles = cycles.filter(
      (c: HatchingCycle) => c.status === "incubating" || c.status === "hatching",
    );
    const totalEggsUsed = completedCycles.reduce((s: number, c: HatchingCycle) => s + c.eggsSet, 0);
    const totalChicksHatched = completedCycles.reduce((s: number, c: HatchingCycle) => s + (c.eggsHatched || 0), 0);
    const activeEggs = activeCycles.reduce((s: number, c: HatchingCycle) => s + c.eggsSet, 0);
    const avgHatchRate = totalEggsUsed > 0
      ? Math.round((totalChicksHatched / totalEggsUsed) * 100)
      : 0;

    // Per-cycle breakdown
    const cycleBreakdown = cycles
      .sort((a: HatchingCycle, b: HatchingCycle) => a.id - b.id)
      .map((c: HatchingCycle) => {
        const inc = incubators.find((i: Incubator) => i.id === c.incubatorId);
        const cycleSales = sales.filter((s: Sale) => s.hatchingCycleId === c.id);
        const saleRevenue = cycleSales.reduce((sum: number, s: Sale) => sum + Number(s.totalPrice), 0);
        const soldCount = cycleSales.reduce((sum: number, s: Sale) => sum + s.quantity, 0);
        const eggCost = c.eggsSet * 500;
        const profit = saleRevenue - eggCost;
        return {
          id: c.id,
          name: c.batchName,
          eggsSet: c.eggsSet,
          eggsHatched: c.eggsHatched,
          hatchRate: c.eggsHatched && c.eggsSet > 0 ? Math.round((c.eggsHatched / c.eggsSet) * 100) : null,
          status: c.status,
          startDate: c.startDate,
          machine: inc?.name || "—",
          eggCost,
          saleRevenue,
          soldCount,
          profit,
        };
      });

    // ── Financial stats (comprehensive) ──
    const totalIncome = transactions
      .filter((t: Transaction) => t.type === "income")
      .reduce((sum: number, t: Transaction) => sum + Number(t.amount), 0);
    const totalExpenses = transactions
      .filter((t: Transaction) => t.type === "expense")
      .reduce((sum: number, t: Transaction) => sum + Number(t.amount), 0);

    // Total egg purchase cost (all completed + active cycles × 500 dinar/egg)
    const totalEggCost = cycles.reduce((s: number, c: HatchingCycle) => s + c.eggsSet * 500, 0);

    // Total chicks sold revenue
    const totalChicksSold = sales.reduce((sum: number, s: Sale) => sum + s.quantity, 0);
    const totalSalesRevenue = sales.reduce((sum: number, s: Sale) => sum + Number(s.totalPrice), 0);

    // Sales by type
    const salesByType: Record<string, { count: number; revenue: number }> = {};
    sales.forEach((s: Sale) => {
      const t = s.itemType || "chick";
      if (!salesByType[t]) salesByType[t] = { count: 0, revenue: 0 };
      salesByType[t].count += s.quantity;
      salesByType[t].revenue += Number(s.totalPrice);
    });

    // Expense categories
    const expensesByCategory: Record<string, number> = {};
    expenses.forEach((e: any) => {
      const cat = e.category || "أخرى";
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + Number(e.amount);
    });

    // ── Azolla ──
    const totalAzollaKg = azolla.reduce((sum: number, a: AzollaRecord) => sum + Number(a.quantityKg), 0);
    const totalAzollaSavings = azolla.reduce((sum: number, a: AzollaRecord) => sum + Number(a.estimatedSavings || 0), 0);
    const azollaDays = azolla.length;
    const dailyAzollaSavings = azollaDays > 0 ? totalAzollaSavings / azollaDays : 0;
    const monthlyAzollaSavings = dailyAzollaSavings * 30;
    const yearlyAzollaSavings = dailyAzollaSavings * 365;
    const dailyAzollaKg = azollaDays > 0 ? totalAzollaKg / azollaDays : 0;

    // ── Revenue per chick ──
    const revenuePerChick = totalChicksSold > 0 ? Math.round(totalSalesRevenue / totalChicksSold) : 0;
    const costPerChick = totalChicksHatched > 0 ? Math.round(totalEggCost / totalChicksHatched) : 0;
    const profitPerChick = revenuePerChick - costPerChick;

    // ── Current assets value ──
    const remainingChickens = 117;
    const chickenValue = remainingChickens * 5000;

    // Net profit = sales revenue - egg costs + azolla savings
    const realNetProfit = totalSalesRevenue - totalEggCost + totalAzollaSavings;

    res.json({
      hatching: {
        totalCycles: cycles.length,
        completedCycles: completedCycles.length,
        avgHatchRate,
        activeCycles: activeCycles.length,
        totalEggsUsed,
        totalChicksHatched,
        activeEggs,
        cycleBreakdown,
      },
      financial: {
        totalIncome,
        totalExpenses,
        netProfit: realNetProfit,
        totalEggCost,
        totalSalesRevenue,
        azollaSavings: totalAzollaSavings,
        profitMargin: totalSalesRevenue > 0 ? Math.round((realNetProfit / totalSalesRevenue) * 100) : 0,
        revenuePerChick,
        costPerChick,
        profitPerChick,
        remainingChickens,
        chickenValue,
        expensesByCategory,
      },
      sales: {
        totalChicksSold,
        totalRevenue: totalSalesRevenue,
        totalSales: sales.length,
        salesByType,
        avgPricePerChick: revenuePerChick,
      },
      incubators: {
        total: incubators.length,
        active: incubators.filter((i: Incubator) => i.status === "active").length,
        details: incubators.map((i: Incubator) => ({
          id: i.id,
          name: i.name,
          capacity: i.capacity,
          status: i.status,
          activeCycles: activeCycles.filter((c: HatchingCycle) => c.incubatorId === i.id).length,
          activeEggs: activeCycles.filter((c: HatchingCycle) => c.incubatorId === i.id).reduce((s: number, c: HatchingCycle) => s + c.eggsSet, 0),
        })),
      },
      azolla: {
        totalKg: totalAzollaKg,
        totalSavings: totalAzollaSavings,
        records: azollaDays,
        dailySavings: Math.round(dailyAzollaSavings),
        monthlySavings: Math.round(monthlyAzollaSavings),
        yearlySavings: Math.round(yearlyAzollaSavings),
        dailyKg: Number(dailyAzollaKg.toFixed(1)),
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
