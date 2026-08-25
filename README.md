# Airfare Index Prototype

This full-stack prototype measures **Indian domestic airfare movement** through a transparent route basket, normalized fare quotes, and a route-weighted Airfare Price Index (APIx). It is an analytical demonstration rather than a live fare-monitoring service. The deployed data consists solely of deterministic illustrative fixtures that exercise the full ingestion, audit, calculation, API, and dashboard flow.

> **Data boundary.** The prototype does not crawl airline or online-travel-agent websites, does not evade anti-bot controls or CAPTCHAs, and does not present its fixtures as observed market prices. Production inputs must be obtained through permissioned, contractual, public, or manually supplied sources that comply with applicable terms and law.

## What is included

| Capability | Prototype implementation |
| --- | --- |
| Representative basket | Seven domestic city-pairs with visible route weights summing to 100%. |
| Fare quote model | Origin–destination route, observation and departure timestamps, booking window, carrier, fare class, base fare, taxes, total fare, availability, and source metadata. |
| Data quality workflow | Missing-tax inference, total-fare reconciliation, duplicate flags, availability retention, and median-band outlier flags. |
| APIx calculation | Daily route relatives normalized to a 100-point base; daily values roll up to weekly and monthly series. |
| Analytics | KPI cards, time series, color-coded route heatmap, lead-time chart, data-quality counters, and a back-testing table. |
| Typed integration surface | tRPC procedures for dashboard, index series, routes, fare quotes, benchmark comparison, and methodology. |

## Prototype methodology

The index uses each route’s **median eligible total fare** on a given observation date. The method blends the T+1, T+7, T+15, T+30, and T+45 advance-purchase windows using fixed transparent weights of 15%, 25%, 25%, 20%, and 15%, respectively. A route’s first seven available observation days establish its within-series reference value of 100. The APIx then combines route relatives using the basket weights shown in the application.

| Rule | Treatment | Reason |
| --- | --- | --- |
| Missing tax value | Set to total fare less base fare; the record carries a note. | Retains a usable total fare without hiding the assumption. |
| Duplicate quote key | Retained and flagged; excluded from the calculation. | Preserves an audit trail while preventing double counting. |
| Sold out or cancelled | Retained for availability coverage; excluded from pricing. | Separates market availability from an observable purchasable price. |
| Median-band outlier | Flagged when far outside its route-date-window median band; excluded from pricing. | Reduces the influence of exceptional records without deletion. |

The dashboard’s monthly comparator is explicitly labelled **“Illustrative DGCA-style monthly comparator.”** It is stored in the prototype database only to demonstrate the back-testing interface; it is not DGCA data and must not be interpreted as an official series. DGCA publishes city-pair domestic traffic statistics, which can inform a later transparent basket-rebalancing workflow.[1]

## Data and ethics boundary

The ingestion model is designed for sample files, authorized partner feeds, manual uploads, or other documented lawful inputs. It deliberately omits any web-automation collector. A future operational collector should document source permission, request rate limits, source attribution, user-agent policy, terms review, retention period, and an auditable source reference for every quote. The U.S. Bureau of Labor Statistics provides an example of why consistently defined airfare observations matter for price measurement, although it is not a data source for this India-focused prototype.[2]

## Local development

Install dependencies with `pnpm install`, start the development server with `pnpm dev`, execute the automated checks with `pnpm test`, and run `pnpm check` for a TypeScript check. The database schema lives in `drizzle/schema.ts`. The prototype loads its fixture dataset into the database only when the typed airfare procedures are first requested.

For auditable review, the dashboard also accepts direct-view parameters. Append `?view=methodology` to open the methodology view, and use `route`, `carrier`, and `window` parameters such as `?route=DEL-BOM&carrier=IndiGo&window=7` to load a filtered market lens.

| Procedure | Purpose |
| --- | --- |
| `airfare.dashboard` | Filtered KPIs, daily/weekly/monthly index data, heatmap data, lead-time analysis, benchmark series, and data-quality counts. |
| `airfare.index` | APIx headline KPIs and time series. |
| `airfare.routes` | Transparent route basket, including weights and baseline fares. |
| `airfare.fareQuotes` | Auditable fare-quote rows with optional filter criteria. |
| `airfare.backtest` | Monthly APIx versus the stored illustrative comparator. |
| `airfare.methodology` | Baseline, aggregation, exclusion, and ethical-boundary statements. |

## References

[1] [Directorate General of Civil Aviation, *City Pair Wise Monthly Domestic Passenger Traffic Statistics*](https://www.dgca.gov.in/digigov-portal/?page=monthlyStatistics/259/4751/html&main259/4184/servicename)

[2] [U.S. Bureau of Labor Statistics, *Measuring Price Change in the CPI: Airline Fares*](https://www.bls.gov/cpi/factsheets/airline-fares.htm)
