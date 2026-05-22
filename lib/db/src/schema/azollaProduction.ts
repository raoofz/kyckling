import { pgTable, serial, numeric, date, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const azollaProductionTable = pgTable("azolla_production", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  quantityKg: numeric("quantity_kg", { precision: 10, scale: 2 }).notNull(),
  pondAreaSqm: numeric("pond_area_sqm", { precision: 10, scale: 2 }),
  estimatedSavings: numeric("estimated_savings", { precision: 14, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAzollaProductionSchema = createInsertSchema(azollaProductionTable).omit({ id: true, createdAt: true });
export type InsertAzollaProduction = z.infer<typeof insertAzollaProductionSchema>;
export type AzollaProduction = typeof azollaProductionTable.$inferSelect;
