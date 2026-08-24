import { asc, eq } from "drizzle-orm";
import { benchmarkObservations, fareQuotes, routes } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  buildDashboardAnalytics,
  createPrototypeSampleQuotes,
  type AnalyticsFilter,
  type PrototypeRoute,
  type RouteQuote,
  PROTOTYPE_ROUTES,
} from "./model";

const numberValue = (value: string | number) => Number(value);

export async function ensurePrototypeData() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable for the prototype dataset.");
  const existingRoutes = await db.select({ id: routes.id }).from(routes).limit(1);
  if (existingRoutes.length) return;

  await db.transaction(async tx => {
    await tx.insert(routes).values(PROTOTYPE_ROUTES.map(route => ({
      code: route.code,
      origin: route.origin,
      destination: route.destination,
      label: route.label,
      basketWeight: route.basketWeight.toFixed(5),
      baselineFare: route.baselineFare.toFixed(2),
    })));
    const databaseRoutes = await tx.select().from(routes);
    const routeIds = new Map(databaseRoutes.map(route => [route.code, route.id]));
    const fixture = createPrototypeSampleQuotes();
    const rows = fixture.map(quote => ({
      routeId: routeIds.get(quote.routeCode)!,
      observedAt: quote.observedAt,
      departureDate: quote.departureDate,
      bookingWindowDays: quote.bookingWindowDays,
      carrier: quote.carrier,
      fareClass: quote.fareClass,
      baseFare: quote.baseFare.toFixed(2),
      taxes: quote.taxes.toFixed(2),
      totalFare: quote.totalFare.toFixed(2),
      availability: quote.availability,
      sourceType: quote.sourceType,
      sourceReference: quote.sourceReference,
      isDuplicate: quote.isDuplicate ? 1 : 0,
      isOutlier: quote.isOutlier ? 1 : 0,
      normalizationNotes: quote.normalizationNotes.join(" ") || null,
    }));
    for (let start = 0; start < rows.length; start += 500) {
      await tx.insert(fareQuotes).values(rows.slice(start, start + 500));
    }
    await tx.insert(benchmarkObservations).values([
      { monthKey: "2026-01", benchmarkValue: "99.400", sourceLabel: "Illustrative DGCA-style monthly comparator", note: "Prototype-only comparator; not an official DGCA fare series." },
      { monthKey: "2026-02", benchmarkValue: "101.900", sourceLabel: "Illustrative DGCA-style monthly comparator", note: "Prototype-only comparator; not an official DGCA fare series." },
      { monthKey: "2026-03", benchmarkValue: "104.600", sourceLabel: "Illustrative DGCA-style monthly comparator", note: "Prototype-only comparator; not an official DGCA fare series." },
    ]);
  });
}

export async function getPrototypeAnalytics(filter: AnalyticsFilter = {}) {
  await ensurePrototypeData();
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const routeRows = await db.select().from(routes).orderBy(asc(routes.code));
  const quoteRows = await db
    .select({
      routeCode: routes.code,
      routeLabel: routes.label,
      basketWeight: routes.basketWeight,
      observedAt: fareQuotes.observedAt,
      departureDate: fareQuotes.departureDate,
      bookingWindowDays: fareQuotes.bookingWindowDays,
      carrier: fareQuotes.carrier,
      fareClass: fareQuotes.fareClass,
      baseFare: fareQuotes.baseFare,
      taxes: fareQuotes.taxes,
      totalFare: fareQuotes.totalFare,
      availability: fareQuotes.availability,
      sourceType: fareQuotes.sourceType,
      sourceReference: fareQuotes.sourceReference,
      isDuplicate: fareQuotes.isDuplicate,
      isOutlier: fareQuotes.isOutlier,
      normalizationNotes: fareQuotes.normalizationNotes,
    })
    .from(fareQuotes)
    .innerJoin(routes, eq(fareQuotes.routeId, routes.id));
  const benchmarkRows = await db.select().from(benchmarkObservations).orderBy(asc(benchmarkObservations.monthKey));

  const typedRoutes: PrototypeRoute[] = routeRows.map(route => ({
    code: route.code,
    origin: route.origin,
    destination: route.destination,
    label: route.label,
    basketWeight: numberValue(route.basketWeight),
    baselineFare: numberValue(route.baselineFare),
  }));
  const typedQuotes: RouteQuote[] = quoteRows.map(quote => ({
    routeCode: quote.routeCode,
    routeLabel: quote.routeLabel,
    basketWeight: numberValue(quote.basketWeight),
    observedAt: quote.observedAt,
    departureDate: quote.departureDate,
    bookingWindowDays: quote.bookingWindowDays,
    carrier: quote.carrier,
    fareClass: quote.fareClass,
    baseFare: numberValue(quote.baseFare),
    taxes: numberValue(quote.taxes),
    totalFare: numberValue(quote.totalFare),
    availability: quote.availability,
    sourceType: quote.sourceType,
    sourceReference: quote.sourceReference,
    isDuplicate: Boolean(quote.isDuplicate),
    isOutlier: Boolean(quote.isOutlier),
    normalizationNotes: quote.normalizationNotes ? [quote.normalizationNotes] : [],
  }));
  const benchmark = benchmarkRows.map(row => ({
    monthKey: row.monthKey,
    value: numberValue(row.benchmarkValue),
    sourceLabel: row.sourceLabel,
    note: row.note,
  }));
  return { analytics: buildDashboardAnalytics(typedRoutes, typedQuotes, filter, benchmark), routes: typedRoutes, quotes: typedQuotes };
}

export async function listFareQuotes(filter: AnalyticsFilter, limit = 100) {
  const { quotes } = await getPrototypeAnalytics(filter);
  return quotes
    .filter(quote =>
      (!filter.routeCode || quote.routeCode === filter.routeCode) &&
      (!filter.carrier || quote.carrier === filter.carrier) &&
      (!filter.bookingWindowDays || quote.bookingWindowDays === filter.bookingWindowDays)
    )
    .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
    .slice(0, limit);
}

export async function getBacktestComparison(filter: AnalyticsFilter = {}) {
  const { analytics } = await getPrototypeAnalytics(filter);
  return analytics.benchmark;
}
