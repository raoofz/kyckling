import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = process.env.DATABASE_URL.replace(/^\uFEFF/, "").trim();
const isProd = process.env.NODE_ENV === "production";
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

export const pool = new Pool({
  connectionString,
  ssl: isProd ? { rejectUnauthorized: false } : undefined,
  max: isServerless ? 3 : 10,
  idleTimeoutMillis: isServerless ? 10_000 : 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("Unexpected pool error:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
