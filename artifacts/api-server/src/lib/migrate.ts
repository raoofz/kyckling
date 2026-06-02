import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function runMigrations() {
  const client = await pool.connect();
  try {
    // ── Core tables ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" SERIAL PRIMARY KEY,
        "username" TEXT NOT NULL UNIQUE,
        "password_hash" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'worker',
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "session" (
        "sid" VARCHAR NOT NULL COLLATE "default",
        "sess" JSON NOT NULL,
        "expire" TIMESTAMP(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

      CREATE TABLE IF NOT EXISTS "flocks" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "breed" TEXT NOT NULL,
        "count" INTEGER NOT NULL,
        "age_days" INTEGER NOT NULL,
        "birth_date" DATE,
        "purpose" TEXT NOT NULL,
        "health_status" TEXT NOT NULL DEFAULT 'healthy',
        "feed_consumption_kg" NUMERIC(8,2),
        "daily_egg_target" INTEGER,
        "notes" TEXT,
        "health_score" INTEGER,
        "risk_score" INTEGER,
        "performance_index" INTEGER,
        "last_analyzed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "flock_production_logs" (
        "id" SERIAL PRIMARY KEY,
        "flock_id" INTEGER NOT NULL REFERENCES "flocks"("id") ON DELETE CASCADE,
        "date" DATE NOT NULL,
        "egg_count" INTEGER NOT NULL,
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_prod_logs_flock_id" ON "flock_production_logs" ("flock_id");
      CREATE INDEX IF NOT EXISTS "idx_prod_logs_date" ON "flock_production_logs" ("date" DESC);

      CREATE TABLE IF NOT EXISTS "flock_health_logs" (
        "id" SERIAL PRIMARY KEY,
        "flock_id" INTEGER NOT NULL REFERENCES "flocks"("id") ON DELETE CASCADE,
        "date" DATE NOT NULL,
        "status" TEXT NOT NULL,
        "symptoms" TEXT,
        "treatment" TEXT,
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_health_logs_flock_id" ON "flock_health_logs" ("flock_id");
      CREATE INDEX IF NOT EXISTS "idx_health_logs_date" ON "flock_health_logs" ("date" DESC);

      CREATE TABLE IF NOT EXISTS "hatching_cycles" (
        "id" SERIAL PRIMARY KEY,
        "batch_name" TEXT NOT NULL,
        "eggs_set" INTEGER NOT NULL,
        "eggs_hatched" INTEGER,
        "start_date" DATE NOT NULL,
        "set_time" TEXT,
        "expected_hatch_date" DATE NOT NULL,
        "actual_hatch_date" DATE,
        "lockdown_date" DATE,
        "lockdown_time" TEXT,
        "status" TEXT NOT NULL DEFAULT 'incubating',
        "temperature" NUMERIC(5,2),
        "humidity" NUMERIC(5,2),
        "lockdown_temperature" NUMERIC(5,2),
        "lockdown_humidity" NUMERIC(5,2),
        "notes" TEXT,
        "is_active" BOOLEAN NOT NULL DEFAULT FALSE,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "tasks" (
        "id" SERIAL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "category" TEXT NOT NULL DEFAULT 'other',
        "priority" TEXT NOT NULL DEFAULT 'medium',
        "completed" BOOLEAN NOT NULL DEFAULT FALSE,
        "due_date" DATE,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "goals" (
        "id" SERIAL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "target_value" NUMERIC(10,2) NOT NULL,
        "current_value" NUMERIC(10,2) NOT NULL DEFAULT 0,
        "unit" TEXT NOT NULL,
        "category" TEXT NOT NULL DEFAULT 'other',
        "deadline" DATE,
        "completed" BOOLEAN NOT NULL DEFAULT FALSE,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "activity_logs" (
        "id" SERIAL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "category" TEXT NOT NULL DEFAULT 'other',
        "date" DATE NOT NULL,
        "task_id" INTEGER,
        "goal_id" INTEGER,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "daily_notes" (
        "id" SERIAL PRIMARY KEY,
        "content" TEXT NOT NULL,
        "date" DATE NOT NULL,
        "author_id" INTEGER,
        "author_name" TEXT,
        "category" TEXT NOT NULL DEFAULT 'general',
        "goal_id" INTEGER,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_daily_notes_date" ON "daily_notes" ("date" DESC);

      CREATE TABLE IF NOT EXISTS "transactions" (
        "id" SERIAL PRIMARY KEY,
        "date" DATE NOT NULL,
        "type" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "domain" TEXT,
        "description" TEXT NOT NULL,
        "amount" NUMERIC(12,2) NOT NULL,
        "quantity" NUMERIC(10,2),
        "unit" TEXT,
        "notes" TEXT,
        "author_id" INTEGER,
        "author_name" TEXT,
        "flock_id" INTEGER,
        "batch_id" INTEGER,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_transactions_date" ON "transactions" ("date" DESC);
      CREATE INDEX IF NOT EXISTS "idx_transactions_type" ON "transactions" ("type");
      CREATE INDEX IF NOT EXISTS "idx_transactions_flock_id" ON "transactions" ("flock_id");

      CREATE TABLE IF NOT EXISTS "feed_records" (
        "id" SERIAL PRIMARY KEY,
        "date" DATE NOT NULL,
        "feed_type" TEXT NOT NULL,
        "brand" TEXT,
        "quantity_kg" NUMERIC(10,2) NOT NULL,
        "price_per_kg" NUMERIC(8,2) NOT NULL,
        "total_cost" NUMERIC(12,2) NOT NULL,
        "supplier" TEXT,
        "transaction_id" INTEGER,
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "feed_record_allocations" (
        "id" SERIAL PRIMARY KEY,
        "feed_record_id" INTEGER NOT NULL REFERENCES "feed_records"("id") ON DELETE CASCADE,
        "flock_id" INTEGER NOT NULL REFERENCES "flocks"("id") ON DELETE CASCADE,
        "quantity_kg" NUMERIC(10,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "batches" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "flock_id" INTEGER REFERENCES "flocks"("id") ON DELETE SET NULL,
        "start_date" DATE NOT NULL,
        "end_date" DATE,
        "chicken_count" INTEGER NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'active',
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "medicine_records" (
        "id" SERIAL PRIMARY KEY,
        "date" DATE NOT NULL,
        "flock_id" INTEGER,
        "batch_id" INTEGER,
        "medicine_name" TEXT NOT NULL,
        "dosage" TEXT,
        "cost" NUMERIC(12,2) NOT NULL,
        "transaction_id" INTEGER,
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "invoices" (
        "id" SERIAL PRIMARY KEY,
        "customer_name" TEXT NOT NULL,
        "total_amount" NUMERIC(14,2) NOT NULL,
        "paid_amount" NUMERIC(14,2) NOT NULL DEFAULT 0,
        "remaining_amount" NUMERIC(14,2) NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'unpaid',
        "issue_date" DATE NOT NULL,
        "due_date" DATE,
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "payments" (
        "id" SERIAL PRIMARY KEY,
        "invoice_id" INTEGER NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
        "amount" NUMERIC(14,2) NOT NULL,
        "date" DATE NOT NULL,
        "method" TEXT,
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "inventory_items" (
        "id" SERIAL PRIMARY KEY,
        "sku" TEXT,
        "name" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "unit" TEXT NOT NULL,
        "quantity_on_hand" NUMERIC(14,3) NOT NULL DEFAULT 0,
        "unit_cost" NUMERIC(12,2) NOT NULL DEFAULT 0,
        "reorder_level" NUMERIC(14,3) NOT NULL DEFAULT 0,
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "inventory_movements" (
        "id" SERIAL PRIMARY KEY,
        "item_id" INTEGER NOT NULL,
        "type" TEXT NOT NULL,
        "quantity" NUMERIC(14,3) NOT NULL,
        "unit_cost" NUMERIC(12,2),
        "total_cost" NUMERIC(14,2),
        "date" DATE NOT NULL,
        "flock_id" INTEGER,
        "batch_id" INTEGER,
        "transaction_id" INTEGER,
        "reference_type" TEXT,
        "reference_id" INTEGER,
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_inv_movements_item_id" ON "inventory_movements" ("item_id");
      CREATE INDEX IF NOT EXISTS "idx_inv_movements_date" ON "inventory_movements" ("date" DESC);

      CREATE TABLE IF NOT EXISTS "prediction_logs" (
        "id" SERIAL PRIMARY KEY,
        "engine_version" TEXT NOT NULL DEFAULT '2.0',
        "analysis_type" TEXT NOT NULL,
        "input_hash" TEXT NOT NULL,
        "predicted_hatch_rate" NUMERIC(6,3),
        "predicted_risk_score" INTEGER,
        "confidence_score" INTEGER,
        "actual_hatch_rate" NUMERIC(6,3),
        "actual_risk_materialized" TEXT,
        "prediction_error" NUMERIC(6,3),
        "features_snapshot" JSONB,
        "model_metrics" JSONB,
        "data_quality_score" INTEGER,
        "anomalies_detected" JSONB,
        "resolved_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "note_images" (
        "id" SERIAL PRIMARY KEY,
        "note_id" INTEGER,
        "date" TEXT NOT NULL,
        "image_url" TEXT NOT NULL,
        "original_name" TEXT,
        "mime_type" TEXT,
        "category" TEXT NOT NULL DEFAULT 'general',
        "caption" TEXT,
        "author_id" INTEGER,
        "author_name" TEXT,
        "ai_analysis" TEXT,
        "ai_tags" JSONB,
        "ai_alerts" JSONB,
        "ai_confidence" INTEGER,
        "visual_metrics" JSONB,
        "risk_score" INTEGER,
        "analysis_status" TEXT NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_note_images_date" ON "note_images" ("date" DESC);
      CREATE INDEX IF NOT EXISTS "idx_note_images_note_id" ON "note_images" ("note_id");

      CREATE TABLE IF NOT EXISTS "image_feedback" (
        "id" SERIAL PRIMARY KEY,
        "image_id" INTEGER NOT NULL REFERENCES "note_images"("id") ON DELETE CASCADE,
        "user_id" INTEGER,
        "user_name" TEXT,
        "corrected_bird_count" INTEGER,
        "corrected_health_score" INTEGER,
        "corrected_risk_level" TEXT,
        "confidence_rating" INTEGER,
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_image_feedback_image_id" ON "image_feedback" ("image_id");
      CREATE INDEX IF NOT EXISTS "idx_image_feedback_created_at" ON "image_feedback" ("created_at" DESC);

      CREATE TABLE IF NOT EXISTS "flock_events" (
        "id" SERIAL PRIMARY KEY,
        "flock_id" INTEGER NOT NULL,
        "event_type" TEXT NOT NULL,
        "subtype" TEXT NOT NULL DEFAULT '',
        "severity" TEXT NOT NULL DEFAULT 'medium',
        "payload" JSONB NOT NULL DEFAULT '{}',
        "confidence" INTEGER NOT NULL DEFAULT 50,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_flock_events_flock_id" ON "flock_events" ("flock_id");
      CREATE INDEX IF NOT EXISTS "idx_flock_events_created_at" ON "flock_events" ("created_at" DESC);

      CREATE TABLE IF NOT EXISTS "conversations" (
        "id" SERIAL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "messages" (
        "id" SERIAL PRIMARY KEY,
        "conversation_id" INTEGER NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
        "role" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "auth_users" (
        "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "email" VARCHAR UNIQUE,
        "first_name" VARCHAR,
        "last_name" VARCHAR,
        "profile_image_url" VARCHAR,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── Accounting enums + tables (separate because CREATE TYPE can't use IF NOT EXISTS easily) ──
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE account_type AS ENUM ('asset','liability','equity','revenue','expense');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE normal_balance AS ENUM ('debit','credit');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE journal_entry_status AS ENUM ('posted','void');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "accounts" (
        "id" SERIAL PRIMARY KEY,
        "code" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "type" account_type NOT NULL,
        "normal_balance" normal_balance NOT NULL,
        "parent_id" INTEGER,
        "description" TEXT,
        "is_active" TEXT NOT NULL DEFAULT 'true',
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "accounts_code_unique" ON "accounts" ("code");

      CREATE TABLE IF NOT EXISTS "journal_entries" (
        "id" SERIAL PRIMARY KEY,
        "entry_date" TIMESTAMP NOT NULL,
        "memo" TEXT NOT NULL,
        "source_type" TEXT NOT NULL,
        "source_id" INTEGER,
        "status" journal_entry_status NOT NULL DEFAULT 'posted',
        "metadata" JSONB,
        "created_by" INTEGER,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "journal_entry_lines" (
        "id" SERIAL PRIMARY KEY,
        "journal_entry_id" INTEGER NOT NULL REFERENCES "journal_entries"("id") ON DELETE CASCADE,
        "account_id" INTEGER NOT NULL REFERENCES "accounts"("id") ON DELETE RESTRICT,
        "description" TEXT,
        "debit" NUMERIC(14,2) NOT NULL DEFAULT 0,
        "credit" NUMERIC(14,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_jel_entry_id" ON "journal_entry_lines" ("journal_entry_id");
      CREATE INDEX IF NOT EXISTS "idx_jel_account_id" ON "journal_entry_lines" ("account_id");
      CREATE INDEX IF NOT EXISTS "idx_je_entry_date" ON "journal_entries" ("entry_date" DESC);
      CREATE INDEX IF NOT EXISTS "idx_messages_conv_id" ON "messages" ("conversation_id");
      CREATE INDEX IF NOT EXISTS "idx_feed_alloc_feed_id" ON "feed_record_allocations" ("feed_record_id");
      CREATE INDEX IF NOT EXISTS "idx_feed_alloc_flock_id" ON "feed_record_allocations" ("flock_id");
      CREATE INDEX IF NOT EXISTS "idx_payments_invoice_id" ON "payments" ("invoice_id");
      CREATE INDEX IF NOT EXISTS "idx_hatching_status" ON "hatching_cycles" ("status");
      CREATE INDEX IF NOT EXISTS "idx_tasks_completed" ON "tasks" ("completed");
    `);

    // ── Farm upgrade tables ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "incubators" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "model" TEXT,
        "capacity" INTEGER NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'active',
        "location" TEXT,
        "purchase_date" DATE,
        "purchase_cost" NUMERIC(14,2),
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "incubator_readings" (
        "id" SERIAL PRIMARY KEY,
        "incubator_id" INTEGER NOT NULL REFERENCES "incubators"("id") ON DELETE CASCADE,
        "temperature" NUMERIC(5,2) NOT NULL,
        "humidity" NUMERIC(5,2) NOT NULL,
        "recorded_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_readings_incubator_id" ON "incubator_readings" ("incubator_id");
      CREATE INDEX IF NOT EXISTS "idx_readings_recorded_at" ON "incubator_readings" ("recorded_at" DESC);

      CREATE TABLE IF NOT EXISTS "incubator_alerts" (
        "id" SERIAL PRIMARY KEY,
        "incubator_id" INTEGER NOT NULL REFERENCES "incubators"("id") ON DELETE CASCADE,
        "type" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "severity" TEXT NOT NULL DEFAULT 'warning',
        "acknowledged" BOOLEAN NOT NULL DEFAULT FALSE,
        "acknowledged_by" INTEGER,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_alerts_incubator_id" ON "incubator_alerts" ("incubator_id");

      CREATE TABLE IF NOT EXISTS "suppliers" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "contact" TEXT,
        "phone" TEXT,
        "address" TEXT,
        "specialization" TEXT,
        "rating" INTEGER DEFAULT 0,
        "total_orders" INTEGER DEFAULT 0,
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "customers" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "contact" TEXT,
        "phone" TEXT,
        "address" TEXT,
        "type" TEXT DEFAULT 'retail',
        "total_purchases" INTEGER DEFAULT 0,
        "total_spent" NUMERIC(14,2) DEFAULT 0,
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "sales" (
        "id" SERIAL PRIMARY KEY,
        "customer_id" INTEGER REFERENCES "customers"("id") ON DELETE SET NULL,
        "hatching_cycle_id" INTEGER REFERENCES "hatching_cycles"("id") ON DELETE SET NULL,
        "item_type" TEXT NOT NULL,
        "quantity" INTEGER NOT NULL,
        "unit_price" NUMERIC(14,2) NOT NULL,
        "total_price" NUMERIC(14,2) NOT NULL,
        "date" DATE NOT NULL,
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_sales_date" ON "sales" ("date" DESC);
      CREATE INDEX IF NOT EXISTS "idx_sales_customer_id" ON "sales" ("customer_id");

      CREATE TABLE IF NOT EXISTS "expenses" (
        "id" SERIAL PRIMARY KEY,
        "category" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "amount" NUMERIC(14,2) NOT NULL,
        "date" DATE NOT NULL,
        "supplier_id" INTEGER REFERENCES "suppliers"("id") ON DELETE SET NULL,
        "incubator_id" INTEGER REFERENCES "incubators"("id") ON DELETE SET NULL,
        "hatching_cycle_id" INTEGER REFERENCES "hatching_cycles"("id") ON DELETE SET NULL,
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_expenses_date" ON "expenses" ("date" DESC);
      CREATE INDEX IF NOT EXISTS "idx_expenses_category" ON "expenses" ("category");

      CREATE TABLE IF NOT EXISTS "azolla_production" (
        "id" SERIAL PRIMARY KEY,
        "date" DATE NOT NULL,
        "quantity_kg" NUMERIC(10,2) NOT NULL,
        "pond_area_sqm" NUMERIC(10,2),
        "estimated_savings" NUMERIC(14,2),
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_azolla_date" ON "azolla_production" ("date" DESC);

      ALTER TABLE "hatching_cycles" ADD COLUMN IF NOT EXISTS "incubator_id" INTEGER;

      -- Hatch openings: per-opening tracking for each machine open during hatching
      CREATE TABLE IF NOT EXISTS "hatch_openings" (
        "id" SERIAL PRIMARY KEY,
        "hatching_cycle_id" INTEGER NOT NULL,
        "opened_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "chicks_count" INTEGER NOT NULL DEFAULT 0,
        "notes" TEXT,
        "opened_by_name" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_hatch_openings_cycle_id" ON "hatch_openings" ("hatching_cycle_id");

      -- Daily log per cycle-date (upsert)
      CREATE TABLE IF NOT EXISTS "hatching_daily_logs" (
        "id" SERIAL PRIMARY KEY,
        "hatching_cycle_id" INTEGER NOT NULL,
        "log_date" DATE NOT NULL,
        "temperature" NUMERIC(5,2),
        "humidity" NUMERIC(5,2),
        "turning_done" BOOLEAN NOT NULL DEFAULT FALSE,
        "notes" TEXT,
        "issues" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE("hatching_cycle_id", "log_date")
      );
      CREATE INDEX IF NOT EXISTS "idx_daily_logs_cycle_id" ON "hatching_daily_logs" ("hatching_cycle_id");
    `);

    logger.info("All database tables ensured");
  } catch (err) {
    logger.error({ err }, "Migration failed");
    throw err;
  } finally {
    client.release();
  }
}
