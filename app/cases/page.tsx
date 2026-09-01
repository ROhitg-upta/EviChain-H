"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth-context";
import { getCases, type CaseRecord } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(new Date(iso));
}

function truncate(text: string, max = 120) {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

const STATUS_CLASS: Record<string, string> = {
  Active: "case-status--active",
  Review: "case-status--review",
  Closed: "case-status--closed",
  Archived: "case-status--archived",
};

const PRIORITY_CLASS: Record<string, string> = {
  Critical: "case-priority--critical",
  High: "case-priority--high",
  Medium: "case-priority--medium",
  Low: "case-priority--low",
};

// ── Component ─────────────────────────────────────────────────────

export default function CasesPage() {
  const { user, loading: authLoading, accessToken } = useAuth();

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"date" | "title" | "evidence">("date");

  useEffect(() => {
    if (!authLoading && !user) window.location.replace("/login");
  }, [authLoading, user]);

  useEffect(() => {
    if (!accessToken) return;
    setFetching(true);
    getCases(accessToken)
      .then(setCases)
      .catch((err: unknown) =>
        setFetchError(err instanceof Error ? err.message : "Failed to load cases"),
      )
      .finally(() => setFetching(false));
  }, [accessToken]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases
      .filter((c) => {
        if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
        if (q && !`${c.title} ${c.description}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "title") return a.title.localeCompare(b.title);
        if (sortBy === "evidence")
          return (b.evidenceCount ?? 0) - (a.evidenceCount ?? 0);
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [cases, search, statusFilter, sortBy]);

  const stats = useMemo(() => ({
    total: cases.length,
    active: cases.filter((c) => c.status === "Active").length,
    closed: cases.filter((c) => c.status === "Closed").length,
    archived: cases.filter((c) => c.status === "Archived").length,
  }), [cases]);

  if (authLoading) {
    return <main className="cases-shell"><p className="cases-loading">Loading…</p></main>;
  }

  return (
    <main className="cases-shell">
      {/* Top bar */}
      <header className="ev-topbar">
        <a className="ev-brand" href="/" aria-label="EviChain home">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>
            <strong>EviChain</strong>
            <small>Case management</small>
          </span>
        </a>
        <nav className="ev-nav" aria-label="Primary navigation">
          <a href="/cases/new" className="button button-primary small-button">
            + New case
          </a>
          <a href="/evidence">Evidence</a>
          <a href="/verify">Verify</a>
          {user && (
            <span className="ev-user-badge">
              <span className="operator" aria-hidden="true">{user.initials}</span>
              <span>{user.name}</span>
            </span>
          )}
        </nav>
      </header>

      {/* Page header */}
      <div className="page-header">
        <div>
          <p className="eyebrow">CASE REGISTER</p>
          <h1>Cases</h1>
          <p className="ev-page-sub">
            {cases.length} case{cases.length !== 1 ? "s" : ""} on file
          </p>
        </div>
      </div>

      {/* Stats */}
      <section className="stats-grid" aria-label="Case summary statistics">
        <div className="stat-card">
          <span>Total</span>
          <strong>{String(stats.total).padStart(2, "0")}</strong>
          <small>All cases</small>
        </div>
        <div className="stat-card stat-card--green">
          <span>Active</span>
          <strong>{String(stats.active).padStart(2, "0")}</strong>
          <small>In progress</small>
        </div>
        <div className="stat-card stat-card--amber">
          <span>Closed</span>
          <strong>{String(stats.closed).padStart(2, "0")}</strong>
          <small>Resolved</small>
        </div>
        <div className="stat-card stat-card--muted">
          <span>Archived</span>
          <strong>{String(stats.archived).padStart(2, "0")}</strong>
          <small>Archived</small>
        </div>
      </section>

      {/* Filters */}
      <div className="filters-section" role="search" aria-label="Filter and search cases">
        <input
          className="ev-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or description…"
          aria-label="Search cases"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="ALL">All statuses</option>
          <option value="Active">Active</option>
          <option value="Review">Under review</option>
          <option value="Closed">Closed</option>
          <option value="Archived">Archived</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          aria-label="Sort by"
        >
          <option value="date">Newest first</option>
          <option value="title">Title A–Z</option>
          <option value="evidence">Most evidence</option>
        </select>
      </div>

      {/* Error */}
      {fetchError && (
        <div className="error-message" role="alert">{fetchError}</div>
      )}

      {/* Cases grid */}
      {fetching ? (
        <p className="cases-loading" role="status" aria-live="polite">
          Loading cases…
        </p>
      ) : filtered.length === 0 ? (
        <div className="cases-empty">
          <strong>
            {cases.length === 0 ? "No cases yet." : "No cases match your filters."}
          </strong>
          {cases.length === 0 && (
            <p>
              <a href="/cases/new">Create your first case →</a>
            </p>
          )}
        </div>
      ) : (
        <div className="cases-grid" role="list">
          {filtered.map((c) => (
            <article
              key={c.id}
              className="case-card"
              role="listitem"
              onClick={() => (window.location.href = `/cases/${c.id}`)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") window.location.href = `/cases/${c.id}`;
              }}
              aria-label={`Case: ${c.title}`}
            >
              <div className="case-header">
                <div className="case-header-left">
                  <span
                    className={`case-status-badge ${STATUS_CLASS[c.status] ?? "case-status--active"}`}
                    aria-label={`Status: ${c.status}`}
                  >
                    {c.status}
                  </span>
                  {c.priority && (
                    <span
                      className={`case-priority-badge ${PRIORITY_CLASS[c.priority] ?? ""}`}
                      aria-label={`Priority: ${c.priority}`}
                    >
                      {c.priority}
                    </span>
                  )}
                </div>
                <span className="case-evidence-count" aria-label={`${c.evidenceCount ?? 0} evidence items`}>
                  {c.evidenceCount ?? 0} evidence
                </span>
              </div>

              <h2 className="case-title">{c.title}</h2>

              {c.description && (
                <p className="case-desc">{truncate(c.description)}</p>
              )}

              <div className="case-meta">
                {c.lead && (
                  <span>
                    <span className="case-meta-label">Lead</span>
                    {c.lead.name}
                  </span>
                )}
                <span>
                  <span className="case-meta-label">Created</span>
                  {fmtDate(c.createdAt)}
                </span>
                <span>
                  <span className="case-meta-label">Updated</span>
                  {fmtDate(c.updatedAt)}
                </span>
              </div>

              <div className="case-footer">
                <a
                  className="button button-secondary small-button"
                  href={`/cases/${c.id}`}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Open case: ${c.title}`}
                >
                  Open case →
                </a>
              </div>
            </article>
          ))}
        </div>
      )}

      <footer className="ev-list-footer">
        <span>{filtered.length} of {cases.length} cases shown</span>
        <span>EviChain · Case management</span>
      </footer>
    </main>
  );
}
