"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "../auth-context";
import {
  getAuditLogs,
  exportAuditLogs,
  type AuditLog,
  type AuditPagination,
} from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

// ── Helpers ───────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "medium",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtTimeAgo(iso: string) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

const ACTION_MAP: Record<string, { label: string; color: string; bg: string }> = {
  "evidence.upload":     { label: "EVIDENCE UPLOAD",    color: "var(--accent-active)",   bg: "var(--accent-active-dim)" },
  "evidence.create":     { label: "EVIDENCE CREATE",    color: "var(--accent-active)",   bg: "var(--accent-active-dim)" },
  "evidence.view":       { label: "EVIDENCE VIEW",      color: "var(--accent-info)",     bg: "var(--accent-info-dim)" },
  "evidence.download":   { label: "EVIDENCE DOWNLOAD",  color: "var(--accent-info)",     bg: "var(--accent-info-dim)" },
  "custody.transfer":    { label: "CUSTODY TRANSFER",   color: "var(--accent-warning)",  bg: "var(--accent-warning-dim)" },
  "case.create":         { label: "CASE CREATE",        color: "var(--brand-400)",       bg: "var(--brand-900)" },
  "case.update":         { label: "CASE UPDATE",        color: "var(--brand-400)",       bg: "var(--brand-900)" },
  "case.delete":         { label: "CASE DELETE",        color: "var(--accent-danger)",   bg: "var(--accent-danger-dim)" },
  "public.verify":       { label: "PUBLIC VERIFY",      color: "var(--accent-active)",   bg: "var(--accent-active-dim)" },
  "audit.export":        { label: "LEDGER EXPORT",      color: "var(--text-secondary)",  bg: "var(--surface-sunken)" },
  "report.pdf_export":   { label: "REPORT GENERATE",    color: "var(--accent-info)",     bg: "var(--accent-info-dim)" },
  "auth.login":          { label: "USER LOGIN",         color: "var(--text-secondary)",  bg: "var(--surface-sunken)" },
  "auth.register":       { label: "USER REGISTER",      color: "var(--text-secondary)",  bg: "var(--surface-sunken)" },
};

function renderActionBadge(action: string) {
  const conf = ACTION_MAP[action] || {
    label: action.toUpperCase().replace(/[._]/g, " "),
    color: "var(--text-secondary)",
    bg: "var(--surface-sunken)",
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        borderRadius: "4px",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.04em",
        color: conf.color,
        background: conf.bg,
        border: `1px solid ${conf.color}33`,
      }}
    >
      {conf.label}
    </span>
  );
}

// ── Main Page Component ──────────────────────────────────────────

