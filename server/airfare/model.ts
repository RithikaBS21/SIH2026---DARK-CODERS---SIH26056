export const BOOKING_WINDOWS = [1, 7, 15, 30, 45] as const;
export const WINDOW_WEIGHTS: Record<number, number> = {
  1: 0.15,
  7: 0.25,
  15: 0.25,
  30: 0.2,
  45: 0.15,
};

export type Availability = "available" | "sold_out" | "cancelled" | "unknown";

export type PrototypeRoute = {
  code: string;
  origin: string;
  destination: string;
  label: string;
  basketWeight: number;
  baselineFare: number;
};

export const PROTOTYPE_ROUTES: PrototypeRoute[] = [
  { code: "DEL-BOM", origin: "DEL", destination: "BOM", label: "Delhi — Mumbai", basketWeight: 0.22, baselineFare: 8410 },
  { code: "DEL-BLR", origin: "DEL", destination: "BLR", label: "Delhi — Bengaluru", basketWeight: 0.18, baselineFare: 8720 },
  { code: "BOM-BLR", origin: "BOM", destination: "BLR", label: "Mumbai — Bengaluru", basketWeight: 0.16, baselineFare: 7320 },
  { code: "DEL-CCU", origin: "DEL", destination: "CCU", label: "Delhi — Kolkata", basketWeight: 0.12, baselineFare: 7840 },
  { code: "BLR-HYD", origin: "BLR", destination: "HYD", label: "Bengaluru — Hyderabad", basketWeight: 0.11, baselineFare: 6110 },
  { code: "MAA-DEL", origin: "MAA", destination: "DEL", label: "Chennai — Delhi", basketWeight: 0.12, baselineFare: 8260 },
  { code: "BOM-GOI", origin: "BOM", destination: "GOI", label: "Mumbai — Goa", basketWeight: 0.09, baselineFare: 5340 },
];

export type RawFareQuote = {
  routeCode: string;
  observedAt: Date;
  departureDate: Date;
  bookingWindowDays: number;
  carrier: string;
  fareClass?: string;
  baseFare?: number;
  taxes?: number;
  totalFare?: number;
  availability?: Availability;
  sourceType?: "permitted_sample" | "manual_upload";
  sourceReference?: string;
};

export type NormalizedFareQuote = Required<Omit<RawFareQuote, "baseFare" | "taxes" | "totalFare" | "availability" | "fareClass" | "sourceType" | "sourceReference">> & {
  baseFare: number;
  taxes: number;
  totalFare: number;
  availability: Availability;
  fareClass: string;
  sourceType: "permitted_sample" | "manual_upload";
  sourceReference: string;
  isDuplicate: boolean;
  isOutlier: boolean;
  normalizationNotes: string[];
};

export type AnalyticsFilter = {
  routeCode?: string;
  carrier?: string;
  bookingWindowDays?: number;
};

export type RouteQuote = Omit<NormalizedFareQuote, "routeCode"> & {
  routeCode: string;
  routeLabel: string;
  basketWeight: number;
};

const round = (value: number) => Math.round(value * 100) / 100;
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const median = (values: number[]) => {
  const ordered = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!ordered.length) return 0;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
};
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function quoteKey(quote: RawFareQuote) {
  return [quote.routeCode, dateKey(quote.observedAt), quote.bookingWindowDays, quote.carrier.trim().toLowerCase(), quote.fareClass ?? "Saver"].join("|");
}

