"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth-context";
import { getCases, getEvidence, type CaseRecord, type EvidenceRecord } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────

function fmtBytes(n: number) {
  if (n === 0) return "0 B";
  const k = 1024, sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${(n / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(iso));
}

function shortHash(h: string) {
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}

function mimeCategory(mime: string): string {
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("word") || mime.includes("document")) return "Document";
  if (mime.includes("excel") || mime.includes("sheet")) return "Spreadsheet";
  if (mime.includes("zip") || mime.includes("tar") || mime.includes("gzip")) return "Archive";
  if (mime === "text/plain") return "Text";
  if (mime === "text/csv") return "CSV";
  return "Other";
}

function mimeIcon(mime: string) {
  const cat = mimeCategory(mime);
  const map: Record<string, string> = {
    Image: "IMG", Video: "VID", PDF: "PDF", Document: "DOC",
    Spreadsheet: "XLS", Archive: "ZIP", Text: "TXT", CSV: "CSV",
  };
  return map[cat] ?? "FILE";
}

const STATUS_CLASS: Record<string, string> = {
  PENDING: "pending", VERIFIED: "verified", FLAGGED: "flagged", SEALED: "sealed",
};

// ── Component ─────────────────────────────────────────────────────

export default function EvidenceListPage() {
  const { user, loading: authLoading, accessToken } = useAuth();

  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [caseFilter, setCaseFilter] = useState("ALL");
  const [mimeFilter, setMimeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"date" | "name" | "type" | "case">("date");

  // Redirect if not authed
  useEffect(() => {
    if (!authLoading && !user) window.location.replace("/login");
  }, [authLoading, user]);

  // Fetch data
  useEffect(() => {
    if (!accessToken) return;
    setFetching(true);
    Promise.all([getEvidence(accessToken), getCases(accessToken)])
      .then(([ev, cs]) => { setRecords(ev); setCases(cs); })
      .catch((err: unknown) =>
        setFetchError(err instanceof Error ? err.message : "Failed to load data"),
      )
      .finally(() => setFetching(false));
  }, [accessToken]);

  // Derived category list for filter dropdown
  const categories = useMemo(() => {
    const set = new Set(records.map((r) => mimeCategory(r.mimeType)));
    return Array.from(set).sort();
  }, [records]);

  // Filtered + sorted list
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records
      .filter((r) => {
        if (q && !`${r.id} ${r.name} ${r.ownerOrg} ${r.sha256} ${r.mimeType}`
          .toLowerCase().includes(q)) return false;
        if (caseFilter !== "ALL" && r.caseId !== caseFilter) return false;
        if (mimeFilter !== "ALL" && mimeCategory(r.mimeType) !== mimeFilter) return false;
        if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "type") return mimeCategory(a.mimeType).localeCompare(mimeCategory(b.mimeType));
        if (sortBy === "case") return (a.case?.title ?? "").localeCompare(b.case?.title ?? "");
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [records, search, caseFilter, mimeFilter, statusFilter, sortBy]);

  // Stats
  const stats = useMemo(() => ({
    total: records.length,
    verified: records.filter((r) => r.status === "VERIFIED").length,
    pending: records.filter((r) => r.status === "PENDING").length,
    flagged: records.filter((r) => r.status === "FLAGGED").length,
  }), [records]);

  if (authLoading) return <main className="evidence-shell"><p className="ev-loading">Loading…</p></main>;

  return (
    <main className="evidence-shell">
      {/* Top bar */}
      <header className="ev-topbar">
        <a className="ev-brand" href="/" aria-label="EviChain home">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>
            <strong>EviChain</strong>
            <small>Evidence registry</small>
          </span>
        </a>
        <nav className="ev-nav" aria-label="Primary navigation">
          <a href="/evidence/new" className="button button-primary small-button">
            + Upload evidence
          </a>
          <a href="/case">Cases</a>
          <a href="/verify">Public verify</a>
          {user && (
            <span className="ev-user-badge" aria-label={`Signed in as ${user.name}`}>
              <span className="operator" aria-hidden="true">{user.initials}</span>
              <span>{user.name}</span>
            </span>
          )}
        </nav>
      </header>

      {/* Page header */}
      <div className="page-header">
        <div>
          <p className="eyebrow">EVIDENCE REGISTRY</p>
          <h1>All evidence</h1>
          <p className="ev-page-sub">
            {records.length} record{records.length !== 1 ? "s" : ""} registered
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <section className="ev-stats-strip" aria-label="Evidence summary">
        <div className="ev-stat-item">
          <span className="ev-stat-label">Total</span>
          <strong className="ev-stat-value">{String(stats.total).padStart(2, "0")}</strong>
          <small>Registered</small>
        </div>
        <div className="ev-stat-item ev-stat--green">
          <span className="ev-stat-label">Verified</span>
          <strong className="ev-stat-value">{String(stats.verified).padStart(2, "0")}</strong>
          <small>Integrity confirmed</small>
        </div>
        <div className="ev-stat-item ev-stat--amber">
          <span className="ev-stat-label">Pending</span>
          <strong className="ev-stat-value">{String(stats.pending).padStart(2, "0")}</strong>
          <small>Awaiting review</small>
        </div>
        <div className="ev-stat-item ev-stat--red">
          <span className="ev-stat-label">Flagged</span>
          <strong className="ev-stat-value">{String(stats.flagged).padStart(2, "0")}</strong>
          <small>Requires attention</small>
        </div>
      </section>

      {/* Filters */}
      <section className="filters-section" aria-label="Filters and search">
        <input
          className="ev-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, ID, owner, hash…"
          aria-label="Search evidence"
        />
        <select
          value={caseFilter}
          onChange={(e) => setCaseFilter(e.target.value)}
          aria-label="Filter by case"
        >
          <option value="ALL">All cases</option>
          <option value="">No case linked</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        <select
          value={mimeFilter}
          onChange={(e) => setMimeFilter(e.target.value)}
          aria-label="Filter by file type"
        >
          <option value="ALL">All types</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="VERIFIED">Verified</option>
          <option value="FLAGGED">Flagged</option>
          <option value="SEALED">Sealed</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          aria-label="Sort by"
        >
          <option value="date">Newest first</option>
          <option value="name">Name A–Z</option>
          <option value="type">File type</option>
          <option value="case">Case</option>
        </select>
      </section>

      {/* Error */}
      {fetchError && (
        <div className="error-message" role="alert">{fetchError}</div>
      )}

      {/* Table */}
      <div className="evidence-table panel">
        {fetching ? (
          <p className="ev-loading" role="status" aria-live="polite">Loading evidence…</p>
        ) : filtered.length === 0 ? (
          <div className="ev-empty-state">
            <strong>
              {records.length === 0 ? "No evidence registered yet." : "No records match your filters."}
            </strong>
            {records.length === 0 && (
              <p><a href="/evidence/new">Upload your first evidence file →</a></p>
            )}
          </div>
        ) : (
          <div className="table-container">
            <table aria-label="Evidence records">
              <thead>
                <tr>
                  <th scope="col">Evidence</th>
                  <th scope="col">Case</th>
                  <th scope="col">Uploader</th>
                  <th scope="col">Status</th>
                  <th scope="col">SHA-256</th>
                  <th scope="col">Size</th>
                  <th scope="col">Uploaded</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => (window.location.href = `/evidence/${r.id}`)}
                    className="ev-table-row"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") window.location.href = `/evidence/${r.id}`;
                    }}
                    aria-label={`View evidence ${r.name}`}
                  >
                    <td>
                      <div className="file-cell">
                        <span className="ev-mime-badge" aria-hidden="true">
                          {mimeIcon(r.mimeType)}
                        </span>
                        <div>
                          <strong>{r.name}</strong>
                          <small>{mimeCategory(r.mimeType)} · {r.ownerOrg}</small>
                        </div>
                      </div>
                    </td>
                    <td>{r.case?.title ?? <span className="ev-muted">—</span>}</td>
                    <td>{r.collectedBy?.name ?? <span className="ev-muted">—</span>}</td>
                    <td>
                      <span className={`status ${STATUS_CLASS[r.status] ?? "pending"}`} aria-label={`Status: ${r.status}`}>
                        <span aria-hidden="true" />
                        {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td>
                      <code className="ev-hash-chip" title={r.sha256}>{shortHash(r.sha256)}</code>
                    </td>
                    <td>{fmtBytes(r.sizeBytes)}</td>
                    <td>{fmtDate(r.createdAt)}</td>
                    <td>
                      <a
                        className="button button-secondary small-button"
                        href={`/evidence/${r.id}`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`View details for ${r.name}`}
                      >
                        View
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <footer className="ev-list-footer">
        <span>{filtered.length} of {records.length} records shown</span>
        <span>EviChain · Evidence registry</span>
      </footer>
    </main>
  );
}
