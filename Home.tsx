import { trpc } from "@/lib/trpc";
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, BookOpen, CheckCircle2, ChevronRight,
  CircleHelp, Database, Download, Filter, Grid3X3, MapPin, PlaneTakeoff, Radar, RefreshCw, Route,
  ShieldCheck, SlidersHorizontal, Sparkles,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { buildSectorMatrix, type HeatmapMode } from "@/lib/sectorMatrix";

type View = "overview" | "heatmap" | "elasticity" | "routes" | "pipeline" | "fares" | "docs";

const formatNumber = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const formatCurrency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

const viewMeta: Record<View, { title: string; subtitle: string }> = {
  overview: { title: "Overview", subtitle: "Real-time Airfare Price Index (APIx) summary" },
  heatmap: { title: "Sector Heatmap", subtitle: "Route-level fare pressure across the representative basket" },
  elasticity: { title: "Lead-Time Elasticity", subtitle: "How the price index reacts to booking windows" },
  routes: { title: "Route Explorer", subtitle: "Inspect and apply individual representative corridors" },
  pipeline: { title: "Pipeline Monitor", subtitle: "Visible data-quality and normalization outcomes" },
  fares: { title: "Fare Data", subtitle: "Auditable quote rows served by the typed prototype API" },
  docs: { title: "API Docs", subtitle: "Transparent methodology, boundaries, and data assumptions" },
};

function dateLabel(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number; name?: string; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><span>{label}</span>{payload.map(item => <div key={item.name}><i style={{ background: item.color }} />{item.name}<strong>{item.name?.toLowerCase().includes("fare") ? formatCurrency.format(item.value ?? 0) : formatNumber.format(item.value ?? 0)}</strong></div>)}</div>;
}

function MetricCard({ label, value, detail, trend, icon: Icon }: { label: string; value: string; detail: string; trend?: number; icon: typeof Activity }) {
  return <article className="metric-card"><div className="metric-card__top"><span className="metric-icon"><Icon size={17} /></span>{trend !== undefined && <span className={trend >= 0 ? "metric-trend up" : "metric-trend down"}>{trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(trend).toFixed(1)}%</span>}</div><strong>{value}</strong><span className="metric-label">{label}</span><small>{detail}</small></article>;
}

