import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getBacktestComparison, getPrototypeAnalytics, listFareQuotes } from "../airfare/db";

const filterSchema = z.object({
  routeCode: z.string().min(3).max(16).optional(),
  carrier: z.string().min(2).max(60).optional(),
  bookingWindowDays: z.number().int().positive().optional(),
});

export const airfareRouter = router({
  dashboard: publicProcedure.input(filterSchema.optional()).query(async ({ input }) => {
    const { analytics } = await getPrototypeAnalytics(input ?? {});
    return analytics;
  }),
  index: publicProcedure.input(filterSchema.optional()).query(async ({ input }) => {
    const { analytics } = await getPrototypeAnalytics(input ?? {});
    return { kpis: analytics.kpis, series: analytics.series };
  }),
  routes: publicProcedure.query(async () => {
    const { routes } = await getPrototypeAnalytics();
    return routes;
  }),
  fareQuotes: publicProcedure
    .input(filterSchema.extend({ limit: z.number().int().min(1).max(1000).default(100) }).optional())
    .query(async ({ input }) => listFareQuotes(input ?? {}, input?.limit ?? 100)),
  backtest: publicProcedure.input(filterSchema.optional()).query(async ({ input }) => getBacktestComparison(input ?? {})),
  methodology: publicProcedure.query(() => ({
    baseline: "The first seven available observation days in the selected series are normalized to 100 at the route level.",
    routeAggregation: "Within each route-date, median eligible total fares are weighted across T+1, T+7, T+15, T+30 and T+45 booking windows. Route relatives are then aggregated using the displayed basket weights.",
    exclusions: "Sold-out, cancelled, duplicate and median-band outlier records remain visible for audit but are excluded from the index calculation.",
    dataBoundary: "This deployment includes only illustrative permitted/sample fixtures. It does not collect from airline or OTA sites and is designed to accept lawful, permissioned source feeds later.",
  })),
});