/** Normalizes permitted/sample input without contacting third-party booking sites. */
export function normalizeFareQuotes(rawQuotes: RawFareQuote[]): NormalizedFareQuote[] {
  const dedupe = new Map<string, number>();
  const normalized = rawQuotes.map((raw, index) => {
    const availability = raw.availability ?? "available";
    const notes: string[] = [];
    const suppliedBase = Math.max(0, raw.baseFare ?? 0);
    const suppliedTotal = Math.max(0, raw.totalFare ?? 0);
    let taxes = raw.taxes;

    if (availability !== "available") {
      notes.push("Non-available record retained for coverage reporting and excluded from pricing.");
      return {
        routeCode: raw.routeCode,
        observedAt: raw.observedAt,
        departureDate: raw.departureDate,
        bookingWindowDays: raw.bookingWindowDays,
        carrier: raw.carrier.trim(),
        fareClass: raw.fareClass ?? "Saver",
        baseFare: 0,
        taxes: 0,
        totalFare: 0,
        availability,
        sourceType: raw.sourceType ?? "permitted_sample",
        sourceReference: raw.sourceReference ?? "Prototype permitted/sample fixture",
        isDuplicate: false,
        isOutlier: false,
        normalizationNotes: notes,
      };
    }

    if (taxes === undefined || taxes === null) {
      taxes = Math.max(0, suppliedTotal - suppliedBase);
      notes.push("Missing taxes inferred as total fare less base fare.");
    }
    let totalFare = suppliedTotal || suppliedBase + taxes;
    if (Math.abs(totalFare - (suppliedBase + taxes)) > 1) {
      totalFare = suppliedBase + taxes;
      notes.push("Total fare reconciled to the sum of base fare and taxes.");
    }

    const result: NormalizedFareQuote = {
      routeCode: raw.routeCode,
      observedAt: raw.observedAt,
      departureDate: raw.departureDate,
      bookingWindowDays: raw.bookingWindowDays,
      carrier: raw.carrier.trim(),
      fareClass: raw.fareClass ?? "Saver",
      baseFare: round(suppliedBase),
      taxes: round(taxes),
      totalFare: round(totalFare),
      availability,
      sourceType: raw.sourceType ?? "permitted_sample",
      sourceReference: raw.sourceReference ?? "Prototype permitted/sample fixture",
      isDuplicate: false,
      isOutlier: false,
      normalizationNotes: notes,
    };
    const key = quoteKey(raw);
    const prior = dedupe.get(key);
    if (prior === undefined) {
      dedupe.set(key, index);
    } else {
      result.isDuplicate = true;
      result.normalizationNotes.push("Duplicate quote key retained and flagged; excluded from index calculation.");
    }
    return result;
  });

  const groups = new Map<string, NormalizedFareQuote[]>();
  normalized.filter(quote => quote.availability === "available" && !quote.isDuplicate).forEach(quote => {
    const key = `${quote.routeCode}|${dateKey(quote.observedAt)}|${quote.bookingWindowDays}`;
    groups.set(key, [...(groups.get(key) ?? []), quote]);
  });
  groups.forEach(group => {
    const center = median(group.map(quote => quote.totalFare));
    group.forEach(quote => {
      if (center > 0 && (quote.totalFare > center * 1.75 || quote.totalFare < center * 0.55)) {
        quote.isOutlier = true;
        quote.normalizationNotes.push("Flagged outside the prototype median-band outlier threshold.");
      }
    });
  });
  return normalized;
}

/** Deterministic illustrative records for exercising the prototype. These are not market observations. */
export function createPrototypeSampleQuotes(): NormalizedFareQuote[] {
  const raw: RawFareQuote[] = [];
  const carriers = ["IndiGo", "Air India", "Akasa Air"];
  const start = Date.UTC(2026, 0, 5);
  for (let day = 0; day < 84; day += 1) {
    for (let routeIndex = 0; routeIndex < PROTOTYPE_ROUTES.length; routeIndex += 1) {
      const route = PROTOTYPE_ROUTES[routeIndex]!;
      for (const windowDays of BOOKING_WINDOWS) {
        carriers.forEach((carrier, carrierIndex) => {
          const token = day * 101 + routeIndex * 17 + windowDays * 7 + carrierIndex;
          const observedAt = new Date(start + day * 86_400_000);
          const departureDate = new Date(observedAt.getTime() + windowDays * 86_400_000);
          const timeFactor = 1 + 0.095 * Math.sin((day + routeIndex * 2) / 8) + 0.035 * Math.cos(day / 3.7);
          const leadFactor = ({ 1: 1.52, 7: 1.26, 15: 1.1, 30: 1, 45: 0.92 } as Record<number, number>)[windowDays]!;
          const carrierFactor = [1, 1.065, 0.94][carrierIndex]!;
          let totalFare = route.baselineFare * timeFactor * leadFactor * carrierFactor;
          if (token % 163 === 0) totalFare *= 2.55;
          const availability: Availability = token % 191 === 0 ? "cancelled" : token % 97 === 0 ? "sold_out" : "available";
          const baseFare = availability === "available" ? round(totalFare * 0.81) : undefined;
          const taxes = token % 113 === 0 ? undefined : availability === "available" ? round(totalFare - (baseFare ?? 0)) : undefined;
          raw.push({
            routeCode: route.code,
            observedAt,
            departureDate,
            bookingWindowDays: windowDays,
            carrier,
            fareClass: "Saver",
            baseFare,
            taxes,
            totalFare: availability === "available" ? round(totalFare) : undefined,
            availability,
            sourceType: "permitted_sample",
            sourceReference: "Prototype illustrative fare fixture v1",
          });
          if (token % 137 === 0) {
            raw.push({ ...raw[raw.length - 1]!, totalFare: availability === "available" ? round(totalFare * 1.01) : undefined });
          }
        });
      }
    }
  }
  return normalizeFareQuotes(raw);
}

