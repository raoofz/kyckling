import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Records every time a machine is opened during/after hatching to count chicks */
export const hatchOpeningsTable = pgTable("hatch_openings", {
  id: serial("id").primaryKey(),
  hatchingCycleId: integer("hatching_cycle_id").notNull(),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  chicksCount: integer("chicks_count").notNull().default(0),
  notes: text("notes"),
  openedByName: text("opened_by_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertHatchOpeningSchema = createInsertSchema(hatchOpeningsTable).omit({ id: true, createdAt: true });
export type InsertHatchOpening = z.infer<typeof insertHatchOpeningSchema>;
export type HatchOpening = typeof hatchOpeningsTable.$inferSelect;
