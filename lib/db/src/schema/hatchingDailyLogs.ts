import { pgTable, serial, integer, text, date, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** One log entry per (cycle, date) — upsert on (hatchingCycleId, logDate) */
export const hatchingDailyLogsTable = pgTable("hatching_daily_logs", {
  id: serial("id").primaryKey(),
  hatchingCycleId: integer("hatching_cycle_id").notNull(),
  logDate: date("log_date").notNull(),
  temperature: numeric("temperature", { precision: 5, scale: 2 }),
  humidity: numeric("humidity", { precision: 5, scale: 2 }),
  turningDone: boolean("turning_done").default(false).notNull(),
  notes: text("notes"),
  issues: text("issues"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertHatchingDailyLogSchema = createInsertSchema(hatchingDailyLogsTable).omit({ id: true, createdAt: true });
export type InsertHatchingDailyLog = z.infer<typeof insertHatchingDailyLogSchema>;
export type HatchingDailyLog = typeof hatchingDailyLogsTable.$inferSelect;
