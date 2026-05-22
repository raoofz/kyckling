import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const incubatorAlertsTable = pgTable("incubator_alerts", {
  id: serial("id").primaryKey(),
  incubatorId: integer("incubator_id").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  severity: text("severity").notNull().default("warning"),
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedBy: integer("acknowledged_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertIncubatorAlertSchema = createInsertSchema(incubatorAlertsTable).omit({ id: true, createdAt: true });
export type InsertIncubatorAlert = z.infer<typeof insertIncubatorAlertSchema>;
export type IncubatorAlert = typeof incubatorAlertsTable.$inferSelect;
