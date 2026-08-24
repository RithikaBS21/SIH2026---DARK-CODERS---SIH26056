import { describe, expect, it } from "vitest";
import { buildSectorMatrix, type MatrixQuote } from "./sectorMatrix";

const routes = [{ code: "DEL-BOM" }, { code: "BOM-BLR" }];

function quote(routeCode: string, observedAt: string, totalFare: number, overrides: Partial<MatrixQuote> = {}): MatrixQuote {
  return {
    routeCode,
    observedAt: new Date(observedAt),
    totalFare,
    availability: "available",
    isDuplicate: false,
    isOutlier: false,
    ...overrides,
  };
}

describe("buildSectorMatrix", () => {
  const quotes = [
    quote("DEL-BOM", "2026-03-01T00:00:00Z", 8000),
    quote("DEL-BOM", "2026-03-02T00:00:00Z", 9000),
    quote("DEL-BOM", "2026-03-02T00:00:00Z", 11000),
    quote("DEL-BOM", "2026-03-03T00:00:00Z", 5000, { isOutlier: true }),
    quote("BOM-BLR", "2026-03-02T00:00:00Z", 7000),
    quote("BOM-BLR", "2026-03-03T00:00:00Z", 4500, { availability: "sold_out" }),
  ];

  it("uses only eligible observations and averages the latest observation timestamp", () => {
    const matrix = buildSectorMatrix(routes, quotes, "latest");

    expect(matrix.airports).toEqual(["BLR", "BOM", "DEL"]);
    expect(matrix.lookup.get("DEL-BOM")).toMatchObject({ value: 10000, count: 3 });
    expect(matrix.lookup.get("BOM-BLR")).toMatchObject({ value: 7000, count: 1 });
  });

  it("switches between average, minimum, and maximum metrics without including excluded rows", () => {
    expect(buildSectorMatrix(routes, quotes, "average").lookup.get("DEL-BOM")?.value).toBeCloseTo(9333.33, 2);
    expect(buildSectorMatrix(routes, quotes, "minimum").lookup.get("DEL-BOM")?.value).toBe(8000);
    expect(buildSectorMatrix(routes, quotes, "maximum").lookup.get("DEL-BOM")?.value).toBe(11000);
  });
});
