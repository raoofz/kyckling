import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  let dbOk = false;
  try {
    await pool.query("SELECT 1");
    dbOk = true;
  } catch { /* db not reachable */ }

  const data = HealthCheckResponse.parse({ status: dbOk ? "ok" : "degraded" });
  res.status(dbOk ? 200 : 503).json(data);
});

export default router;
