"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../auth-context";
import {
  getReportsData,
  exportReportPdf,
  downloadCaseReportPdf,
  getCases,
  type ComplianceSummary,
  type CaseRecord,
} from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

// ── Activity Bar Chart ─────────────────────────────────────────────
function ActivityChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
        No system activity recorded in this period.
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "140px", padding: "16px 0 8px" }}>
      {data.map((d, i) => {
        const heightPct = Math.max(6, (d.count / max) * 100);
        return (
          <div
            key={i}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              height: "100%",
              justifyContent: "flex-end",
            }}
          >
            <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-disabled)" }}>
              {d.count}
            </span>
            <div
              style={{
                width: "100%",
                height: `${heightPct}%`,
                background: "linear-gradient(180deg, var(--brand-400), var(--brand-600))",
                borderRadius: "3px 3px 0 0",
                transition: "height 0.3s ease",
              }}
              title={`${d.date}: ${d.count} events`}
            />
            <span
              style={{
                fontSize: "9px",
                fontFamily: "var(--font-mono)",
                color: "var(--text-secondary)",
                whiteSpace: "nowrap",
                transform: data.length > 10 ? "rotate(-45deg)" : "none",
                transformOrigin: "left bottom",
                marginTop: "4px",
              }}
            >
              {d.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Reports Page Component ───────────────────────────────────

export default function ReportsPage() {
  const { user, loading: authLoading, accessToken } = useAuth();

  const [rangeDays, setRangeDays] = useState("30");
  const [data, setData] = useState<ComplianceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Case list for PDF generation
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfToast, setPdfToast] = useState<string | null>(null);

  // CSV export state
  const [exportingCsv, setExportingCsv] = useState(false);

  const fetchReports = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getReportsData(accessToken, rangeDays);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report metrics");
    } finally {
      setLoading(false);
    }
  }, [accessToken, rangeDays]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Fetch available cases for PDF exporter
  useEffect(() => {
    if (!accessToken) return;
    getCases(accessToken)
      .then((c) => {
        setCases(c);
        if (c.length > 0) setSelectedCaseId(c[0].id);
      })
      .catch(() => {});
  }, [accessToken]);

  async function handleDownloadCasePdf() {
    if (!accessToken || !selectedCaseId || generatingPdf) return;
    setGeneratingPdf(true);
    setPdfToast(null);
    try {
      const filename = await downloadCaseReportPdf(accessToken, selectedCaseId);
      setPdfToast(`Generated ${filename}`);
      setTimeout(() => setPdfToast(null), 4000);
    } catch (err) {
      setPdfToast(err instanceof Error ? err.message : "Failed to generate PDF report");
      setTimeout(() => setPdfToast(null), 5000);
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function handleExportCsv() {
    if (!accessToken || exportingCsv) return;
    setExportingCsv(true);
    try {
      const blob = await exportReportPdf(accessToken, rangeDays);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `evichain-compliance-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportingCsv(false);
    }
  }

  if (authLoading) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Compliance & Reports" }]}>
        <div style={{ padding: "32px" }}>
          <div className="skeleton" style={{ height: "40px", width: "260px", marginBottom: "20px" }} />
          <div className="skeleton" style={{ height: "200px", width: "100%" }} />
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell breadcrumbs={[{ label: "Compliance & Reports" }]}>
      <div style={{ padding: "28px", maxWidth: "1600px", margin: "0 auto" }}>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "24px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--brand-400)", textTransform: "uppercase" }}>
                COURT-READY AUDIT SYSTEM
              </span>
            </div>
            <h1 style={{ fontSize: "26px", fontWeight: 800, color: "var(--text-primary)", margin: 0, letterSpacing: "var(--tracking-tight)" }}>
              Compliance & Reporting Intelligence
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--text-secondary)" }}>
              Official chain-of-custody ledgers, case dossiers, and cryptographic evidence summaries.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <select
              className="input select"
              value={rangeDays}
              onChange={(e) => setRangeDays(e.target.value)}
              style={{ width: "150px" }}
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last 365 days</option>
            </select>

            <button
              className="btn btn-secondary btn-md"
              onClick={handleExportCsv}
              disabled={exportingCsv}
            >
              ⭳ {exportingCsv ? "Exporting…" : "Export Compliance CSV"}
            </button>
          </div>
        </div>

        {/* PDF Toast */}
        {pdfToast && (
          <div
            style={{
              padding: "10px 16px",
              background: "var(--accent-active-dim)",
              border: "1px solid var(--accent-active)",
              borderRadius: "6px",
              color: "var(--accent-active)",
              fontSize: "13px",
              fontWeight: 600,
              marginBottom: "18px",
            }}
          >
            ✓ {pdfToast}
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              padding: "14px 18px",
              background: "var(--accent-danger-dim)",
              border: "1px solid var(--accent-danger)",
              borderRadius: "8px",
              color: "var(--accent-danger)",
              marginBottom: "20px",
              fontSize: "13px",
            }}
          >
            ⚠ {error}
          </div>
        )}

        {/* 4 Core Pillars Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "18px",
            marginBottom: "24px",
          }}
        >
          {/* 1. Cases Pillar */}
          <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
                Case Dossiers
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 800, color: "var(--text-primary)" }}>
                {data?.cases?.total ?? 0}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
              <div style={{ background: "var(--surface-sunken)", padding: "8px 10px", borderRadius: "4px" }}>
                <span style={{ color: "var(--text-disabled)", display: "block", fontSize: "10.5px" }}>ACTIVE</span>
                <strong style={{ color: "var(--accent-active)", fontFamily: "var(--font-mono)", fontSize: "14px" }}>
                  {data?.cases?.active ?? 0}
                </strong>
              </div>
              <div style={{ background: "var(--surface-sunken)", padding: "8px 10px", borderRadius: "4px" }}>
                <span style={{ color: "var(--text-disabled)", display: "block", fontSize: "10.5px" }}>CLOSED</span>
                <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "14px" }}>
                  {data?.cases?.closed ?? 0}
                </strong>
              </div>
            </div>
          </div>

          {/* 2. Evidence Pillar */}
          <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--accent-active)", letterSpacing: "0.04em" }}>
                Evidence Registry
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 800, color: "var(--accent-active)" }}>
                {data?.evidence?.total ?? 0}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
              <div style={{ background: "var(--surface-sunken)", padding: "8px 10px", borderRadius: "4px" }}>
                <span style={{ color: "var(--text-disabled)", display: "block", fontSize: "10.5px" }}>VERIFIED</span>
                <strong style={{ color: "var(--accent-active)", fontFamily: "var(--font-mono)", fontSize: "14px" }}>
                  {data?.evidence?.verified ?? 0}
                </strong>
              </div>
              <div style={{ background: "var(--surface-sunken)", padding: "8px 10px", borderRadius: "4px" }}>
                <span style={{ color: "var(--text-disabled)", display: "block", fontSize: "10.5px" }}>ALERTS / FLAGGED</span>
                <strong style={{ color: "var(--accent-danger)", fontFamily: "var(--font-mono)", fontSize: "14px" }}>
                  {data?.evidence?.integrityAlerts ?? 0}
                </strong>
              </div>
            </div>
          </div>

          {/* 3. Custody Pillar */}
          <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--accent-warning)", letterSpacing: "0.04em" }}>
                Custody Chain
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 800, color: "var(--accent-warning)" }}>
                {(data?.custody?.created ?? 0) + (data?.custody?.transferred ?? 0)}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
              <div style={{ background: "var(--surface-sunken)", padding: "8px 10px", borderRadius: "4px" }}>
                <span style={{ color: "var(--text-disabled)", display: "block", fontSize: "10.5px" }}>TRANSFERS</span>
                <strong style={{ color: "var(--accent-warning)", fontFamily: "var(--font-mono)", fontSize: "14px" }}>
                  {data?.custody?.transferred ?? 0}
                </strong>
              </div>
              <div style={{ background: "var(--surface-sunken)", padding: "8px 10px", borderRadius: "4px" }}>
                <span style={{ color: "var(--text-disabled)", display: "block", fontSize: "10.5px" }}>DOWNLOADS</span>
                <strong style={{ color: "var(--accent-info)", fontFamily: "var(--font-mono)", fontSize: "14px" }}>
                  {data?.custody?.downloaded ?? 0}
                </strong>
              </div>
            </div>
          </div>

          {/* 4. Public Integrity Pillar */}
          <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--accent-info)", letterSpacing: "0.04em" }}>
                Integrity Checks
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 800, color: "var(--accent-info)" }}>
                {data?.audit?.publicVerifications ?? 0}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
              <div style={{ background: "var(--surface-sunken)", padding: "8px 10px", borderRadius: "4px" }}>
                <span style={{ color: "var(--text-disabled)", display: "block", fontSize: "10.5px" }}>PUBLIC VERIFIES</span>
                <strong style={{ color: "var(--accent-info)", fontFamily: "var(--font-mono)", fontSize: "14px" }}>
                  {data?.audit?.publicVerifications ?? 0}
                </strong>
              </div>
              <div style={{ background: "var(--surface-sunken)", padding: "8px 10px", borderRadius: "4px" }}>
                <span style={{ color: "var(--text-disabled)", display: "block", fontSize: "10.5px" }}>TOTAL AUDIT LOGS</span>
                <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "14px" }}>
                  {data?.audit?.totalEvents ?? 0}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Section: Activity Timeline & Top Actions */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px", marginBottom: "28px" }}>
          
          {/* Daily Activity Chart */}
          <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              System Activity Trend
            </h3>
            <ActivityChart data={data?.activityByDay || []} />
          </div>

          {/* Top Actions Distribution */}
          <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Top Ledger Operations
            </h3>
            {(!data?.topActions || data.topActions.length === 0) ? (
              <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>No actions logged in period.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {data.topActions.map((act, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{act.action}</span>
                    <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--brand-400)" }}>{act.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section: Official Case Intelligence PDF Report Generator */}
        <div
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border-default)",
            borderRadius: "8px",
            padding: "24px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent-active)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                OFFICIAL JUDICIAL EXPORT
              </span>
              <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: "4px 0" }}>
                Generate Case Intelligence Report (PDF)
              </h3>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)", maxWidth: "600px" }}>
                Generates a complete, court-ready dossier containing case overview, all linked evidence with full SHA-256 cryptographic digests, chronological chain-of-custody logs, and official integrity certificates.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <select
                className="input select"
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                style={{ minWidth: "260px" }}
              >
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.status})
                  </option>
                ))}
              </select>

              <button
                className="btn btn-primary btn-md"
                onClick={handleDownloadCasePdf}
                disabled={generatingPdf || !selectedCaseId}
                style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
              >
                <span>📄</span> {generatingPdf ? "Compiling PDF…" : "Download Report PDF"}
              </button>
            </div>
          </div>
        </div>

      </div>
    </WorkspaceShell>
  );
}
