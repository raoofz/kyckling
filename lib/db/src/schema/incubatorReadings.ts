import { pgTable, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const incubatorReadingsTable = pgTable("incubator_readings", {
  id: serial("id").primaryKey(),
  incubatorId: integer("incubator_id").notNull(),
  temperature: numeric("temperature", { precision: 5, scale: 2 }).notNull(),
  humidity: numeric("humidity", { precision: 5, scale: 2 }).notNull(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const insertIncubatorReadingSchema = createInsertSchema(incubatorReadingsTable).omit({ id: true, recordedAt: true });
export type InsertIncubatorReading = z.infer<typeof insertIncubatorReadingSchema>;
export type IncubatorReading = typeof incubatorReadingsTable.$inferSelect;