function PageHeading({ kicker, title, detail, action }: { kicker: string; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><p>{kicker}</p><h2>{title}</h2><span>{detail}</span></div>{action}</div>;
}

export default function Home() {
  const auditParams = useMemo(() => typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search), []);
  const [view, setView] = useState<View>(() => (auditParams.get("view") as View) || "overview");
  const [routeCode, setRouteCode] = useState(() => auditParams.get("route") ?? "all");
  const [carrier, setCarrier] = useState(() => auditParams.get("carrier") ?? "all");
  const [bookingWindow, setBookingWindow] = useState(() => auditParams.get("window") ?? "all");
  const [farePage, setFarePage] = useState(0);
  const [routeExplorerCode, setRouteExplorerCode] = useState(() => auditParams.get("explore") ?? "DEL-BOM");
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("latest");

  const filterInput = useMemo(() => ({ ...(routeCode !== "all" ? { routeCode } : {}), ...(carrier !== "all" ? { carrier } : {}), ...(bookingWindow !== "all" ? { bookingWindowDays: Number(bookingWindow) } : {}) }), [routeCode, carrier, bookingWindow]);
  const fareInput = useMemo(() => ({ ...filterInput, limit: 24 }), [filterInput]);
  const routeExplorerInput = useMemo(() => ({ routeCode: routeExplorerCode, limit: 120 }), [routeExplorerCode]);
  const heatmapQuotesInput = useMemo(() => ({ limit: 1000 }), []);
  const dashboard = trpc.airfare.dashboard.useQuery(filterInput);
  const networkDashboard = trpc.airfare.dashboard.useQuery({});
  const routes = trpc.airfare.routes.useQuery();
  const methodology = trpc.airfare.methodology.useQuery();
  const fareQuotes = trpc.airfare.fareQuotes.useQuery(fareInput);
  const routeExplorerQuotesQuery = trpc.airfare.fareQuotes.useQuery(routeExplorerInput);
  const heatmapQuotesQuery = trpc.airfare.fareQuotes.useQuery(heatmapQuotesInput);
  const data = dashboard.data;
  const networkData = networkDashboard.data ?? data;
  const activeFilters = [routeCode, carrier, bookingWindow].filter(value => value !== "all").length;
  const quotes = fareQuotes.data ?? [];
  const routeExplorerQuotes = routeExplorerQuotesQuery.data ?? [];
  const heatmapQuotes = heatmapQuotesQuery.data ?? [];
  const pageSize = 8;
  const visibleQuotes = quotes.slice(farePage * pageSize, farePage * pageSize + pageSize);
  const routeExplorerData = useMemo(() => {
    const selectedRoute = networkData?.filters.routes.find(route => route.code === routeExplorerCode);
    const eligibleQuotes = routeExplorerQuotes.filter(quote => quote.availability === "available" && !quote.isDuplicate && !quote.isOutlier);
    const dailyMap = new Map<string, { total: number; count: number }>();
    const carrierMap = new Map<string, { total: number; count: number; lowest: number }>();
    eligibleQuotes.forEach(quote => {
      const day = quote.observedAt.toISOString().slice(0, 10);
      const daily = dailyMap.get(day) ?? { total: 0, count: 0 };
      daily.total += quote.totalFare;
      daily.count += 1;
      dailyMap.set(day, daily);
      const carrierEntry = carrierMap.get(quote.carrier) ?? { total: 0, count: 0, lowest: quote.totalFare };
      carrierEntry.total += quote.totalFare;
      carrierEntry.count += 1;
      carrierEntry.lowest = Math.min(carrierEntry.lowest, quote.totalFare);
      carrierMap.set(quote.carrier, carrierEntry);
    });
    const routeTrend = Array.from(dailyMap.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([periodKey, entry]) => ({ periodKey, fare: entry.total / entry.count }));
    const baseline = routeTrend[0]?.fare ?? 1;
    const trend = routeTrend.map(point => ({ ...point, index: (point.fare / baseline) * 100 }));
    const carriers = Array.from(carrierMap.entries()).map(([name, entry]) => ({ name, average: entry.total / entry.count, count: entry.count, lowest: entry.lowest })).sort((left, right) => left.average - right.average);
    return {
      label: selectedRoute?.label ?? routeExplorerCode,
      quoteCount: eligibleQuotes.length,
      dayCount: trend.length,
      carriers,
      trend,
      latestFare: trend.at(-1)?.fare ?? 0,
      change: trend.length > 1 ? ((trend.at(-1)?.fare ?? 0) / (trend[0]?.fare ?? 1) - 1) * 100 : 0,
    };
  }, [networkData, routeExplorerCode, routeExplorerQuotes]);
  const heatmapMatrix = useMemo(() => buildSectorMatrix(networkData?.filters.routes ?? [], heatmapQuotes, heatmapMode), [networkData, heatmapMode, heatmapQuotes]);

  const resetFilters = () => { setRouteCode("all"); setCarrier("all"); setBookingWindow("all"); setFarePage(0); };
  const refreshCurrentView = () => {
    if (view === "heatmap" || view === "routes") networkDashboard.refetch();
    if (view === "fares") fareQuotes.refetch();
    if (view === "docs") { methodology.refetch(); routes.refetch(); }
    dashboard.refetch();
    toast.success(`${viewMeta[view].title} refreshed`);
  };
  const selectRoute = (code: string) => { setRouteCode(code); setFarePage(0); toast.success(`${code} applied to the market lens`); };
  const openMatrixRoute = (code: string) => { setRouteExplorerCode(code); selectRoute(code); setView("routes"); };
  const exportIndexCsv = () => {
    if (!data) return;
    const rows = ["date,apix,sample_size,route_coverage", ...data.series.daily.map(point => `${point.periodKey},${point.value},${point.sampleSize},${point.coverage}`)];
    downloadCsv("apix-daily-index.csv", rows); toast.success("Index series exported");
  };
  const exportQuoteCsv = () => {
    const rows = ["route,carrier,observed_at,lead_days,base_fare,taxes,total_fare,availability,duplicate,outlier", ...quotes.map(quote => [quote.routeCode, quote.carrier, quote.observedAt.toISOString(), quote.bookingWindowDays, quote.baseFare, quote.taxes, quote.totalFare, quote.availability, quote.isDuplicate, quote.isOutlier].join(","))];
    downloadCsv("apix-fare-quotes.csv", rows); toast.success("Visible quote rows exported");
  };

  const navigation: Array<{ id: View; label: string; icon: typeof Activity }> = [
    { id: "overview", label: "Overview", icon: BarChart3 }, { id: "heatmap", label: "Sector Heatmap", icon: Grid3X3 },
    { id: "elasticity", label: "Lead-Time Elasticity", icon: Activity }, { id: "routes", label: "Route Explorer", icon: PlaneTakeoff },
    { id: "pipeline", label: "Pipeline Monitor", icon: Activity }, { id: "fares", label: "Fare Data", icon: Database }, { id: "docs", label: "API Docs", icon: BookOpen },
  ];

  const marketFilters = data && <section className="filters-panel"><div className="filters-title"><span><Filter size={17} /></span><div><strong>Market lens</strong><small>Filters apply to every analytical view</small></div></div><label>Route<select value={routeCode} onChange={event => { setRouteCode(event.target.value); setFarePage(0); }}><option value="all">All representative routes</option>{data.filters.routes.map(route => <option key={route.code} value={route.code}>{route.label}</option>)}</select></label><label>Carrier<select value={carrier} onChange={event => { setCarrier(event.target.value); setFarePage(0); }}><option value="all">All carriers</option>{data.filters.carriers.map(item => <option key={item} value={item}>{item}</option>)}</select></label><label>Advance purchase<select value={bookingWindow} onChange={event => { setBookingWindow(event.target.value); setFarePage(0); }}><option value="all">Blended lead-time basket</option>{data.filters.bookingWindows.map(window => <option key={window} value={window}>T+{window} days</option>)}</select></label><button className="text-button" onClick={resetFilters} disabled={!activeFilters}><SlidersHorizontal size={14} />Reset</button></section>;

  const overview = data && <><section className="kpi-grid"><MetricCard label="APIx index" value={formatNumber.format(data.kpis.latestIndex)} detail="Base period = 100" trend={data.kpis.change7d} icon={Activity} /><MetricCard label="Average fare" value={formatCurrency.format(data.heatmap.reduce((sum, item) => sum + item.value, 0) / Math.max(1, data.heatmap.length))} detail="Across selected routes" icon={Sparkles} /><MetricCard label="Eligible quotes" value={`${formatNumber.format(data.kpis.quoteCoverage)}%`} detail={`${formatNumber.format(data.kpis.sampleSize)} price observations`} icon={ShieldCheck} /><MetricCard label="Route coverage" value={`${data.kpis.activeRoutes}/${data.filters.routes.length}`} detail="Weighted basket represented" icon={Route} /></section><section className="content-grid content-grid--wide"><article className="panel panel--chart"><PageHeading kicker="DAILY INDEX" title="Airfare Price Index" detail="Route-weighted daily series; latest 42 observations" action={<button className="chip" onClick={() => setView("heatmap")}>View heatmap <ChevronRight size={14} /></button>} /><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.series.daily.slice(-42)} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}><defs><linearGradient id="indexFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef0b0b" stopOpacity={0.28} /><stop offset="100%" stopColor="#ef0b0b" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#3f2929" strokeDasharray="3 5" /><XAxis dataKey="periodKey" tickFormatter={dateLabel} minTickGap={38} tickLine={false} axisLine={false} tick={{ fill: "#b49d9d", fontSize: 11 }} /><YAxis domain={["auto", "auto"]} tickLine={false} axisLine={false} tick={{ fill: "#b49d9d", fontSize: 11 }} /><Tooltip content={<ChartTooltip />} labelFormatter={dateLabel} /><Area name="APIx" type="monotone" dataKey="value" stroke="#ef0b0b" strokeWidth={2.5} fill="url(#indexFill)" /></AreaChart></ResponsiveContainer></div></article><article className="panel quality-card"><span className="quality-icon"><Database size={19} /></span><p>PIPELINE HEALTH</p><strong>{formatNumber.format(data.ingestion.eligible)}</strong><small>eligible fare quotes</small><div><span>Duplicates</span><b>{data.ingestion.duplicateCount}</b></div><div><span>Outliers</span><b>{data.ingestion.outlierCount}</b></div><div><span>Unavailable</span><b>{data.ingestion.nonAvailableCount}</b></div><button onClick={() => setView("pipeline")}>Inspect pipeline <ChevronRight size={14} /></button></article></section><section className="quick-links"><button onClick={() => setView("heatmap")}><Grid3X3 size={18} /><span>Sector Heatmap</span><small>Compare corridor pressure</small></button><button onClick={() => setView("elasticity")}><Activity size={18} /><span>Lead-Time Elasticity</span><small>Examine booking premiums</small></button><button onClick={() => setView("fares")}><Database size={18} /><span>Fare Data</span><small>Review source quote rows</small></button></section></>;

  const heatmapView = networkData && <>
    <PageHeading kicker="SECTOR-WISE PRICE HEATMAP" title="Origin → destination matrix" detail="Interactive eligible total fares across the representative route basket." action={<div className="matrix-mode-control">{(["latest", "average", "minimum", "maximum"] as HeatmapMode[]).map(mode => <button key={mode} className={heatmapMode === mode ? "active" : ""} aria-pressed={heatmapMode === mode} onClick={() => setHeatmapMode(mode)}>{mode}</button>)}</div>} />
    <section className="panel matrix-panel">
      {heatmapQuotesQuery.isLoading ? <div className="matrix-query-state"><Radar className="spin" size={21} /><strong>Loading eligible route observations…</strong><span>Preparing the full-network fare matrix.</span></div> : heatmapQuotesQuery.isError ? <div className="matrix-query-state"><CircleHelp size={21} /><strong>Route observations are unavailable.</strong><span>Retry to reconstruct the current eligible-fare matrix.</span><button className="chip" onClick={() => heatmapQuotesQuery.refetch()}>Retry matrix</button></div> : !heatmapMatrix.records.length ? <div className="matrix-query-state"><CircleHelp size={21} /><strong>No eligible route observations are available.</strong><span>The representative basket has no eligible fare rows for this matrix.</span></div> : <><div className="matrix-scroll"><div className="matrix-grid" style={{ gridTemplateColumns: `72px repeat(${heatmapMatrix.airports.length}, minmax(82px, 1fr))` }}><span className="matrix-corner" />{heatmapMatrix.airports.map(airport => <span className="matrix-axis matrix-axis--top" key={`top-${airport}`}>{airport}</span>)}{heatmapMatrix.airports.map(origin => <Fragment key={origin}><span className="matrix-axis matrix-axis--side">{origin}</span>{heatmapMatrix.airports.map(destination => { const record = heatmapMatrix.lookup.get(`${origin}-${destination}`); const tone = record ? (heatmapMatrix.maxValue === heatmapMatrix.minValue ? 2 : Math.round(((record.value - heatmapMatrix.minValue) / (heatmapMatrix.maxValue - heatmapMatrix.minValue)) * 4)) : 0; return record ? <button key={`${origin}-${destination}`} className={`matrix-cell tone-${tone} ${routeCode === record.routeCode ? "selected" : ""}`} aria-label={`Open ${record.routeCode} in Route Explorer. ${formatCurrency.format(record.value)} from ${record.count} eligible observations.`} onClick={() => openMatrixRoute(record.routeCode)} title={`Open ${record.routeCode} in Route Explorer`}><strong>{formatCurrency.format(record.value)}</strong><small>{record.count} eligible</small></button> : <span key={`${origin}-${destination}`} className="matrix-cell matrix-cell--empty">{origin === destination ? "—" : "·"}</span>; })}</Fragment>)}</div></div><div className="matrix-legend"><span>Low</span>{[0, 1, 2, 3, 4].map(tone => <i key={tone} className={`tone-${tone}`} />)}<span>High</span></div></>}
    </section>
    {!heatmapQuotesQuery.isLoading && !heatmapQuotesQuery.isError && heatmapMatrix.records.length > 0 && <section className="matrix-ranking-grid"><article className="panel matrix-ranking"><PageHeading kicker="UPPER RANGE" title="Highest fare corridors" detail={`Top observed ${heatmapMode} eligible total fares`} />{heatmapMatrix.records.slice().sort((left, right) => right.value - left.value).slice(0, 5).map((record, index) => <button key={record.routeCode} aria-label={`Open ${record.routeCode} in Route Explorer`} onClick={() => openMatrixRoute(record.routeCode)}><span>{index + 1}</span><div><strong>{record.routeCode.replace("-", " → ")}</strong><small>{record.count} eligible observations</small></div><b>{formatCurrency.format(record.value)}</b></button>)}</article><article className="panel matrix-ranking matrix-ranking--low"><PageHeading kicker="LOWER RANGE" title="Lowest fare corridors" detail={`Bottom observed ${heatmapMode} eligible total fares`} />{heatmapMatrix.records.slice().sort((left, right) => left.value - right.value).slice(0, 5).map((record, index) => <button key={record.routeCode} aria-label={`Open ${record.routeCode} in Route Explorer`} onClick={() => openMatrixRoute(record.routeCode)}><span>{index + 1}</span><div><strong>{record.routeCode.replace("-", " → ")}</strong><small>{record.count} eligible observations</small></div><b>{formatCurrency.format(record.value)}</b></button>)}</article></section>}
  </>;

  const elasticityView = networkData && <><PageHeading kicker="BOOKING WINDOW" title="Lead-time elasticity" detail="Observed fare premium against the T+30 reference window" /><section className="content-grid content-grid--half"><article className="panel panel--chart"><div className="chart-area chart-area--large"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={networkData.elasticity} margin={{ top: 10, right: 10, bottom: 0, left: -24 }}><CartesianGrid vertical={false} stroke="#3f2929" strokeDasharray="3 5" /><XAxis dataKey="windowDays" tickFormatter={value => `T+${value}`} tickLine={false} axisLine={false} tick={{ fill: "#b49d9d", fontSize: 11 }} /><YAxis tickFormatter={value => `${value}%`} tickLine={false} axisLine={false} tick={{ fill: "#b49d9d", fontSize: 11 }} /><Tooltip content={<ChartTooltip />} /><Bar name="Premium" dataKey="premiumVsT30" fill="#ef0b0b" radius={[3, 3, 0, 0]} barSize={34} /></ComposedChart></ResponsiveContainer></div></article><article className="panel window-list">{networkData.elasticity.map(item => <button key={item.windowDays} onClick={() => { setBookingWindow(String(item.windowDays)); setView("overview"); }}><span>T+{item.windowDays}</span><strong>{item.premiumVsT30 >= 0 ? "+" : ""}{formatNumber.format(item.premiumVsT30)}%</strong><small>{formatCurrency.format(item.price)}</small><ChevronRight size={15} /></button>)}</article></section></>;

  const routesView = networkData && <><PageHeading kicker="ROUTE EXPLORER" title="Route fare analysis" detail="Select a representative corridor to inspect its observed fare movement and carrier dispersion." /><section className="panel route-selector-panel"><div className="route-selector-heading"><strong>Select a route</strong><span>{networkData.filters.routes.length} representative corridors</span></div><div className="route-selector-grid">{networkData.filters.routes.map(route => <button key={route.code} className={routeExplorerCode === route.code ? "route-selector-tile selected" : "route-selector-tile"} onClick={() => { setRouteExplorerCode(route.code); selectRoute(route.code); }}><strong>{route.code.replace("-", " → ")}</strong><span>{route.label}</span></button>)}</div></section><section className="route-command-bar"><div><p>ACTIVE CORRIDOR</p><h2>{routeExplorerCode.replace("-", " → ")}</h2><span><MapPin size={14} />{routeExplorerData.label}</span></div><div className="route-command-stats"><span><small>Eligible quotes</small><b>{formatNumber.format(routeExplorerData.quoteCount)}</b></span><span><small>Carriers</small><b>{formatNumber.format(routeExplorerData.carriers.length)}</b></span><span><small>Observed days</small><b>{formatNumber.format(routeExplorerData.dayCount)}</b></span></div></section><section className="route-analysis-grid"><article className="panel route-trend-panel"><PageHeading kicker="ROUTE FARE INDEX" title="Corridor trend" detail={routeExplorerData.latestFare ? `Latest mean fare ${formatCurrency.format(routeExplorerData.latestFare)}` : "Loading representative route observations"} /><div className="chart-area route-trend-chart">{routeExplorerQuotesQuery.isLoading ? <div className="route-loading">Loading route observations…</div> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={routeExplorerData.trend} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}><defs><linearGradient id="routeExplorerFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef0b0b" stopOpacity={0.3} /><stop offset="100%" stopColor="#ef0b0b" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#3f2929" strokeDasharray="3 5" /><XAxis dataKey="periodKey" tickFormatter={dateLabel} minTickGap={38} tickLine={false} axisLine={false} tick={{ fill: "#b49d9d", fontSize: 11 }} /><YAxis domain={["auto", "auto"]} tickLine={false} axisLine={false} tick={{ fill: "#b49d9d", fontSize: 11 }} /><Tooltip content={<ChartTooltip />} labelFormatter={dateLabel} /><Area name="Route index" type="monotone" dataKey="index" stroke="#ef0b0b" strokeWidth={2.5} fill="url(#routeExplorerFill)" /></AreaChart></ResponsiveContainer>}</div></article><article className="panel carrier-comparison-panel"><PageHeading kicker="CARRIER COMPARISON" title="Observed fare position" detail="Average eligible total fare for the active corridor." /><div className="carrier-list">{routeExplorerData.carriers.map((item, index) => <div className="carrier-row" key={item.name}><span className="carrier-rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{item.name}</strong><small>{formatNumber.format(item.count)} eligible quotes · low {formatCurrency.format(item.lowest)}</small></div><b>{formatCurrency.format(item.average)}</b></div>)}{!routeExplorerData.carriers.length && <div className="quote-empty">No eligible route quotes are available for this corridor.</div>}</div></article></section><article className="panel route-insight-strip"><span className={routeExplorerData.change >= 0 ? "down" : "up"}>{routeExplorerData.change >= 0 ? "+" : ""}{formatNumber.format(routeExplorerData.change)}% movement from first to latest observed route day</span><button className="text-button" onClick={() => { setRouteCode(routeExplorerCode); setView("fares"); }}>Inspect route quotes <ChevronRight size={14} /></button></article></>;

  const pipelineView = data && <><PageHeading kicker="QUALITY CONTROL" title="Pipeline Monitor" detail="Every excluded or transformed record remains visible in this prototype" action={<button className="primary-button" onClick={refreshCurrentView}><RefreshCw size={15} />Refresh status</button>} /><section className="pipeline-grid"><MetricCard label="Eligible rows" value={formatNumber.format(data.ingestion.eligible)} detail="Included in index calculation" icon={CheckCircle2} /><MetricCard label="Duplicates flagged" value={formatNumber.format(data.ingestion.duplicateCount)} detail="Retained for audit, excluded from calculation" icon={Database} /><MetricCard label="Outliers flagged" value={formatNumber.format(data.ingestion.outlierCount)} detail="Median-band exception rule" icon={Activity} /><MetricCard label="Unavailable rows" value={formatNumber.format(data.ingestion.nonAvailableCount)} detail="Sold-out or cancelled quotes" icon={CircleHelp} /></section><article className="panel rule-checklist"><PageHeading kicker="NORMALIZATION RULES" title="Visible data quality decisions" detail="No source record is silently dropped or overwritten." /><div><span><CheckCircle2 size={16} />Missing taxes are inferred as total less base fare.</span><span><CheckCircle2 size={16} />Duplicates are preserved and excluded from the index.</span><span><CheckCircle2 size={16} />Sold-out and cancelled rows remain in coverage reporting.</span><span><CheckCircle2 size={16} />Outliers are flagged under an auditable median-band rule.</span></div><button className="chip" onClick={() => setView("docs")}>Read methodology <ChevronRight size={14} /></button></article></>;

  const faresView = data && <><PageHeading kicker="SOURCE QUOTES" title="Fare Data" detail={`Showing ${quotes.length} recent typed API rows; filters apply immediately`} action={<button className="primary-button" onClick={exportQuoteCsv}><Download size={15} />Export CSV</button>} /><article className="panel quote-panel"><div className="quote-table"><div className="quote-row quote-row--head"><span>Observed</span><span>Route</span><span>Carrier</span><span>Lead</span><span>Base</span><span>Taxes</span><span>Total</span><span>Status</span></div>{fareQuotes.isLoading ? <div className="quote-empty">Loading quote records…</div> : visibleQuotes.map(quote => <div className="quote-row" key={`${quote.routeCode}-${quote.observedAt.toISOString()}-${quote.carrier}-${quote.bookingWindowDays}`}><span>{dateLabel(quote.observedAt.toISOString().slice(0, 10))}</span><strong>{quote.routeCode}</strong><span>{quote.carrier}</span><span>T+{quote.bookingWindowDays}</span><span>{formatCurrency.format(quote.baseFare)}</span><span>{formatCurrency.format(quote.taxes)}</span><strong>{formatCurrency.format(quote.totalFare)}</strong><span className={quote.availability === "available" ? "status-ok" : "status-muted"}>{quote.availability === "available" ? "Eligible" : quote.availability}</span></div>)}</div><div className="table-pagination"><span>Page {farePage + 1} of {Math.max(1, Math.ceil(quotes.length / pageSize))}</span><div><button onClick={() => setFarePage(page => Math.max(0, page - 1))} disabled={farePage === 0}>Previous</button><button onClick={() => setFarePage(page => Math.min(Math.ceil(quotes.length / pageSize) - 1, page + 1))} disabled={(farePage + 1) * pageSize >= quotes.length}>Next</button></div></div></article></>;

  const docsView = <><PageHeading kicker="AUDITABLE BY DESIGN" title="API & methodology notes" detail="Transparent assumptions for a permissioned-data prototype" /><section className="docs-grid"><article className="panel doc-card"><span>01</span><h3>Representative basket</h3><p>Seven domestic corridors carry explicit route weights which are visible to reviewers.</p><div>{routes.data?.map(route => <small key={route.code}>{route.code} <b>{(Number(route.basketWeight) * 100).toFixed(0)}%</b></small>)}</div></article><article className="panel doc-card"><span>02</span><h3>Price observation</h3><p>{methodology.data?.routeAggregation ?? "Eligible total fares are normalized before aggregation."}</p><small>Total fare = base fare + taxes</small></article><article className="panel doc-card"><span>03</span><h3>Index construction</h3><p>{methodology.data?.baseline ?? "The selected base period is normalized to 100."}</p><small>Daily, weekly, and monthly values</small></article><article className="panel doc-card doc-card--dark"><span>04</span><h3>Ethical boundary</h3><p>{methodology.data?.dataBoundary ?? "Only permitted inputs are accepted."}</p><small><ShieldCheck size={14} /> No automated collection</small><small><ShieldCheck size={14} /> No anti-bot circumvention</small></article></section><article className="panel docs-rules"><PageHeading kicker="NORMALIZATION" title="Source data is kept inspectable" detail="Quality rules are stated in the interface and testable through the typed API." /><div><span>Missing taxes<b>Inferred and noted</b></span><span>Duplicates<b>Flagged and excluded</b></span><span>Unavailable rows<b>Retained for coverage</b></span><span>Outliers<b>Flagged using median-band logic</b></span></div></article></>;

  const viewContent: Record<View, React.ReactNode> = { overview, heatmap: heatmapView, elasticity: elasticityView, routes: routesView, pipeline: pipelineView, fares: faresView, docs: docsView };

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span><Radar size={20} /></span><div><strong>APIx</strong><small>Airfare Price Index</small></div></div><nav>{navigation.map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => setView(item.id)}><Icon size={18} /><span>{item.label}</span></button>; })}</nav><div className="sidebar-status"><i />Prototype data only<br /><small>Transparent, permissioned-style fixtures</small></div></aside><main className="workspace"><header className="topbar"><div><h1>{viewMeta[view].title}</h1><p>{viewMeta[view].subtitle}</p></div><div><span className="last-updated">Updated {data?.kpis.latestPeriod ?? "…"}</span><button className="icon-button" onClick={refreshCurrentView} disabled={dashboard.isFetching} title={`Refresh ${viewMeta[view].title}`}><RefreshCw size={17} className={dashboard.isFetching ? "spin" : ""} /></button><button className="export-button" onClick={view === "fares" ? exportQuoteCsv : exportIndexCsv} disabled={!data}><Download size={16} />Export</button></div></header>{dashboard.isLoading ? <div className="loading-state"><Radar className="spin" size={25} /><p>Preparing fare analytics…</p></div> : dashboard.isError || !data ? <div className="error-state"><CircleHelp size={26} /><div><strong>Analytics are temporarily unavailable.</strong><p>Refresh the prototype to retry loading the sample series.</p></div><button onClick={refreshCurrentView}>Retry</button></div> : <section className="page-content">{view !== "pipeline" && view !== "docs" && marketFilters}{viewContent[view]}</section>}</main></div>;
}

function downloadCsv(filename: string, rows: string[]) {
  const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
