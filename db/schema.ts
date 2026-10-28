import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
export const records = sqliteTable("records", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(), actor: text("actor").notNull(), sourceKey: text("source_key"),
}, t => [uniqueIndex("records_source_key").on(t.sourceKey)]);