export default function AuditPage() {
  const { user, loading: authLoading, accessToken } = useAuth();

  // Data & Pagination
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<AuditPagination>({
    page: 1,
    pageSize: 25,
    totalItems: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [resourceFilter, setResourceFilter] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Export State
  const [exporting, setExporting] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);

  // Detail Modal
  const [activeLog, setActiveLog] = useState<AuditLog | null>(null);
  const [copiedDetail, setCopiedDetail] = useState(false);

  // Query Fetcher
  const fetchLogs = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getAuditLogs(accessToken, {
        page,
        pageSize,
        action: actionFilter !== "ALL" ? actionFilter : undefined,
        resourceType: resourceFilter !== "ALL" ? resourceFilter : undefined,
        from: from || undefined,
        to: to || undefined,
        q: search.trim() || undefined,
      });

      if (Array.isArray(res)) {
        setLogs(res);
        setPagination({
          page: 1,
          pageSize: res.length,
          totalItems: res.length,
          totalPages: 1,
        });
      } else {
        setLogs(res.items || []);
        setPagination(res.pagination || {
          page: 1,
          pageSize: 25,
          totalItems: 0,
          totalPages: 1,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit ledger records");
    } finally {
      setLoading(false);
    }
  }, [accessToken, page, pageSize, actionFilter, resourceFilter, from, to, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Export Handler
  async function handleExportCsv() {
    if (!accessToken || exporting) return;
    setExporting(true);
    setExportToast(null);
    try {
      const filename = await exportAuditLogs(accessToken, {
        format: "csv",
        action: actionFilter !== "ALL" ? actionFilter : undefined,
        resourceType: resourceFilter !== "ALL" ? resourceFilter : undefined,
        from: from || undefined,
        to: to || undefined,
        q: search.trim() || undefined,
      });
      setExportToast(`Downloaded ${filename}`);
      setTimeout(() => setExportToast(null), 4000);
    } catch (err) {
      setExportToast(err instanceof Error ? err.message : "Export failed");
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setExporting(false);
    }
  }

  function handleResetFilters() {
    setSearch("");
    setActionFilter("ALL");
    setResourceFilter("ALL");
    setFrom("");
    setTo("");
    setPage(1);
  }

  // Summary counts calculated from loaded slice
  const stats = useMemo(() => {
    return {
      total: pagination.totalItems,
      evidenceOps: logs.filter((l) => l.action.startsWith("evidence.")).length,
      custodyOps: logs.filter((l) => l.action.startsWith("custody.")).length,
      verifications: logs.filter((l) => l.action === "public.verify").length,
    };
  }, [logs, pagination.totalItems]);

  if (authLoading) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Audit Intelligence" }]}>
        <div style={{ padding: "32px", color: "var(--text-primary)" }}>
          <div className="skeleton" style={{ height: "40px", width: "240px", marginBottom: "20px" }} />
          <div className="skeleton" style={{ height: "180px", width: "100%" }} />
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell breadcrumbs={[{ label: "Audit Intelligence" }]}>
      <div style={{ padding: "28px", maxWidth: "1600px", margin: "0 auto" }}>
        
        {/* Page Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "24px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--brand-400)", textTransform: "uppercase" }}>
                SEC-LEGAL LEDGER v2.4
              </span>
              <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "3px", background: "var(--surface-sunken)", color: "var(--accent-active)", border: "1px solid var(--border-default)" }}>
                IMMUTABLE
              </span>
            </div>
            <h1 style={{ fontSize: "26px", fontWeight: 800, color: "var(--text-primary)", margin: 0, letterSpacing: "var(--tracking-tight)" }}>
              Audit & Compliance Intelligence
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--text-secondary)" }}>
              Cryptographically verified append-only system trail. All access, transfers, and verifications logged with millisecond precision.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              className="btn btn-secondary btn-md"
              onClick={() => fetchLogs()}
              disabled={loading}
              title="Refresh audit ledger"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <span>↻</span> Refresh
            </button>
            <button
              className="btn btn-primary btn-md"
              onClick={handleExportCsv}
              disabled={exporting}
              style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
            >
              <span>⭳</span> {exporting ? "Generating CSV…" : "Export CSV Ledger"}
            </button>
          </div>
        </div>

        {/* Export Feedback Toast */}
        {exportToast && (
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
            ✓ {exportToast}
          </div>
        )}

        {/* KPI Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "18px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.05em" }}>
              Total Ledger Records
            </span>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--text-primary)", margin: "4px 0", fontFamily: "var(--font-mono)" }}>
              {pagination.totalItems.toLocaleString()}
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-disabled)" }}>Global system events</span>
          </div>

          <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "18px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--accent-active)", letterSpacing: "0.05em" }}>
              Evidence Operations
            </span>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--accent-active)", margin: "4px 0", fontFamily: "var(--font-mono)" }}>
              {stats.evidenceOps}
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-disabled)" }}>Uploads, views, downloads</span>
          </div>

          <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "18px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--accent-warning)", letterSpacing: "0.05em" }}>
              Custody Chain Events
            </span>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--accent-warning)", margin: "4px 0", fontFamily: "var(--font-mono)" }}>
              {stats.custodyOps}
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-disabled)" }}>Transfers & acquisitions</span>
          </div>

          <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "18px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--accent-info)", letterSpacing: "0.05em" }}>
              Public Verifications
            </span>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--accent-info)", margin: "4px 0", fontFamily: "var(--font-mono)" }}>
              {stats.verifications}
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-disabled)" }}>External SHA-256 checks</span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border-default)",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "20px",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", flex: "1 1 auto" }}>
            {/* Search */}
            <div style={{ position: "relative", minWidth: "220px", flex: "1 1 220px" }}>
              <input
                type="text"
                className="input"
                placeholder="Search action, actor, resource ID…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                style={{ paddingLeft: "12px" }}
              />
            </div>

            {/* Action filter */}
            <select
              className="input select"
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              style={{ width: "auto", minWidth: "160px" }}
            >
              <option value="ALL">All Actions</option>
              <option value="evidence.upload">Evidence Upload</option>
              <option value="evidence.download">Evidence Download</option>
              <option value="custody.transfer">Custody Transfer</option>
              <option value="case.create">Case Create</option>
              <option value="case.update">Case Update</option>
              <option value="public.verify">Public Verify</option>
              <option value="audit.export">Ledger Export</option>
            </select>

            {/* Resource Type */}
            <select
              className="input select"
              value={resourceFilter}
              onChange={(e) => {
                setResourceFilter(e.target.value);
                setPage(1);
              }}
              style={{ width: "auto", minWidth: "140px" }}
            >
              <option value="ALL">All Resources</option>
              <option value="case">Case</option>
              <option value="evidence">Evidence</option>
              <option value="user">User</option>
              <option value="audit">Audit Ledger</option>
            </select>

            {/* Date Range */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="date"
                className="input"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
                title="Start Date"
                style={{ width: "135px", fontSize: "12px" }}
              />
              <span style={{ color: "var(--text-disabled)" }}>→</span>
              <input
                type="date"
                className="input"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
                title="End Date"
                style={{ width: "135px", fontSize: "12px" }}
              />
            </div>

            {(search || actionFilter !== "ALL" || resourceFilter !== "ALL" || from || to) && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleResetFilters}
                style={{ fontSize: "12px", color: "var(--accent-danger)" }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Page size picker */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Show:</span>
            <select
              className="input select"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              style={{ width: "80px", padding: "4px 8px", fontSize: "12px" }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* Error banner */}
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

        {/* Table Container */}
        <div
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border-default)",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "var(--surface-sunken)", borderBottom: "1px solid var(--border-default)" }}>
                  <th style={{ padding: "12px 16px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Timestamp (UTC)
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Action
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Actor
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Resource
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    IP / Context
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>
                    Inspect
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
                      <div className="skeleton" style={{ height: "24px", width: "200px", margin: "0 auto" }} />
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "48px 24px", textAlign: "center" }}>
                      <div style={{ fontSize: "28px", marginBottom: "8px" }}>📋</div>
                      <strong style={{ display: "block", color: "var(--text-primary)", fontSize: "15px", marginBottom: "4px" }}>
                        No audit ledger records found
                      </strong>
                      <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "13px" }}>
                        Try adjusting your search terms, action filter, or date boundaries.
                      </p>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    return (
                      <tr
                        key={log.id}
                        style={{
                          borderBottom: "1px solid var(--border-default)",
                          transition: "background var(--transition-fast)",
                        }}
                        className="table-row-hover"
                      >
                        {/* Timestamp */}
                        <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-primary)" }}>
                            {fmtDate(log.timestamp)}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-disabled)" }}>
                            {fmtTimeAgo(log.timestamp)}
                          </div>
                        </td>

                        {/* Action Badge */}
                        <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                          {renderActionBadge(log.action)}
                        </td>

                        {/* Actor */}
                        <td style={{ padding: "12px 16px" }}>
                          {log.actor ? (
                            <div>
                              <strong style={{ display: "block", color: "var(--text-primary)", fontSize: "12.5px" }}>
                                {log.actor.name}
                              </strong>
                              <span style={{ fontSize: "11px", color: "var(--text-disabled)", fontFamily: "var(--font-mono)" }}>
                                {log.actor.role}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: "var(--text-disabled)", fontStyle: "italic", fontSize: "12px" }}>
                              System / Anonymous
                            </span>
                          )}
                        </td>

                        {/* Resource */}
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span
                              style={{
                                textTransform: "uppercase",
                                fontSize: "10px",
                                fontWeight: 700,
                                color: "var(--brand-400)",
                                background: "var(--brand-900)",
                                padding: "2px 5px",
                                borderRadius: "3px",
                              }}
                            >
                              {log.resourceType}
                            </span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)" }}>
                              {log.resourceId.slice(0, 10)}…
                            </span>
                          </div>
                        </td>

                        {/* IP / Context */}
                        <td style={{ padding: "12px 16px", color: "var(--text-secondary)", fontSize: "12px", fontFamily: "var(--font-mono)" }}>
                          {log.ipAddress || "—"}
                        </td>

                        {/* Action */}
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setActiveLog(log);
                              setCopiedDetail(false);
                            }}
                            style={{ fontSize: "12px", padding: "4px 10px" }}
                          >
                            Inspect ↗
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div
            style={{
              padding: "14px 18px",
              background: "var(--surface-sunken)",
              borderTop: "1px solid var(--border-default)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <span style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
              Showing {logs.length > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0} to{" "}
              {Math.min(pagination.page * pagination.pageSize, pagination.totalItems)} of{" "}
              <strong>{pagination.totalItems.toLocaleString()}</strong> events
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1 || loading}
              >
                ← Previous
              </button>

              <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-primary)", padding: "0 6px" }}>
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={pagination.page >= pagination.totalPages || loading}
              >
                Next →
              </button>
            </div>
          </div>
        </div>

        {/* Audit Log Detail Modal */}
        {activeLog && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(4px)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 1000,
              padding: "20px",
            }}
            onClick={() => setActiveLog(null)}
          >
            <div
              style={{
                background: "var(--surface-raised)",
                border: "1px solid var(--border-default)",
                borderRadius: "10px",
                width: "100%",
                maxWidth: "680px",
                maxHeight: "90vh",
                overflowY: "auto",
                padding: "24px",
                boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-disabled)", textTransform: "uppercase" }}>
                    EVENT ID: {activeLog.id}
                  </span>
                  <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: "4px 0" }}>
                    {activeLog.action}
                  </h3>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setActiveLog(null)}
                  style={{ fontSize: "16px", lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>

              {/* Meta Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  background: "var(--surface-sunken)",
                  padding: "14px",
                  borderRadius: "6px",
                  marginBottom: "16px",
                  fontSize: "12.5px",
                }}
              >
                <div>
                  <span style={{ color: "var(--text-disabled)", display: "block", fontSize: "11px" }}>TIMESTAMP</span>
                  <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {new Date(activeLog.timestamp).toISOString()}
                  </span>
                </div>
                <div>
                  <span style={{ color: "var(--text-disabled)", display: "block", fontSize: "11px" }}>ACTOR</span>
                  <span style={{ color: "var(--text-primary)" }}>
                    {activeLog.actor ? `${activeLog.actor.name} (${activeLog.actor.role})` : "System"}
                  </span>
                </div>
                <div>
                  <span style={{ color: "var(--text-disabled)", display: "block", fontSize: "11px" }}>RESOURCE TYPE</span>
                  <span style={{ color: "var(--text-primary)", textTransform: "uppercase", fontWeight: 700 }}>
                    {activeLog.resourceType}
                  </span>
                </div>
                <div>
                  <span style={{ color: "var(--text-disabled)", display: "block", fontSize: "11px" }}>RESOURCE ID</span>
                  <span style={{ color: "var(--brand-400)", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
                    {activeLog.resourceId}
                  </span>
                </div>
                <div>
                  <span style={{ color: "var(--text-disabled)", display: "block", fontSize: "11px" }}>IP ADDRESS</span>
                  <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {activeLog.ipAddress || "—"}
                  </span>
                </div>
                <div>
                  <span style={{ color: "var(--text-disabled)", display: "block", fontSize: "11px" }}>USER AGENT</span>
                  <span style={{ color: "var(--text-secondary)", fontSize: "11px", wordBreak: "break-all" }}>
                    {activeLog.userAgent || "—"}
                  </span>
                </div>
              </div>

              {/* JSON Detail */}
              <div style={{ marginBottom: "18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                    Detail Payload JSON
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(activeLog.detailJson, null, 2));
                      setCopiedDetail(true);
                      setTimeout(() => setCopiedDetail(false), 2000);
                    }}
                    style={{ fontSize: "11px", padding: "2px 8px" }}
                  >
                    {copiedDetail ? "✓ Copied" : "Copy JSON"}
                  </button>
                </div>
                <pre
                  style={{
                    background: "var(--surface-sunken)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "6px",
                    padding: "12px",
                    fontSize: "12px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--accent-active)",
                    overflowX: "auto",
                    maxHeight: "220px",
                    margin: 0,
                  }}
                >
                  {JSON.stringify(activeLog.detailJson, null, 2)}
                </pre>
              </div>

              {/* Close Button */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-secondary btn-md" onClick={() => setActiveLog(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </WorkspaceShell>
  );
}
