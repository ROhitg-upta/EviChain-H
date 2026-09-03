"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth-context";
import { getAuditLogs, type AuditLog } from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

// ── Helpers ───────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

const ACTION_ICON: Record<string, string> = {
  "evidence.upload":   "↑",
  "evidence.view":     "👁",
  "evidence.download": "↓",
  "case.create":       "✦",
  "case.update":       "✎",
  "case.link_evidence":"⛓",
  "auth.login":        "→",
  "auth.register":     "★",
};

const ACTION_CLASS: Record<string, string> = {
  "evidence.upload":   "action--upload",
  "evidence.view":     "action--view",
  "evidence.download": "action--download",
  "case.create":       "action--create",
  "case.update":       "action--update",
  "auth.login":        "action--auth",
  "auth.register":     "action--auth",
};

function actionIcon(action: string) {
  return ACTION_ICON[action] ?? "•";
}
function actionClass(action: string) {
  return ACTION_CLASS[action] ?? "action--default";
}

// ── Component ─────────────────────────────────────────────────────

export default function AuditPage() {
  const { user, loading: authLoading, accessToken } = useAuth();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  

  useEffect(() => {
    if (!accessToken) return;
    setFetching(true);
    getAuditLogs(accessToken, { limit: 500 })
      .then(setLogs)
      .catch((err: unknown) =>
        setFetchError(err instanceof Error ? err.message : "Failed to load audit logs"),
      )
      .finally(() => setFetching(false));
  }, [accessToken]);

  // Unique action types for filter dropdown
  const actionTypes = useMemo(() => {
    const set = new Set(logs.map((l) => l.action));
    return Array.from(set).sort();
  }, [logs]);

  // Client-side filtering (server already returned up to 500)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (actionFilter && l.action !== actionFilter) return false;
      if (resourceFilter !== "ALL" && l.resourceType !== resourceFilter) return false;
      if (from && new Date(l.timestamp) < new Date(from)) return false;
      if (to && new Date(l.timestamp) > new Date(`${to}T23:59:59`)) return false;
      if (
        q &&
        !`${l.action} ${l.resourceType} ${l.resourceId} ${l.actor?.name ?? ""}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [logs, search, actionFilter, resourceFilter, from, to]);

  // Stats
  const stats = useMemo(() => ({
    total: logs.length,
    today: logs.filter((l) => isToday(l.timestamp)).length,
    uploads: logs.filter((l) => l.action === "evidence.upload").length,
    downloads: logs.filter((l) => l.action === "evidence.download").length,
  }), [logs]);

  if (authLoading) {
    return <WorkspaceShell breadcrumbs={[{ label: 'Audit Logs' }]}>
<div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}><p className="audit-loading">Loading…</p></div>
</WorkspaceShell>;
  }

  return (
    <WorkspaceShell breadcrumbs={[{ label: 'Audit Logs' }]}>
<div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}>
      {/* Top bar */}
      

      {/* Page header */}
      <div className="page-header" style={{ marginBottom: "24px" }}>
        <div>
          <p className="eyebrow" style={{ color: "var(--text-disabled)", fontFamily: "var(--font-mono)", fontSize: "12px", textTransform: "uppercase" }}>IMMUTABLE AUDIT LEDGER</p>
          <h1 style={{ color: "var(--text-primary)", fontSize: "24px", margin: "8px 0" }}>Audit logs</h1>
          <p className="ev-page-sub" style={{ color: "var(--text-secondary)" }}>
            Every action logged in real time — tamper-evident chain of custody.
          </p>
        </div>
      </div>

      {/* Stats */}
      <section className="stats-grid" aria-label="Audit statistics">
        <div className="stat-card" style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "16px", color: "var(--text-primary)" }}>
          <span>Total events</span>
          <strong>{String(stats.total).padStart(3, "0")}</strong>
          <small>All time</small>
        </div>
        <div className="stat-card stat-card--green">
          <span>Today</span>
          <strong>{String(stats.today).padStart(2, "0")}</strong>
          <small>Last 24 hours</small>
        </div>
        <div className="stat-card stat-card--amber">
          <span>Uploads</span>
          <strong>{String(stats.uploads).padStart(2, "0")}</strong>
          <small>Evidence registered</small>
        </div>
        <div className="stat-card stat-card--muted">
          <span>Downloads</span>
          <strong>{String(stats.downloads).padStart(2, "0")}</strong>
          <small>Evidence downloaded</small>
        </div>
      </section>

      {/* Filters */}
      <div className="filters-section" role="search" aria-label="Filter audit logs">
        <input
          className="ev-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search action, resource, user…"
          aria-label="Search audit logs"
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          aria-label="Filter by action type"
        >
          <option value="">All actions</option>
          {actionTypes.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
          aria-label="Filter by resource type"
        >
          <option value="ALL">All resources</option>
          <option value="evidence">Evidence</option>
          <option value="case">Case</option>
        </select>
        <label className="audit-date-label" aria-label="From date">
          <span className="sr-only">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Filter from date"
          />
        </label>
        <label className="audit-date-label" aria-label="To date">
          <span className="sr-only">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Filter to date"
          />
        </label>
        {(search || actionFilter || resourceFilter !== "ALL" || from || to) && (
          <button
            className="button button-secondary small-button"
            onClick={() => {
              setSearch("");
              setActionFilter("");
              setResourceFilter("ALL");
              setFrom("");
              setTo("");
            }}
            aria-label="Clear all filters"
          >
            Clear filters
          </button>
        )}
      </div>

      {fetchError && (
        <div className="error-message" style={{ color: "var(--accent-danger)", border: "1px solid var(--accent-danger)", background: "rgba(244, 63, 94, 0.1)", padding: "12px", borderRadius: "6px" }} role="alert">{fetchError}</div>
      )}

      {/* Timeline */}
      <div className="audit-timeline-wrap panel">
        {fetching ? (
          <p className="audit-loading" role="status" aria-live="polite">
            Loading audit logs…
          </p>
        ) : filtered.length === 0 ? (
          <div className="ev-empty-state">
            <strong>
              {logs.length === 0
                ? "No audit events yet."
                : "No events match your filters."}
            </strong>
            {logs.length === 0 && (
              <p>Events are logged automatically as you use EviChain.</p>
            )}
          </div>
        ) : (
          <ol className="audit-timeline" aria-label="Audit event timeline">
            {filtered.map((log) => (
              <li key={log.id} className="timeline-item" style={{ borderBottom: "1px solid var(--border-subtle)", padding: "12px 0" }}>
                <span
                  className={`action-badge ${actionClass(log.action)}`}
                  aria-hidden="true"
                >
                  {actionIcon(log.action)}
                </span>

                <div className="timeline-item-body">
                  <div className="timeline-item-header">
                    <strong className="timeline-action">{log.action}</strong>
                    <span className="timeline-resource">
                      {log.resourceType}
                      {" · "}
                      <code>{log.resourceId.slice(0, 8)}</code>
                    </span>
                  </div>

                  <div className="timeline-item-meta">
                    <span>
                      {log.actor ? (
                        <>{log.actor.name} <small>({log.actor.role})</small></>
                      ) : (
                        <span className="ev-muted">System</span>
                      )}
                    </span>
                    <span className="ev-muted">·</span>
                    <time dateTime={log.timestamp}>{fmtDate(log.timestamp)}</time>
                    {log.ipAddress && (
                      <>
                        <span className="ev-muted">·</span>
                        <code className="timeline-ip">{log.ipAddress}</code>
                      </>
                    )}
                  </div>
                </div>

                <a
                  className="button button-secondary small-button timeline-view-btn"
                  href={`/audit/${log.id}`}
                  aria-label={`View details for audit event ${log.id}`}
                >
                  Details
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className="ev-list-footer">
        <span>{filtered.length} of {logs.length} events shown</span>
        <a href="/audit/export" className="ev-footer-link">Export full ledger →</a>
      </footer>
    </div>
</WorkspaceShell>
  );
}