function filteredQuotes(quotes: RouteQuote[], filter: AnalyticsFilter) {
  return quotes.filter(quote =>
    (!filter.routeCode || quote.routeCode === filter.routeCode) &&
    (!filter.carrier || quote.carrier === filter.carrier) &&
    (!filter.bookingWindowDays || quote.bookingWindowDays === filter.bookingWindowDays)
  );
}

export type IndexPoint = { periodKey: string; value: number; sampleSize: number; coverage: number };
export type BenchmarkPoint = { monthKey: string; value: number; sourceLabel: string; note: string | null };

export function calculateIndexSeries(routes: PrototypeRoute[], quotes: RouteQuote[], filter: AnalyticsFilter = {}) {
  const selected = filteredQuotes(quotes, filter).filter(quote => quote.availability === "available" && !quote.isDuplicate && !quote.isOutlier);
  const routeByCode = new Map(routes.map(route => [route.code, route]));
  const dailyWindowPrices = new Map<string, number[]>();
  selected.forEach(quote => {
    const key = `${dateKey(quote.observedAt)}|${quote.routeCode}|${quote.bookingWindowDays}`;
    dailyWindowPrices.set(key, [...(dailyWindowPrices.get(key) ?? []), quote.totalFare]);
  });
  const dailyRoutePrices = new Map<string, { date: string; routeCode: string; price: number; sampleSize: number }>();
  dailyWindowPrices.forEach((prices, key) => {
    const [date, routeCode, window] = key.split("|");
    const routeKey = `${date}|${routeCode}`;
    const previous = dailyRoutePrices.get(routeKey) ?? { date: date!, routeCode: routeCode!, price: 0, sampleSize: 0 };
    const windowWeight = filter.bookingWindowDays ? 1 : WINDOW_WEIGHTS[Number(window)] ?? 0;
    previous.price += median(prices) * windowWeight;
    previous.sampleSize += prices.length;
    dailyRoutePrices.set(routeKey, previous);
  });
  const uniqueDates = Array.from(new Set(Array.from(dailyRoutePrices.values()).map(item => item.date))).sort();
  const baselineDates = new Set(uniqueDates.slice(0, 7));
  const baselineByRoute = new Map<string, number[]>();
  dailyRoutePrices.forEach(item => {
    if (baselineDates.has(item.date)) baselineByRoute.set(item.routeCode, [...(baselineByRoute.get(item.routeCode) ?? []), item.price]);
  });
  const routeBaselines = new Map(Array.from(baselineByRoute.entries()).map(([routeCode, values]) => [routeCode, average(values)]));
  const daily: IndexPoint[] = uniqueDates.map(date => {
    const routeRows = Array.from(dailyRoutePrices.values()).filter(item => item.date === date && routeBaselines.has(item.routeCode));
    const availableWeight = routeRows.reduce((sum, item) => sum + (routeByCode.get(item.routeCode)?.basketWeight ?? 0), 0);
    const value = routeRows.reduce((sum, item) => {
      const route = routeByCode.get(item.routeCode);
      const baseline = routeBaselines.get(item.routeCode) ?? 1;
      return sum + ((route?.basketWeight ?? 0) / (availableWeight || 1)) * (item.price / baseline) * 100;
    }, 0);
    return {
      periodKey: date,
      value: round(value),
      sampleSize: routeRows.reduce((sum, item) => sum + item.sampleSize, 0),
      coverage: round(availableWeight),
    };
  });

  const aggregate = (keyFor: (date: string) => string) => {
    const byPeriod = new Map<string, IndexPoint[]>();
    daily.forEach(point => byPeriod.set(keyFor(point.periodKey), [...(byPeriod.get(keyFor(point.periodKey)) ?? []), point]));
    return Array.from(byPeriod.entries()).map(([periodKey, points]: [string, IndexPoint[]]) => ({
      periodKey,
      value: round(average(points.map(point => point.value))),
      sampleSize: points.reduce((sum, point) => sum + point.sampleSize, 0),
      coverage: round(average(points.map(point => point.coverage))),
    })).sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  };
  return { daily, weekly: aggregate(isoWeekKey), monthly: aggregate(date => date.slice(0, 7)) };
}

