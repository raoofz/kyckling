import { pgTable, serial, text, integer, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const incubatorsTable = pgTable("incubators", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  model: text("model"),
  capacity: integer("capacity").notNull(),
  status: text("status").notNull().default("active"),
  location: text("location"),
  purchaseDate: date("purchase_date"),
  purchaseCost: numeric("purchase_cost", { precision: 14, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertIncubatorSchema = createInsertSchema(incubatorsTable).omit({ id: true, createdAt: true });
export type InsertIncubator = z.infer<typeof insertIncubatorSchema>;
export type Incubator = typeof incubatorsTable.$inferSelect;
