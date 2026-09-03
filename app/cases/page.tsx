"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth-context";
import { getCases, type CaseRecord } from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

/* ── Helpers ───────────────────────────────────────────────────────── */

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(iso));
}

function truncate(text: string, max = 120) {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso);
}

const STATUS_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  Active:   { color: "var(--accent-active)",   bg: "var(--accent-active-dim)",   border: "var(--accent-active-border)" },
  Review:   { color: "var(--accent-pending)",  bg: "var(--accent-pending-dim)",  border: "var(--accent-pending-border)" },
  Closed:   { color: "var(--text-secondary)",  bg: "rgba(255,255,255,0.04)",     border: "var(--border-default)" },
  Archived: { color: "var(--text-disabled)",   bg: "rgba(255,255,255,0.02)",     border: "var(--border-subtle)" },
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "var(--accent-danger)",
  High:     "var(--accent-pending)",
  Medium:   "var(--text-secondary)",
  Low:      "var(--text-disabled)",
};

/* ── Component ─────────────────────────────────────────────────────── */

export default function CasesPage() {
  const { user, loading: authLoading, accessToken } = useAuth();

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"date" | "title" | "evidence">("date");

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
        if (sortBy === "evidence") return (b.evidenceCount ?? 0) - (a.evidenceCount ?? 0);
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
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Cases" }]}>
        <div style={{ display: "grid", gap: 12 }}>
          {[1,2,3].map(i => (
            <div key={i} className="skeleton" style={{ height: 80, borderRadius: "var(--radius-md)" }} />
          ))}
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell breadcrumbs={[{ label: "Cases" }]}>
      {/* Page header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        paddingBottom: "var(--space-5)", marginBottom: "var(--space-5)",
        borderBottom: "1px solid var(--border-default)",
      }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 6 }}>CASE REGISTER</p>
          <h1 style={{
            margin: 0, fontSize: "var(--text-xl)", fontWeight: 700,
            letterSpacing: "var(--tracking-tight)", color: "var(--text-primary)",
          }}>Cases</h1>
          <p style={{ margin: "4px 0 0", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            {cases.length} case{cases.length !== 1 ? "s" : ""} on file
          </p>
        </div>
        {user?.role !== "Auditor" && (
          <a href="/cases/new" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 16px", background: "var(--brand-600)", color: "var(--neutral-50)",
            borderRadius: "var(--radius-md)", fontWeight: 600, fontSize: "var(--text-sm)",
            textDecoration: "none", border: "1px solid var(--brand-600)",
            transition: "background 0.15s ease",
          }}>
            + New case
          </a>
        )}
      </div>

      {/* Stats strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: "var(--space-5)" }}>
        {[
          { label: "Total", value: stats.total, sub: "All cases", color: "var(--text-primary)" },
          { label: "Active", value: stats.active, sub: "In progress", color: "var(--accent-active)" },
          { label: "Closed", value: stats.closed, sub: "Resolved", color: "var(--text-secondary)" },
          { label: "Archived", value: stats.archived, sub: "Archived", color: "var(--text-disabled)" },
        ].map(s => (
          <div key={s.label} style={{
            padding: "16px 18px", background: "var(--surface-raised)",
            border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)",
          }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500,
              letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--text-secondary)",
            }}>{s.label}</span>
            <div style={{
              fontSize: "var(--text-xl)", fontWeight: 800, color: s.color,
              letterSpacing: "var(--tracking-tight)", margin: "6px 0 2px",
            }}>{String(s.value).padStart(2, "0")}</div>
            <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>{s.sub}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        display: "flex", gap: 10, marginBottom: "var(--space-5)", flexWrap: "wrap" as const,
      }} role="search" aria-label="Filter and search cases">
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or description…"
          aria-label="Search cases"
          style={{ flex: "1 1 240px", minWidth: 200 }}
        />
        <select
          className="input select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          style={{ flex: "0 0 160px" }}
        >
          <option value="ALL">All statuses</option>
          <option value="Active">Active</option>
          <option value="Review">Under review</option>
          <option value="Closed">Closed</option>
          <option value="Archived">Archived</option>
        </select>
        <select
          className="input select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          aria-label="Sort by"
          style={{ flex: "0 0 160px" }}
        >
          <option value="date">Newest first</option>
          <option value="title">Title A–Z</option>
          <option value="evidence">Most evidence</option>
        </select>
      </div>

      {/* Error */}
      {fetchError && (
        <div role="alert" style={{
          padding: "12px 16px", background: "var(--accent-danger-dim)",
          border: "1px solid var(--accent-danger-border)", borderRadius: "var(--radius-md)",
          color: "var(--accent-danger)", fontSize: "var(--text-sm)", marginBottom: "var(--space-5)",
        }}>
          {fetchError}
          <button onClick={() => { setFetchError(""); setFetching(true); getCases(accessToken!).then(setCases).finally(() => setFetching(false)); }}
            style={{ marginLeft: 12, textDecoration: "underline", background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
            Retry
          </button>
        </div>
      )}

      {/* Cases list */}
      {fetching ? (
        <div style={{ display: "grid", gap: 10 }}>
          {[1,2,3,4].map(i => (
            <div key={i} className="skeleton" style={{ height: 100, borderRadius: "var(--radius-md)" }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column" as const, alignItems: "center",
          padding: "48px 24px", textAlign: "center" as const,
          border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)",
          background: "var(--surface-raised)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>◫</div>
          <strong style={{ color: "var(--text-primary)", fontSize: "var(--text-md)" }}>
            {cases.length === 0 ? "No cases yet" : "No cases match your filters"}
          </strong>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", margin: "8px 0 16px" }}>
            {cases.length === 0
              ? "Create your first case to begin managing evidence."
              : "Try adjusting your search or filter criteria."}
          </p>
          {cases.length === 0 && user?.role !== "Auditor" && (
            <a href="/cases/new" className="btn btn-primary btn-md">+ New case</a>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }} role="list">
          {filtered.map((c) => (
            <article
              key={c.id}
              role="listitem"
              onClick={() => (window.location.href = `/cases/${c.id}`)}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") window.location.href = `/cases/${c.id}`; }}
              aria-label={`Case: ${c.title}`}
              style={{
                display: "grid", gridTemplateColumns: "1fr auto",
                gap: 16, padding: "16px 20px",
                background: "var(--surface-raised)", border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)", cursor: "pointer",
                transition: "border-color 0.15s ease, background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
                (e.currentTarget as HTMLElement).style.background = "var(--surface-overlay)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)";
                (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)";
              }}
            >
              <div style={{ minWidth: 0 }}>
                {/* Badges */}
                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" as const }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "2px 8px", borderRadius: "var(--radius-sm)",
                    fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 500,
                    letterSpacing: "0.06em", textTransform: "uppercase" as const,
                    color: STATUS_COLORS[c.status]?.color ?? "var(--text-secondary)",
                    background: STATUS_COLORS[c.status]?.bg ?? "rgba(255,255,255,0.04)",
                    border: `1px solid ${STATUS_COLORS[c.status]?.border ?? "var(--border-default)"}`,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", opacity: 0.8 }} />
                    {c.status}
                  </span>
                  {c.priority && (
                    <span style={{
                      padding: "2px 8px", borderRadius: "var(--radius-sm)",
                      fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 500,
                      letterSpacing: "0.06em", textTransform: "uppercase" as const,
                      color: PRIORITY_COLORS[c.priority] ?? "var(--text-secondary)",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--border-subtle)",
                    }}>
                      {c.priority}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h2 style={{
                  margin: 0, fontSize: "var(--text-md)", fontWeight: 700,
                  color: "var(--text-primary)", letterSpacing: "var(--tracking-snug)",
                }}>
                  {c.title}
                </h2>

                {/* Description */}
                {c.description && (
                  <p style={{
                    margin: "6px 0 0", fontSize: "var(--text-sm)",
                    color: "var(--text-secondary)", lineHeight: 1.5,
                  }}>
                    {truncate(c.description)}
                  </p>
                )}

                {/* Meta */}
                <div style={{
                  display: "flex", gap: 16, marginTop: 10,
                  fontSize: 11, color: "var(--text-disabled)", flexWrap: "wrap" as const,
                }}>
                  {c.lead && (
                    <span>
                      <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Lead </span>
                      {c.lead.name}
                    </span>
                  )}
                  <span>
                    <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Created </span>
                    {fmtDate(c.createdAt)}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>
                    {relativeTime(c.updatedAt)}
                  </span>
                </div>
              </div>

              {/* Right side */}
              <div style={{
                display: "flex", flexDirection: "column" as const, alignItems: "flex-end",
                justifyContent: "space-between", gap: 8,
              }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-disabled)",
                  letterSpacing: "0.04em",
                }}>
                  {c.evidenceCount ?? 0} evidence
                </span>
                <a
                  className="btn btn-secondary btn-sm"
                  href={`/cases/${c.id}`}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Open case: ${c.title}`}
                  style={{ fontSize: 11, whiteSpace: "nowrap" as const }}
                >
                  Open →
                </a>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: "var(--space-5)", padding: "var(--space-3) 0",
        borderTop: "1px solid var(--border-subtle)",
        fontSize: 11, color: "var(--text-disabled)",
        fontFamily: "var(--font-mono)",
      }}>
        <span>{filtered.length} of {cases.length} cases shown</span>
        <span>EviChain · Case register</span>
      </div>
    </WorkspaceShell>
  );
}
