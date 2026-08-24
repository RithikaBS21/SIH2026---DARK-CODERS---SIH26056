import { describe, expect, it } from "vitest";
import {
  buildDashboardAnalytics,
  calculateIndexSeries,
  normalizeFareQuotes,
  type PrototypeRoute,
  type RouteQuote,
} from "./model";

const route: PrototypeRoute = {
  code: "DEL-BOM",
  origin: "DEL",
  destination: "BOM",
  label: "Delhi — Mumbai",
  basketWeight: 1,
  baselineFare: 8000,
};

function routeQuote(day: number, totalFare: number): RouteQuote {
  const observedAt = new Date(Date.UTC(2026, 0, day));
  return {
    routeCode: route.code,
    routeLabel: route.label,
    basketWeight: 1,
    observedAt,
    departureDate: new Date(observedAt.getTime() + 30 * 86_400_000),
    bookingWindowDays: 30,
    carrier: "IndiGo",
    fareClass: "Saver",
    baseFare: totalFare - 1200,
    taxes: 1200,
    totalFare,
    availability: "available",
    sourceType: "permitted_sample",
    sourceReference: "test fixture",
    isDuplicate: false,
    isOutlier: false,
    normalizationNotes: [],
  };
}

describe("fare normalization", () => {
  it("infers missing taxes, retains unavailable records, and flags duplicate keys", () => {
    const observedAt = new Date(Date.UTC(2026, 0, 1));
    const normalized = normalizeFareQuotes([
      { routeCode: "DEL-BOM", observedAt, departureDate: new Date(Date.UTC(2026, 0, 31)), bookingWindowDays: 30, carrier: "IndiGo", baseFare: 5800, totalFare: 7000 },
      { routeCode: "DEL-BOM", observedAt, departureDate: new Date(Date.UTC(2026, 0, 31)), bookingWindowDays: 30, carrier: "IndiGo", baseFare: 5800, totalFare: 7000 },
      { routeCode: "DEL-BOM", observedAt, departureDate: new Date(Date.UTC(2026, 0, 31)), bookingWindowDays: 7, carrier: "Akasa Air", availability: "sold_out" },
    ]);

    expect(normalized[0]?.taxes).toBe(1200);
    expect(normalized[0]?.normalizationNotes.join(" ")).toContain("Missing taxes");
    expect(normalized[1]?.isDuplicate).toBe(true);
    expect(normalized[2]).toMatchObject({ availability: "sold_out", totalFare: 0 });
  });
});

describe("index construction", () => {
  it("normalizes the first seven observation days to 100 and shows subsequent fare movement", () => {
    const quotes = Array.from({ length: 8 }, (_, index) => routeQuote(index + 1, index === 7 ? 120 : 100));
    const series = calculateIndexSeries([route], quotes, { bookingWindowDays: 30 });

    expect(series.daily).toHaveLength(8);
    expect(series.daily[0]?.value).toBe(100);
    expect(series.daily[6]?.value).toBe(100);
    expect(series.daily[7]?.value).toBe(120);
  });

  it("uses the persisted-style comparator supplied to the dashboard analytics", () => {
    const quotes = Array.from({ length: 8 }, (_, index) => routeQuote(index + 1, 100 + index));
    const analytics = buildDashboardAnalytics([route], quotes, { bookingWindowDays: 30 }, [
      { monthKey: "2026-01", value: 101.5, sourceLabel: "Test comparator", note: "test" },
    ]);

    expect(analytics.benchmark[0]).toMatchObject({ comparator: 101.5, label: "Test comparator" });
  });
});
