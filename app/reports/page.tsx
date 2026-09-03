"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth-context";
import { getReportsData, exportReportPdf, type ReportData } from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

// ── Colour palette (no external deps) ────────────────────────────
const COLORS = ["#15845d", "#4caf50", "#2196f3", "#ff9800", "#9c27b0", "#f44336"];

// ── Bar chart ─────────────────────────────────────────────────────
function BarChart({
  data,
  labelKey,
  valueKey,
}: {
  data: Record<string, unknown>[];
  labelKey: string;
  valueKey: string;
}) {
  const max = Math.max(...data.map((d) => d[valueKey] as number), 1);
  return (
    <div className="bar-chart" role="list" aria-label="Bar chart">
      {data.map((d, i) => (
        <div key={i} className="bar-row" role="listitem">
          <span className="bar-label" title={String(d[labelKey])}>
            {String(d[labelKey])}
          </span>
          <div className="bar-track" aria-hidden="true">
            <div
              className="bar-fill"
              style={{
                width: `${((d[valueKey] as number) / max) * 100}%`,
                background: COLORS[i % COLORS.length],
              }}
            />
          </div>
          <span className="bar-value" aria-label={`${d[labelKey]}: ${d[valueKey]}`}>
            {String(d[valueKey])}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Donut chart ───────────────────────────────────────────────────
function DonutChart({
  data,
  labelKey,
  valueKey,
}: {
  data: Record<string, unknown>[];
  labelKey: string;
  valueKey: string;
}) {
  const total = data.reduce((sum, d) => sum + (d[valueKey] as number), 0) || 1;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className="donut-wrapper">
      <svg
        viewBox="0 0 160 160"
        className="donut-svg"
        role="img"
        aria-label="Donut chart"
      >
        {/* Background ring */}
        <circle
          cx="80" cy="80" r={radius}
          fill="none" stroke="#eef2ee" strokeWidth="24"
        />
        {data.map((d, i) => {
          const fraction = (d[valueKey] as number) / total;
          const dash = fraction * circumference;
          const offset = circumference - (cumulative / total) * circumference;
          cumulative += d[valueKey] as number;
          return (
            <circle
              key={i}
              cx="80" cy="80" r={radius}
              fill="none"
              stroke={COLORS[i % COLORS.length]}
              strokeWidth="24"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={offset}
              transform="rotate(-90 80 80)"
            >
              <title>{`${d[labelKey]}: ${d[valueKey]}`}</title>
            </circle>
          );
        })}
        <text
          x="80" y="80"
          textAnchor="middle" dy="6"
          className="donut-center-text"
        >
          {total}
        </text>
      </svg>

      <div className="donut-legend" role="list">
        {data.map((d, i) => (
          <div key={i} className="legend-item" role="listitem">
            <span
              className="legend-dot"
              style={{ background: COLORS[i % COLORS.length] }}
              aria-hidden="true"
            />
            <span className="legend-label">{String(d[labelKey])}</span>
            <span className="legend-value">{String(d[valueKey])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Line trend chart ──────────────────────────────────────────────
function LineTrend({ data }: { data: { month: string; count: number }[] }) {
  if (data.length === 0) {
    return <p className="ev-muted" style={{ fontSize: 12 }}>No data for this period.</p>;
  }

  const max = Math.max(...data.map((d) => d.count), 1);
  const W = 600;
  const H = 160;
  const stepX = data.length > 1 ? W / (data.length - 1) : W;

  const pts = data.map((d, i) => {
    const x = i * stepX;
    const y = H - (d.count / max) * (H - 20) - 10;
    return { x, y, ...d };
  });

  const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="line-chart-wrapper">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="line-chart-svg"
        preserveAspectRatio="none"
        role="img"
        aria-label="Line trend chart"
      >
        <polyline
          points={polyline}
          fill="none"
          stroke="#15845d"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="5" fill="#15845d">
            <title>{`${p.month}: ${p.count}`}</title>
          </circle>
        ))}
      </svg>
      <div className="line-chart-labels" aria-hidden="true">
        {data.map((d, i) => (
          <span key={i}>{d.month.slice(5)}</span> // show MM only to save space
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function ReportsPage() {
  const { user, loading: authLoading, accessToken } = useAuth();

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<"30" | "90" | "365">("90");
  const [exporting, setExporting] = useState(false);

  

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    getReportsData(accessToken, range)
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load reports"),
      )
      .finally(() => setLoading(false));
  }, [accessToken, range]);

  async function handleExport() {
    if (!accessToken) return;
    setExporting(true);
    try {
      const blob = await exportReportPdf(accessToken, range);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evichain-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const resolutionLabel = useMemo(
    () => (data ? `${data.avgResolutionDays.toFixed(1)} days` : "—"),
    [data],
  );

  // ── Auth loading ────────────────────────────────────────────────
  if (authLoading) {
    return <WorkspaceShell breadcrumbs={[{ label: 'Reports' }]}>
<div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}><div className="audit-loading">Loading…</div></div>
</WorkspaceShell>;
  }

  // ── Not signed in ───────────────────────────────────────────────
  if (!user) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: 'Reports' }]}>
<div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}>
        <section className="ev-empty-state" style={{ marginTop: 80 }}>
          <strong>Sign in required</strong>
          <p>You need to be logged in to view reports.</p>
          <a className="button button-primary" href="/login">Go to login</a>
        </section>
      </div>
</WorkspaceShell>
    );
  }

  // ── Data loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: 'Reports' }]}>
<div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}>
        <div className="reports-loading">
          <span className="reports-spinner" aria-hidden="true" />
          <p>Loading analytics…</p>
        </div>
      </div>
</WorkspaceShell>
    );
  }

  // ── Error ───────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: 'Reports' }]}>
<div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}>
        <div className="error-message" style={{ color: "var(--accent-danger)", border: "1px solid var(--accent-danger)", background: "rgba(244, 63, 94, 0.1)", padding: "12px", borderRadius: "6px" }} role="alert">{error || "Failed to load report data"}</div>
        <a className="button button-secondary" href="/" style={{ marginTop: 16 }}>← Back</a>
      </div>
