import {
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const routes = mysqlTable(
  "routes",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 16 }).notNull(),
    origin: varchar("origin", { length: 3 }).notNull(),
    destination: varchar("destination", { length: 3 }).notNull(),
    label: varchar("label", { length: 80 }).notNull(),
    basketWeight: decimal("basketWeight", { precision: 8, scale: 5 }).notNull(),
    baselineFare: decimal("baselineFare", { precision: 12, scale: 2 }).notNull(),
    isActive: int("isActive").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("routes_code_unique").on(table.code)]
);

export const fareQuotes = mysqlTable(
  "fare_quotes",
  {
    id: int("id").autoincrement().primaryKey(),
    routeId: int("routeId").notNull(),
    observedAt: timestamp("observedAt").notNull(),
    departureDate: timestamp("departureDate").notNull(),
    bookingWindowDays: int("bookingWindowDays").notNull(),
    carrier: varchar("carrier", { length: 60 }).notNull(),
    fareClass: varchar("fareClass", { length: 48 }).notNull(),
    baseFare: decimal("baseFare", { precision: 12, scale: 2 }).notNull(),
    taxes: decimal("taxes", { precision: 12, scale: 2 }).notNull(),
    totalFare: decimal("totalFare", { precision: 12, scale: 2 }).notNull(),
    availability: mysqlEnum("availability", ["available", "sold_out", "cancelled", "unknown"])
      .default("available")
      .notNull(),
    sourceType: mysqlEnum("sourceType", ["permitted_sample", "manual_upload"])
      .default("permitted_sample")
      .notNull(),
    sourceReference: varchar("sourceReference", { length: 160 }).notNull(),
    isDuplicate: int("isDuplicate").default(0).notNull(),
    isOutlier: int("isOutlier").default(0).notNull(),
    normalizationNotes: text("normalizationNotes"),
    ingestedAt: timestamp("ingestedAt").defaultNow().notNull(),
  },
  table => [
    index("fare_quotes_route_observed_idx").on(table.routeId, table.observedAt),
    index("fare_quotes_window_idx").on(table.bookingWindowDays),
  ]
);

export const indexObservations = mysqlTable(
  "index_observations",
  {
    id: int("id").autoincrement().primaryKey(),
    periodType: mysqlEnum("periodType", ["daily", "weekly", "monthly"]).notNull(),
    periodKey: varchar("periodKey", { length: 12 }).notNull(),
    indexValue: decimal("indexValue", { precision: 10, scale: 3 }).notNull(),
    baselineValue: decimal("baselineValue", { precision: 10, scale: 3 }).notNull(),
    sampleSize: int("sampleSize").notNull(),
    routeCoverage: decimal("routeCoverage", { precision: 8, scale: 5 }).notNull(),
    calculatedAt: timestamp("calculatedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("index_observations_period_unique").on(table.periodType, table.periodKey)]
);

export const benchmarkObservations = mysqlTable(
  "benchmark_observations",
  {
    id: int("id").autoincrement().primaryKey(),
    monthKey: varchar("monthKey", { length: 7 }).notNull(),
    benchmarkValue: decimal("benchmarkValue", { precision: 10, scale: 3 }).notNull(),
    sourceLabel: varchar("sourceLabel", { length: 160 }).notNull(),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("benchmark_month_unique").on(table.monthKey)]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Route = typeof routes.$inferSelect;
export type FareQuote = typeof fareQuotes.$inferSelect;