function isoWeekKey(date: string) {
  const target = new Date(`${date}T00:00:00.000Z`);
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function buildDashboardAnalytics(
  routes: PrototypeRoute[],
  quotes: RouteQuote[],
  filter: AnalyticsFilter = {},
  benchmarkPoints: BenchmarkPoint[] = []
) {
  const series = calculateIndexSeries(routes, quotes, filter);
  const latest = series.daily.at(-1) ?? { value: 100, sampleSize: 0, coverage: 0, periodKey: "—" };
  const previous = series.daily.at(-8) ?? latest;
  const selected = filteredQuotes(quotes, filter);
  const eligible = selected.filter(quote => quote.availability === "available" && !quote.isDuplicate && !quote.isOutlier);
  const latestDate = series.daily.at(-1)?.periodKey;
  const latestQuotes = eligible.filter(quote => dateKey(quote.observedAt) === latestDate);
  const heatmap = routes.map(route => {
    const latestRouteQuotes = latestQuotes.filter(quote => quote.routeCode === route.code);
    const current = median(latestRouteQuotes.map(quote => quote.totalFare));
    const historical = eligible.filter(quote => quote.routeCode === route.code).map(quote => quote.totalFare);
    const averageFare = average(historical);
    return { routeCode: route.code, routeLabel: route.label, value: round(current || averageFare), change: round(((current || averageFare) / (averageFare || 1) - 1) * 100), weight: route.basketWeight };
  });
  const elasticity = BOOKING_WINDOWS.map(windowDays => {
    const windowQuotes = eligible.filter(quote => quote.bookingWindowDays === windowDays);
    const price = average(windowQuotes.map(quote => quote.totalFare));
    const anchor = average(eligible.filter(quote => quote.bookingWindowDays === 30).map(quote => quote.totalFare));
    return { windowDays, price: round(price), premiumVsT30: round(((price / (anchor || 1)) - 1) * 100), sampleSize: windowQuotes.length };
  });
  const benchmarkByMonth = new Map(benchmarkPoints.map(point => [point.monthKey, point]));
  const monthlyBenchmark = series.monthly.map(point => {
    const benchmark = benchmarkByMonth.get(point.periodKey);
    const comparator = benchmark?.value ?? null;
    return {
    monthKey: point.periodKey,
    apix: point.value,
    comparator,
    gap: comparator === null ? null : round(point.value - comparator),
    label: benchmark?.sourceLabel ?? "No prototype comparator loaded",
    note: benchmark?.note ?? "",
  };
  });
  return {
    filters: {
      routes: routes.map(route => ({ code: route.code, label: route.label })),
      carriers: Array.from(new Set(quotes.map(quote => quote.carrier))).sort(),
      bookingWindows: [...BOOKING_WINDOWS],
    },
    kpis: {
      latestIndex: latest.value,
      change7d: round(latest.value - previous.value),
      quoteCoverage: round((eligible.length / (selected.length || 1)) * 100),
      activeRoutes: heatmap.filter(item => item.value > 0).length,
      latestPeriod: latest.periodKey,
      sampleSize: latest.sampleSize,
    },
    series,
    heatmap,
    elasticity,
    benchmark: monthlyBenchmark,
    ingestion: {
      received: quotes.length,
      eligible: eligible.length,
      duplicateCount: quotes.filter(quote => quote.isDuplicate).length,
      outlierCount: quotes.filter(quote => quote.isOutlier).length,
      nonAvailableCount: quotes.filter(quote => quote.availability !== "available").length,
    },
  };
}
