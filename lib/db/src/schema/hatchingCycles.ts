import { pgTable, serial, text, integer, numeric, date, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const hatchingCyclesTable = pgTable("hatching_cycles", {
  id: serial("id").primaryKey(),
  batchName: text("batch_name").notNull(),
  eggsSet: integer("eggs_set").notNull(),
  eggsHatched: integer("eggs_hatched"),
  startDate: date("start_date").notNull(),
  setTime: text("set_time"),
  expectedHatchDate: date("expected_hatch_date").notNull(),
  actualHatchDate: date("actual_hatch_date"),
  lockdownDate: date("lockdown_date"),
  lockdownTime: text("lockdown_time"),
  status: text("status").notNull().default("incubating"),
  temperature: numeric("temperature", { precision: 5, scale: 2 }),
  humidity: numeric("humidity", { precision: 5, scale: 2 }),
  lockdownTemperature: numeric("lockdown_temperature", { precision: 5, scale: 2 }),
  lockdownHumidity: numeric("lockdown_humidity", { precision: 5, scale: 2 }),
  notes: text("notes"),
  incubatorId: integer("incubator_id"),
  isActive: boolean("is_active").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertHatchingCycleSchema = createInsertSchema(hatchingCyclesTable).omit({ id: true, createdAt: true });
export type InsertHatchingCycle = z.infer<typeof insertHatchingCycleSchema>;
export type HatchingCycle = typeof hatchingCyclesTable.$inferSelect;
