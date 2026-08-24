export type HeatmapMode = "latest" | "average" | "minimum" | "maximum";

export type MatrixRoute = { code: string };

export type MatrixQuote = {
  routeCode: string;
  observedAt: Date;
  totalFare: number;
  availability: string;
  isDuplicate: boolean;
  isOutlier: boolean;
};

export type SectorMatrixRecord = {
  routeCode: string;
  origin: string;
  destination: string;
  value: number;
  count: number;
};

export function buildSectorMatrix(routes: MatrixRoute[], quotes: MatrixQuote[], mode: HeatmapMode) {
  const airports = Array.from(new Set(routes.flatMap(route => route.code.split("-")))).sort();
  const records = routes.flatMap<SectorMatrixRecord>(route => {
    const eligible = quotes.filter(quote => quote.routeCode === route.code && quote.availability === "available" && !quote.isDuplicate && !quote.isOutlier);
    if (!eligible.length) return [];

    const totalFares = eligible.map(quote => quote.totalFare);
    const latestTime = Math.max(...eligible.map(quote => quote.observedAt.getTime()));
    const latestQuotes = eligible.filter(quote => quote.observedAt.getTime() === latestTime);
    const value = mode === "latest" ? latestQuotes.reduce((sum, quote) => sum + quote.totalFare, 0) / latestQuotes.length
      : mode === "average" ? totalFares.reduce((sum, fare) => sum + fare, 0) / totalFares.length
        : mode === "minimum" ? Math.min(...totalFares) : Math.max(...totalFares);
    const [origin, destination] = route.code.split("-");
    return [{ routeCode: route.code, origin, destination, value, count: eligible.length }];
  });
  const values = records.map(record => record.value);

  return {
    airports,
    records,
    lookup: new Map(records.map(record => [`${record.origin}-${record.destination}`, record])),
    minValue: values.length ? Math.min(...values) : 0,
    maxValue: values.length ? Math.max(...values) : 0,
  };
}
