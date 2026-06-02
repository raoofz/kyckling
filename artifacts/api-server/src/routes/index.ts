import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import flocksRouter from "./flocks";
import hatchingCyclesRouter from "./hatchingCycles";
import tasksRouter from "./tasks";
import goalsRouter from "./goals";
import activityLogsRouter from "./activityLogs";
import dashboardRouter from "./dashboard";
import authRouter from "./auth";
import dailyNotesRouter from "./dailyNotes";
import aiRouter from "./ai";
import diagnosticsRouter from "./diagnostics";
import storageRouter from "./storage";
import noteImagesRouter from "./noteImages";
import transactionsRouter from "./transactions";
import analyticsRouter from "./analytics";
import brainRouter from "./brain";
import validationRouter from "./validation";
import hatchingStreamRouter from "./hatchingStream";
import feedIntelligenceRouter from "./feed-intelligence";
import flockIntelligenceRouter from "./flock-intelligence";
import financialEngineRouter from "./financial-engine";
import intelligenceRouter from "./intelligence";
import workspaceRouter from "./workspace";
import incubatorsRouter from "./incubators";
import suppliersRouter from "./suppliers";
import customersRouter from "./customers";
import salesRouter from "./sales";
import expensesRouter from "./expensesRoute";
import azollaRouter from "./azolla";
import farmAnalyticsRouter from "./farmAnalytics";
import hatchOpeningsRouter from "./hatchOpenings";
import batchesRouter from "./batches";
import medicineRecordsRouter from "./medicineRecords";
import invoicesRouter from "./invoices";
import financeCostRouter from "./finance-cost";
import inventoryRouter from "./inventory";
import operationsRouter from "./operations";
import accountingReportsRouter from "./accounting-reports";

const router: IRouter = Router();

// ── Auth Middleware ────────────────────────────────────────────────────────────

/**
 * Ensure the request is authenticated.
 * Returns 401 if the session has no userId.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ success: false, error: "غير مسجل الدخول" });
    return;
  }
  next();
}

/**
 * Factory: return a middleware that enforces a specific role.
 * Returns 401 if not logged in, 403 if logged in but insufficient role.
 *
 * Usage: router.post("/admin-route", requireRole("admin"), handler)
 */
export function requireRole(role: "admin" | "worker") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session.userId) {
      res.status(401).json({ success: false, error: "غير مسجل الدخول" });
      return;
    }
    if (req.session.role !== role) {
      res.status(403).json({ success: false, error: "هذه العملية مقتصرة على المديرين" });
      return;
    }
    next();
  };
}

// ── Public Routes (no auth) ───────────────────────────────────────────────────
router.use(authRouter);
router.use(healthRouter);
// Clock-sync endpoint — public, used by HatchingLiveTracker before login
router.get("/server-time", (_req, res) => {
  const now = new Date();
  res.json({ serverTime: now.toISOString(), timestamp: now.getTime() });
});

// ── Authenticated Routes (all verified users) ─────────────────────────────────
// All routes below require a valid session.
// Further role restrictions (admin-only) are enforced per-route within each router.
router.use(requireAuth);
router.use(flocksRouter);
router.use(hatchingCyclesRouter);
router.use(tasksRouter);
router.use(goalsRouter);
router.use(activityLogsRouter);
router.use(dashboardRouter);
router.use(dailyNotesRouter);
router.use(aiRouter);           // has its own requireAdmin guard on sensitive routes
router.use(diagnosticsRouter);  // has its own requireAdmin guard
router.use(storageRouter);
router.use(noteImagesRouter);
router.use(transactionsRouter);
router.use(analyticsRouter);
router.use(brainRouter);
router.use(validationRouter);   // /validate/integrity + /dev/* protected inside the router
router.use(hatchingStreamRouter);
router.use(feedIntelligenceRouter);
router.use(flockIntelligenceRouter);
router.use(financialEngineRouter);
router.use(intelligenceRouter);
router.use(workspaceRouter);
router.use(incubatorsRouter);
router.use(suppliersRouter);
router.use(customersRouter);
router.use(salesRouter);
router.use(expensesRouter);
router.use(azollaRouter);
router.use(farmAnalyticsRouter);
router.use(hatchOpeningsRouter);
// Accounting surface — financial data is admin-only (workers should never see
// invoices, batches, cost analysis, or insights).
router.use("/batches",          requireRole("admin"));
router.use("/medicine-records", requireRole("admin"));
router.use("/invoices",         requireRole("admin"));
router.use("/payments",         requireRole("admin"));
router.use("/finance",          requireRole("admin"));
router.use("/accounting-reports", requireRole("admin"));
router.use("/inventory",        requireRole("admin"));
router.use("/production",       requireRole("admin"));
router.use("/operations",       requireRole("admin"));
router.use(batchesRouter);
router.use(medicineRecordsRouter);
router.use(invoicesRouter);
router.use(financeCostRouter);
router.use(accountingReportsRouter);
router.use(inventoryRouter);
router.use(operationsRouter);

export default router;
