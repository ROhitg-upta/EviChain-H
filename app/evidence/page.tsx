"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth-context";
import {
  getCases, getEvidence, bulkDownloadEvidence, downloadEvidenceCsv,
  type CaseRecord, type EvidenceRecord,
} from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

/* ── Helpers ───────────────────────────────────────────────────────── */

function fmtBytes(n: number) {
  if (n === 0) return "0 B";
  const k = 1024, sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${(n / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function shortHash(h: string) { return `${h.slice(0, 12)}…${h.slice(-6)}`; }

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

const STATUS_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  VERIFIED: { color: "var(--accent-verified)", bg: "var(--accent-verified-dim)", border: "var(--accent-verified-border)" },
  PENDING:  { color: "var(--accent-pending)",  bg: "var(--accent-pending-dim)",  border: "var(--accent-pending-border)" },
  FLAGGED:  { color: "var(--accent-danger)",   bg: "var(--accent-danger-dim)",   border: "var(--accent-danger-border)" },
  SEALED:   { color: "var(--accent-active)",   bg: "var(--accent-active-dim)",   border: "var(--accent-active-border)" },
};

/* ── Component ─────────────────────────────────────────────────────── */

export default function EvidenceListPage() {
  const { user, loading: authLoading, accessToken } = useAuth();

  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState("");

  const [search, setSearch] = useState("");
  const [caseFilter, setCaseFilter] = useState("ALL");
  const [mimeFilter, setMimeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"date" | "name" | "type" | "case">("date");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  function toggleSelect(id: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((r) => r.id)));
  }

  async function handleBulkDownload() {
    if (!accessToken || selectedIds.size === 0) return;
    setDownloadingZip(true);
    try {
      const blob = await bulkDownloadEvidence(accessToken, Array.from(selectedIds));
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `evidence-bundle-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { console.error("Bulk download error:", err); }
    finally { setDownloadingZip(false); }
  }

  async function handleExportCsv() {
    if (!accessToken) return;
    setExportingCsv(true);
    try {
      const blob = await downloadEvidenceCsv(accessToken, {
        status: statusFilter !== "ALL" ? statusFilter : undefined,
        caseId: caseFilter !== "ALL" ? caseFilter : undefined,
        type: mimeFilter !== "ALL" ? mimeFilter : undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `evidence-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { console.error("CSV export error:", err); }
    finally { setExportingCsv(false); }
  }

  useEffect(() => {
    if (!accessToken) return;
    setFetching(true);
    Promise.all([getEvidence(accessToken), getCases(accessToken)])
      .then(([ev, cs]) => { setRecords(ev); setCases(cs); })
      .catch((err: unknown) => setFetchError(err instanceof Error ? err.message : "Failed to load data"))
      .finally(() => setFetching(false));
  }, [accessToken]);

  const categories = useMemo(() => {
    const set = new Set(records.map((r) => mimeCategory(r.mimeType)));
    return Array.from(set).sort();
  }, [records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records
      .filter((r) => {
        if (q && !`${r.id} ${r.name} ${r.ownerOrg} ${r.sha256} ${r.mimeType}`.toLowerCase().includes(q)) return false;
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

  const stats = useMemo(() => ({
    total: records.length,
    verified: records.filter((r) => r.status === "VERIFIED").length,
    pending: records.filter((r) => r.status === "PENDING").length,
    flagged: records.filter((r) => r.status === "FLAGGED").length,
  }), [records]);

  if (authLoading) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Evidence" }]}>
        <div style={{ display: "grid", gap: 10 }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: "var(--radius-md)" }} />)}
        </div>
      </WorkspaceShell>
    );
  }

  const th: React.CSSProperties = {
    padding: "10px 14px", fontSize: 10, fontFamily: "var(--font-mono)",
    fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase",
    color: "var(--text-secondary)", textAlign: "left", borderBottom: "1px solid var(--border-default)",
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    padding: "12px 14px", fontSize: "var(--text-sm)", color: "var(--text-primary)",
    borderBottom: "1px solid var(--border-subtle)", verticalAlign: "middle",
  };

  return (
    <WorkspaceShell breadcrumbs={[{ label: "Evidence" }]}>
      {/* Page header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        paddingBottom: "var(--space-5)", marginBottom: "var(--space-5)",
        borderBottom: "1px solid var(--border-default)", flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 6 }}>EVIDENCE REGISTRY</p>
          <h1 style={{ margin: 0, fontSize: "var(--text-xl)", fontWeight: 700, letterSpacing: "var(--tracking-tight)", color: "var(--text-primary)" }}>
            All evidence
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            {records.length} record{records.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleExportCsv} disabled={exportingCsv}>
            {exportingCsv ? "Exporting…" : "Export CSV ↓"}
          </button>
          {user?.role !== "Auditor" && (
            <a href="/evidence/new" className="btn btn-primary btn-sm">+ Upload</a>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: "var(--space-5)" }}>
        {[
          { label: "Total", value: stats.total, color: "var(--text-primary)" },
          { label: "Verified", value: stats.verified, color: "var(--accent-verified)" },
          { label: "Pending", value: stats.pending, color: "var(--accent-pending)" },
          { label: "Flagged", value: stats.flagged, color: "var(--accent-danger)" },
        ].map(s => (
          <div key={s.label} style={{
            padding: "14px 16px", background: "var(--surface-raised)",
            border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)",
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-secondary)" }}>{s.label}</span>
            <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: s.color, letterSpacing: "var(--tracking-tight)", marginTop: 4 }}>
              {String(s.value).padStart(2, "0")}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: "var(--space-5)", flexWrap: "wrap" }} role="search" aria-label="Filters and search">
        <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, ID, hash…" aria-label="Search evidence" style={{ flex: "1 1 200px" }} />
        <select className="input select" value={caseFilter} onChange={(e) => setCaseFilter(e.target.value)} aria-label="Filter by case" style={{ flex: "0 0 150px" }}>
          <option value="ALL">All cases</option>
          <option value="">No case linked</option>
          {cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select className="input select" value={mimeFilter} onChange={(e) => setMimeFilter(e.target.value)} aria-label="Filter by type" style={{ flex: "0 0 130px" }}>
          <option value="ALL">All types</option>
          {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        <select className="input select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" style={{ flex: "0 0 130px" }}>
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="VERIFIED">Verified</option>
          <option value="FLAGGED">Flagged</option>
          <option value="SEALED">Sealed</option>
        </select>
      </div>

      {/* Error */}
      {fetchError && (
        <div role="alert" style={{ padding: "12px 16px", background: "var(--accent-danger-dim)", border: "1px solid var(--accent-danger-border)", borderRadius: "var(--radius-md)", color: "var(--accent-danger)", fontSize: "var(--text-sm)", marginBottom: "var(--space-5)" }}>
          {fetchError}
        </div>
      )}

      {/* Bulk banner */}
      {selectedIds.size > 0 && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 12, padding: "10px 16px",
          background: "var(--accent-active-dim)", border: "1px solid var(--accent-active-border)",
          borderRadius: "var(--radius-md)", fontSize: "var(--text-sm)", color: "var(--accent-active)",
        }}>
          <span><strong>{selectedIds.size}</strong> item{selectedIds.size !== 1 ? "s" : ""} selected</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleBulkDownload} disabled={downloadingZip}>
              {downloadingZip ? "Generating…" : `Download (${selectedIds.size}) ↓`}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>Deselect</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{
        background: "var(--surface-raised)", border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)", overflow: "hidden",
      }}>
        {fetching ? (
          <div style={{ padding: 24 }}>
            {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 44, borderRadius: "var(--radius-sm)", marginBottom: 6 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>◉</div>
            <strong style={{ color: "var(--text-primary)" }}>
              {records.length === 0 ? "No evidence registered yet" : "No records match your filters"}
            </strong>
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", margin: "8px 0 16px" }}>
              {records.length === 0 ? "Upload evidence to begin building your registry." : "Try adjusting your search or filter criteria."}
            </p>
            {records.length === 0 && user?.role !== "Auditor" && (
              <a href="/evidence/new" className="btn btn-primary btn-md">+ Upload evidence</a>
            )}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 800, borderCollapse: "collapse" }} aria-label="Evidence records">
              <thead>
                <tr style={{ background: "var(--surface-sunken)" }}>
                  <th style={{ ...th, width: 36, paddingLeft: 12 }}>
                    <input type="checkbox" aria-label="Select all" checked={filtered.length > 0 && selectedIds.size === filtered.length} onChange={toggleSelectAll} style={{ accentColor: "var(--brand-600)" }} />
                  </th>
                  <th style={th}>Evidence</th>
                  <th style={th}>Case</th>
                  <th style={th}>Uploader</th>
                  <th style={th}>Status</th>
                  <th style={th}>SHA-256</th>
                  <th style={th}>Size</th>
                  <th style={th}>Uploaded</th>
                  <th style={{ ...th, width: 70 }}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => (window.location.href = `/evidence/${r.id}`)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") window.location.href = `/evidence/${r.id}`; }}
                    aria-label={`View ${r.name}`}
                    style={{
                      cursor: "pointer",
                      transition: "background 0.1s ease",
                      background: selectedIds.has(r.id) ? "rgba(74,190,148,0.06)" : "transparent",
                    }}
                    onMouseEnter={(e) => { if (!selectedIds.has(r.id)) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = selectedIds.has(r.id) ? "rgba(74,190,148,0.06)" : "transparent"; }}
                  >
                    <td style={{ ...td, width: 36, paddingLeft: 12 }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${r.name}`} checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} style={{ accentColor: "var(--brand-600)" }} />
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 32, height: 32, borderRadius: "var(--radius-sm)",
                          background: "var(--surface-overlay)", border: "1px solid var(--border-subtle)",
                          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                          color: "var(--text-secondary)", letterSpacing: "0.05em", flexShrink: 0,
                        }}>{mimeIcon(r.mimeType)}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "var(--text-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{r.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-disabled)" }}>{mimeCategory(r.mimeType)} · {r.ownerOrg}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ ...td, fontSize: "var(--text-sm)" }}>{r.case?.title ?? <span style={{ color: "var(--text-disabled)" }}>—</span>}</td>
                    <td style={{ ...td, fontSize: "var(--text-sm)" }}>{r.collectedBy?.name ?? <span style={{ color: "var(--text-disabled)" }}>—</span>}</td>
                    <td style={td}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "2px 8px", borderRadius: "var(--radius-sm)",
                        fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 500,
                        letterSpacing: "0.06em", textTransform: "uppercase",
                        color: STATUS_COLORS[r.status]?.color ?? "var(--text-secondary)",
                        background: STATUS_COLORS[r.status]?.bg ?? "rgba(255,255,255,0.04)",
                        border: `1px solid ${STATUS_COLORS[r.status]?.border ?? "var(--border-default)"}`,
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", opacity: 0.8 }} />
                        {r.status}
                      </span>
                    </td>
                    <td style={td}>
                      <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--neutral-600)", letterSpacing: "0.02em" }} title={r.sha256}>{shortHash(r.sha256)}</code>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap", fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{fmtBytes(r.sizeBytes)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap", fontSize: 12, color: "var(--text-secondary)" }}>{fmtDate(r.createdAt)}</td>
                    <td style={{ ...td, width: 70 }}>
                      <a className="btn btn-ghost btn-sm" href={`/evidence/${r.id}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 11 }}>View</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: "flex", justifyContent: "space-between", marginTop: "var(--space-5)",
        padding: "var(--space-3) 0", borderTop: "1px solid var(--border-subtle)",
        fontSize: 11, color: "var(--text-disabled)", fontFamily: "var(--font-mono)",
      }}>
        <span>{filtered.length} of {records.length} records shown</span>
        <span>EviChain · Evidence registry</span>
      </div>
    </WorkspaceShell>
  );
}