</WorkspaceShell>
    );
  }

  // ── Main render ─────────────────────────────────────────────────
  return (
    <WorkspaceShell breadcrumbs={[{ label: 'Reports' }]}>
<div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}>
      {/* Top bar */}
      

      {/* Page header */}
      <div className="reports-page-header">
        <div>
          <p className="eyebrow" style={{ color: "var(--text-disabled)", fontFamily: "var(--font-mono)", fontSize: "12px", textTransform: "uppercase" }}>ANALYTICS</p>
          <h1 style={{ color: "var(--text-primary)", fontSize: "24px", margin: "8px 0" }}>Reports & analytics</h1>
          <p className="ev-page-sub" style={{ color: "var(--text-secondary)" }}>
            Case trends, evidence breakdown, and system insights.
          </p>
        </div>
        <div className="reports-header-actions">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as typeof range)}
            className="range-select"
            aria-label="Select time range"
          >
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
          </select>
          <button
            className="button button-primary"
            onClick={handleExport}
            disabled={exporting}
            aria-label="Export report as CSV"
          >
            {exporting
              ? <span className="loading-spinner">Exporting…</span>
              : "Export CSV ↓"}
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <section className="stats-grid" aria-label="Summary statistics">
        <div className="stat-card" style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "16px", color: "var(--text-primary)" }}>
          <span>Total cases</span>
          <strong>{String(data.totalCases).padStart(2, "0")}</strong>
          <small>In selected period</small>
        </div>
        <div className="stat-card stat-card--green">
          <span>Total evidence</span>
          <strong>{String(data.totalEvidence).padStart(2, "0")}</strong>
          <small>Files registered</small>
        </div>
        <div className="stat-card stat-card--amber">
          <span>Avg resolution</span>
          <strong style={{ fontSize: 22 }}>{resolutionLabel}</strong>
          <small>Closed cases</small>
        </div>
        <div className="stat-card stat-card--muted">
          <span>Top contributor</span>
          <strong style={{ fontSize: 16, letterSpacing: "-0.03em" }}>
            {data.topUploaders[0]?.name ?? "—"}
          </strong>
          <small>
            {data.topUploaders[0]
              ? `${data.topUploaders[0].count} upload${data.topUploaders[0].count !== 1 ? "s" : ""}`
              : "No uploads yet"}
          </small>
        </div>
      </section>

      {/* Charts grid */}
      <div className="reports-grid">
        <section className="report-card">
          <h2 style={{ color: "var(--text-primary)", fontSize: "18px", marginBottom: "16px" }}>Case volume trend</h2>
          <LineTrend data={data.casesByMonth} />
        </section>

        <section className="report-card">
          <h2 style={{ color: "var(--text-primary)", fontSize: "18px", marginBottom: "16px" }}>Evidence volume trend</h2>
          <LineTrend data={data.evidenceByMonth} />
        </section>

        <section className="report-card">
          <h2 style={{ color: "var(--text-primary)", fontSize: "18px", marginBottom: "16px" }}>Cases by status</h2>
          {data.casesByStatus.length === 0 ? (
            <p className="ev-muted" style={{ fontSize: 12 }}>No case data for this period.</p>
          ) : (
            <DonutChart
              data={data.casesByStatus as Record<string, unknown>[]}
              labelKey="status"
              valueKey="count"
            />
          )}
        </section>

        <section className="report-card">
          <h2 style={{ color: "var(--text-primary)", fontSize: "18px", marginBottom: "16px" }}>Evidence by file type</h2>
          {data.evidenceByType.length === 0 ? (
            <p className="ev-muted" style={{ fontSize: 12 }}>No evidence data for this period.</p>
          ) : (
            <DonutChart
              data={data.evidenceByType as Record<string, unknown>[]}
              labelKey="type"
              valueKey="count"
            />
          )}
        </section>

        <section className="report-card report-card--full">
          <h2 style={{ color: "var(--text-primary)", fontSize: "18px", marginBottom: "16px" }}>Top contributors</h2>
          {data.topUploaders.length === 0 ? (
            <p className="ev-muted" style={{ fontSize: 12 }}>No upload data for this period.</p>
          ) : (
            <BarChart
              data={data.topUploaders as Record<string, unknown>[]}
              labelKey="name"
              valueKey="count"
            />
          )}
        </section>
      </div>
    </div>
</WorkspaceShell>
  );
}
