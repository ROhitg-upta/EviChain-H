"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth-context";
import { getAuditLogs, getCases, getEvidence, type AuditLog, type CaseRecord, type EvidenceRecord } from "@/lib/api";

export default function AdminDashboard() {
  const { user, loading: authLoading, accessToken } = useAuth();

  const [auditLogs, setAuditLogs]   = useState<AuditLog[]>([]);
  const [cases, setCases]           = useState<CaseRecord[]>([]);
  const [evidence, setEvidence]     = useState<EvidenceRecord[]>([]);
  const [fetching, setFetching]     = useState(true);
  const [error, setError]           = useState("");

  useEffect(() => {
    if (!authLoading && !user) window.location.replace("/login");
    if (!authLoading && user && user.role !== "Administrator")
      window.location.replace("/");
  }, [authLoading, user]);

  useEffect(() => {
    if (!accessToken) return;
    setFetching(true);
    Promise.all([
      getAuditLogs(accessToken, { limit: 20 }),
      getCases(accessToken),
      getEvidence(accessToken),
    ])
      .then(([logs, cs, ev]) => {
        setAuditLogs(logs);
        setCases(cs);
        setEvidence(ev);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load data"),
      )
      .finally(() => setFetching(false));
  }, [accessToken]);

  const stats = useMemo(() => ({
    cases:      cases.length,
    openCases:  cases.filter((c) => c.status === "Active").length,
    evidence:   evidence.length,
    pending:    evidence.filter((e) => e.status === "PENDING").length,
    flagged:    evidence.filter((e) => e.status === "FLAGGED").length,
    auditToday: auditLogs.filter((l) => {
      const d = new Date(l.timestamp), n = new Date();
      return d.toDateString() === n.toDateString();
    }).length,
  }), [cases, evidence, auditLogs]);

  if (authLoading) return <main className="cases-shell"><p className="cases-loading">Loading…</p></main>;

  return (
    <main className="cases-shell">
      <header className="ev-topbar">
        <a className="ev-brand" href="/">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span><strong>EviChain</strong><small>Admin panel</small></span>
        </a>
        <nav className="ev-nav" aria-label="Admin navigation">
          <a href="/admin/users">Users</a>
          <a href="/admin/settings">Settings</a>
          <a href="/audit">Audit logs</a>
          <a href="/evidence">Evidence</a>
          <a href="/cases">Cases</a>
          {user && (
            <span className="ev-user-badge">
              <span className="operator" aria-hidden="true">{user.initials}</span>
              <span>{user.name}</span>
            </span>
          )}
        </nav>
      </header>

      <div className="page-header">
        <div>
          <p className="eyebrow">SYSTEM ADMINISTRATION</p>
          <h1>Admin dashboard</h1>
          <p className="ev-page-sub">System overview for administrators.</p>
        </div>
      </div>

      {error && <div className="error-message" role="alert">{error}</div>}

      {/* Stats */}
      <section className="stats-grid" aria-label="System statistics">
        <div className="stat-card">
          <span>Cases</span>
          <strong>{String(stats.cases).padStart(2, "0")}</strong>
          <small>{stats.openCases} active</small>
        </div>
        <div className="stat-card stat-card--green">
          <span>Evidence</span>
          <strong>{String(stats.evidence).padStart(2, "0")}</strong>
          <small>{stats.pending} pending</small>
        </div>
        <div className="stat-card stat-card--red">
          <span>Flagged</span>
          <strong>{String(stats.flagged).padStart(2, "0")}</strong>
          <small>Needs attention</small>
        </div>
        <div className="stat-card stat-card--amber">
          <span>Audit today</span>
          <strong>{String(stats.auditToday).padStart(2, "0")}</strong>
          <small>Events logged</small>
        </div>
      </section>

      {/* Quick nav */}
      <div className="admin-quick-nav">
        <a className="admin-nav-card" href="/admin/users">
          <span className="admin-nav-icon" aria-hidden="true">👥</span>
          <strong>User management</strong>
          <small>View and manage operator accounts</small>
        </a>
        <a className="admin-nav-card" href="/admin/settings">
          <span className="admin-nav-icon" aria-hidden="true">⚙</span>
          <strong>System settings</strong>
          <small>Configure platform options</small>
        </a>
        <a className="admin-nav-card" href="/audit">
          <span className="admin-nav-icon" aria-hidden="true">📋</span>
          <strong>Audit logs</strong>
          <small>Full immutable event ledger</small>
        </a>
        <a className="admin-nav-card" href="/audit/export">
          <span className="admin-nav-icon" aria-hidden="true">↓</span>
          <strong>Export ledger</strong>
          <small>Download CSV or JSON export</small>
        </a>
      </div>

      {/* Recent audit activity */}
      <div className="panel" style={{ marginTop: 24, overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid var(--line)" }}>
          <p className="eyebrow" style={{ marginBottom: 4 }}>RECENT ACTIVITY</p>
          <h2 style={{ margin: 0, fontSize: 17, letterSpacing: "-0.04em" }}>Latest audit events</h2>
        </div>

        {fetching ? (
          <p className="audit-loading">Loading…</p>
        ) : auditLogs.length === 0 ? (
          <p className="ev-empty-state" style={{ padding: 32 }}>No audit events yet.</p>
        ) : (
          <ol className="audit-timeline" aria-label="Recent audit events">
            {auditLogs.slice(0, 10).map((log) => (
              <li key={log.id} className="timeline-item">
                <span className="action-badge action--default" aria-hidden="true">•</span>
                <div className="timeline-item-body">
                  <div className="timeline-item-header">
                    <strong className="timeline-action">{log.action}</strong>
                    <span className="timeline-resource">
                      {log.resourceType} · <code>{log.resourceId.slice(0, 8)}</code>
                    </span>
                  </div>
                  <div className="timeline-item-meta">
                    <span>{log.actor?.name ?? "System"}</span>
                    <span className="ev-muted">·</span>
                    <time dateTime={log.timestamp}>
                      {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" })
                        .format(new Date(log.timestamp))}
                    </time>
                  </div>
                </div>
                <a className="button button-secondary small-button" href={`/audit/${log.id}`}>
                  Details
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
