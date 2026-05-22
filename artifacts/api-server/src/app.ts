import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";
import { runMigrations } from "./lib/migrate";
import { seedUsers } from "./lib/seed";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

const __appDir = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();
const isProd = process.env.NODE_ENV === "production";

// ── Trust Proxy ───────────────────────────────────────────────────────────────
// Railway (and most cloud platforms) run behind a reverse proxy.
// Without this, secure cookies and rate-limiters break silently.
if (isProd) {
  app.set("trust proxy", 1);
}

// ── Session Secret ────────────────────────────────────────────────────────────
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (isProd) {
    logger.error("SESSION_SECRET environment variable is not set — using a random secret. Sessions will not persist across cold starts.");
  } else {
    logger.warn("[SECURITY WARNING] SESSION_SECRET not set — using insecure dev fallback.");
  }
}
const resolvedSecret = sessionSecret
  ?? (isProd ? require("node:crypto").randomBytes(32).toString("hex") : "dev-only-insecure-secret-do-not-use-in-prod");

// ── Helmet ────────────────────────────────────────────────────────────────────
if (isProd) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
} else {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
}

// ── Request Logging ───────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// ── CORS ──────────────────────────────────────────────────────────────────────
// In production: restrict to ALLOWED_ORIGINS env var (comma-separated list).
// In development: allow all origins (needed for Replit proxy/preview).
const rawAllowedOrigins = process.env.ALLOWED_ORIGINS;
const corsOrigin: cors.CorsOptions["origin"] = rawAllowedOrigins
  ? rawAllowedOrigins.split(",").map(o => o.trim()).filter(Boolean)
  : true;

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Session ───────────────────────────────────────────────────────────────────
const PgStore = connectPgSimple(session);
const sessionStore = new PgStore({ pool, createTableIfMissing: true, tableName: "session" });
sessionStore.on("error", (err: Error) => {
  logger.error({ err }, "Session store error");
});
app.use(
  session({
    store: sessionStore,
    name: "kyckling.sid",
    secret: resolvedSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProd,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

// ── DB Init ───────────────────────────────────────────────────────────────────
async function ensureDbConnection() {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    logger.warn({ err }, "DB wake-up ping failed, retrying...");
    await new Promise(r => setTimeout(r, 2000));
    try {
      await db.execute(sql`SELECT 1`);
      logger.info("DB wake-up retry succeeded");
    } catch (err2) {
      logger.error({ err: err2 }, "DB wake-up retry also failed");
    }
  }
}

const dbInitPromise = ensureDbConnection()
  .then(() => runMigrations())
  .then(() => seedUsers())
  .then(() => logger.info("DB init complete"))
  .catch(err => logger.error({ err }, "DB init failed"));

app.use(async (_req, _res, next) => {
  await dbInitPromise;
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Static Frontend (Production only) ────────────────────────────────────────
// In production, the built frontend sits next to this bundle in the dist tree.
// Railway build: pnpm build in api-server copies frontend dist here.
if (isProd) {
  // Try several candidate paths (monorepo vs flat dist layout)
  const candidates = [
    path.resolve(__appDir, "public"),
    path.resolve(__appDir, "../../poultry-manager/dist/public"),
    path.resolve(__appDir, "../public"),
  ];
  const staticRoot = candidates.find(p => existsSync(p));
  if (staticRoot) {
    logger.info({ staticRoot }, "Serving static frontend files");
    app.use(express.static(staticRoot, { maxAge: "7d", etag: true }));
    // SPA fallback — all non-API routes serve index.html
    app.get(/^(?!\/api).*$/, (_req, res) => {
      res.sendFile(path.join(staticRoot, "index.html"));
    });
  } else {
    logger.warn("No frontend static files found — only API will be served");
  }
}

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) {
    logger.error({ err }, "Error after headers sent");
    return;
  }

  if (err && typeof err === "object" && "issues" in err && Array.isArray((err as any).issues)) {
    const issues = (err as any).issues as Array<{ path: string[]; message: string }>;
    const messages = issues.map(e => `${e.path.join(".")}: ${e.message}`).join(", ");
    logger.warn({ err }, "Validation error");
    res.status(400).json({ success: false, error: "بيانات غير صحيحة", details: messages });
    return;
  }

  const msg = err instanceof Error ? err.message : String(err);
  const code = err instanceof Error ? (err as any).code : undefined;
  logger.error({ err }, "Unhandled error");

  const DB_PATTERNS = [
    "endpoint has been disabled", "Failed query", "ECONNREFUSED",
    "ENOTFOUND", "ETIMEDOUT", "connection", "Connection terminated",
    "too many clients", "remaining connection slots",
  ];
  const isDatabaseError = DB_PATTERNS.some(p => msg.includes(p)) ||
    ["57P01", "57P03", "08006", "08001", "08004"].includes(code);

  if (isDatabaseError) {
    res.status(503).json({ success: false, error: "خطأ في الاتصال بقاعدة البيانات. يرجى المحاولة بعد قليل" });
    return;
  }
  res.status(500).json({ success: false, error: "حدث خطأ في الخادم. يرجى المحاولة مرة أخرى" });
});

export default app;
