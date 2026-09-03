"use client";

import React, { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "../../auth-context";
import {
  getEvidenceById,
  downloadEvidence,
  verifyByHash,
  downloadEvidenceCertificate,
  transferEvidenceCustody,
  getAllUsers,
  type EvidenceRecord,
  type CustodyEvent,
  type PublicVerifyResult,
  type UserRecord,
} from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

// ── Helpers ───────────────────────────────────────────────────────

function fmtBytes(n: number) {
  if (n === 0) return "0 B";
  const k = 1024, s = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${(n / Math.pow(k, i)).toFixed(2)} ${s[i]}`;
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long", timeStyle: "short",
  }).format(new Date(iso));
}

async function browserSha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function fmtRelative(iso: string): string {

  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return fmtDate(iso);
}

const EVENT_META: Record<string, { label: string; icon: string; cls: string; desc: string; bg: string; color: string; border: string }> = {
  CREATED:     { label: "Registered",   icon: "📁", cls: "ev-event--created",     desc: "Evidence registered with SHA-256 fingerprint", bg: "rgba(34, 211, 238, 0.12)", color: "var(--accent-active, #22d3ee)", border: "rgba(34, 211, 238, 0.3)" },
  TRANSFERRED: { label: "Transferred",  icon: "⇄", cls: "ev-event--transferred", desc: "Chain of custody transferred", bg: "rgba(251, 191, 36, 0.12)", color: "var(--accent-pending, #fbbf24)", border: "rgba(251, 191, 36, 0.3)" },
  ACCESSED:    { label: "Accessed",     icon: "👁", cls: "ev-event--accessed",    desc: "Evidence detail record viewed", bg: "rgba(255, 255, 255, 0.05)", color: "var(--text-secondary, #9ca3af)", border: "var(--border-default)" },
  DOWNLOADED:  { label: "Downloaded",   icon: "⤓", cls: "ev-event--downloaded",  desc: "Authenticated evidence binary downloaded", bg: "rgba(181, 245, 66, 0.12)", color: "var(--accent-verified, #b5f542)", border: "rgba(181, 245, 66, 0.3)" },
  DELETED:     { label: "Deleted",      icon: "🗑", cls: "ev-event--deleted",     desc: "Evidence was deleted", bg: "rgba(244, 63, 94, 0.12)", color: "var(--accent-danger, #f43f5e)", border: "rgba(244, 63, 94, 0.3)" },
};

function eventMeta(action: string) {
  return EVENT_META[action.toUpperCase()] ?? { label: action, icon: "•", cls: "", desc: action, bg: "rgba(255, 255, 255, 0.05)", color: "var(--text-primary)", border: "var(--border-default)" };
}

// ── Component ─────────────────────────────────────────────────────

export default function EvidenceDetailPage() {
  const routeParams = useParams();
  const id = typeof routeParams?.id === "string" ? routeParams.id : Array.isArray(routeParams?.id) ? routeParams.id[0] : "";
  const { user, loading: authLoading, accessToken } = useAuth();

  const [record, setRecord] = useState<EvidenceRecord | null>(null);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Copy hash
  const [copied, setCopied] = useState(false);

  // Client-side hash verification
  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [verifyState, setVerifyState] = useState<"idle" | "computing" | "match" | "mismatch">("idle");
  const [computedHash, setComputedHash] = useState("");

  // Server-side hash lookup (via public API)
  const [serverVerify, setServerVerify] = useState<PublicVerifyResult | null>(null);
  const [serverVerifying, setServerVerifying] = useState(false);

  // Download
  const [downloadState, setDownloadState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [downloadError, setDownloadError] = useState("");
  const [downloadToast, setDownloadToast] = useState("");

  // Timeline UI expansion
  const [expandedTimeline, setExpandedTimeline] = useState(false);

  // PDF Certificate Download
  const [certDownloading, setCertDownloading] = useState(false);

  // Custody Transfer Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [transferToUserId, setTransferToUserId] = useState("");
  const [transferToLocation, setTransferToLocation] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferSuccess, setTransferSuccess] = useState("");


  useEffect(() => {
    if (!authLoading && !user) window.location.replace("/login");
  }, [authLoading, user]);

  const loadEvidence = useCallback(() => {
    if (!accessToken || !id) return;
    setFetching(true);
    setFetchError("");
    getEvidenceById(accessToken, id)
      .then(setRecord)
      .catch((err: unknown) =>
        setFetchError(err instanceof Error ? err.message : "Failed to load record"),
      )
      .finally(() => setFetching(false));
  }, [accessToken, id]);

  useEffect(() => {
    loadEvidence();
  }, [loadEvidence]);

  // Load users when opening transfer modal
  useEffect(() => {
    if (showTransferModal && accessToken && usersList.length === 0) {
      getAllUsers(accessToken).then(setUsersList).catch(() => {});
    }
  }, [showTransferModal, accessToken, usersList.length]);

  async function handleClientVerify(e: FormEvent) {
    e.preventDefault();
    if (!verifyFile || !record) return;
    setVerifyState("computing");
    try {
      const hash = await browserSha256(verifyFile);
      setComputedHash(hash);
      setVerifyState(hash === record.sha256 ? "match" : "mismatch");
    } catch {
      setVerifyState("idle");
    }
  }

  async function handleServerVerify() {
    if (!record) return;
    setServerVerifying(true);
    try {
      const res = await verifyByHash(record.sha256);
      setServerVerify(res);
    } catch {
      setServerVerify({ sha256: record.sha256, verified: false, matched: false, evidence: null });
    } finally {
      setServerVerifying(false);
    }
  }

  async function handleDownload() {
    if (!accessToken || !record) return;
    const roleUpper = user?.role ? String(user.role).toUpperCase() : "";
    if (roleUpper === "AUDITOR") {
      setDownloadError("Auditors have read-only inspection access and cannot download raw evidence binaries.");
      return;
    }


    setDownloadState("loading");
    setDownloadError("");
    try {
      const res = await downloadEvidence(accessToken, record.id);
      triggerBlobDownload(res.blob, res.filename);
      setDownloadState("done");
      setDownloadToast(`✓ Downloaded ${res.filename}`);
      loadEvidence();
      setTimeout(() => {
        setDownloadState("idle");
        setDownloadToast("");
      }, 4000);
    } catch (err: unknown) {
      setDownloadState("error");
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function handleDownloadCertificate() {
    if (!accessToken || !record) return;
    setCertDownloading(true);
    try {
      const blob = await downloadEvidenceCertificate(accessToken, record.id);
      triggerBlobDownload(blob, `Certificate-${record.name}-${record.sha256.slice(0, 8)}.pdf`);
    } catch (err) {
      console.error(err);
    } finally {
      setCertDownloading(false);
    }
  }

  async function handleTransferSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !record || !transferToUserId) return;
    if (transferToUserId === user?.id) {
      setTransferError("Cannot transfer custody to yourself.");
      return;
    }
    setTransferring(true);
    setTransferError("");
    try {
      await transferEvidenceCustody(accessToken, record.id, {
        toUserId: transferToUserId,
        toLocation: transferToLocation.trim() || undefined,
        note: transferNote.trim() || undefined,
      });
      setTransferSuccess("Custody successfully transferred!");
      setShowTransferModal(false);
      setTransferNote("");
      setTransferToLocation("");
      setTransferToUserId("");
      loadEvidence();
      setTimeout(() => setTransferSuccess(""), 4000);
    } catch (err: unknown) {
      setTransferError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setTransferring(false);
    }
  }


  async function copyHash() {
    if (!record) return;
    await navigator.clipboard.writeText(record.sha256).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Loading / error states ────────────────────────────────────────
  if (authLoading || fetching) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Evidence", href: "/evidence" }, { label: "Evidence Detail" }]}>
        <div style={{ display: "grid", gap: 12 }}>
          {[1,2,3].map(i => (
            <div key={i} className="skeleton" style={{ height: 100, borderRadius: "var(--radius-md)" }} />
          ))}
        </div>
      </WorkspaceShell>
    );
  }

  if (fetchError || !record) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Evidence", href: "/evidence" }, { label: "Evidence Detail" }]}>
        <div className="error-message" style={{ marginTop: 24 }} role="alert">
          {fetchError || "Evidence record not found."}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={loadEvidence}>
            Retry
          </button>
          <a className="btn btn-secondary" href="/evidence">
            ← Back to evidence list
          </a>
        </div>
      </WorkspaceShell>
    );
  }

  const userRoleUpper = user?.role ? String(user.role).toUpperCase() : "";
  const isCurrentCustodian = (record.currentCustodianId || record.collectedById) === user?.id;
  const isAdmin = userRoleUpper === "ADMINISTRATOR";
  const isAuditor = userRoleUpper === "AUDITOR";
  const canTransfer = (isCurrentCustodian && userRoleUpper === "INVESTIGATOR") || isAdmin;

  const events: CustodyEvent[] = record.custodyEvents ?? [];

  // ── Main render ──────────────────────────────────────────────────
  return (
    <WorkspaceShell breadcrumbs={[{ label: "Evidence", href: "/evidence" }, { label: record.name }]}>

      {/* Page title */}
      <div className="page-header">
        <div>
          <p className="eyebrow">EVIDENCE RECORD · {record.id.slice(0, 8).toUpperCase()}</p>
          <h1>{record.name}</h1>
          <div className="ev-detail-chips">
            <span className={`ev-status-chip ev-status--${record.status.toLowerCase()}`}>
              {record.status}
            </span>
            <span className="ev-chip">{record.type}</span>
            <span className="ev-chip">{record.ownerOrg}</span>
            {record.case && (
              <a className="ev-chip ev-chip--link" href={record.caseId ? `/cases/${record.caseId}` : "/cases"}>
                {record.case.title}
              </a>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--muted, #6b7280)" }}>Current Custodian:</span>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 20,
              background: "#ecfdf5",
              border: "1px solid #10b981",
              color: "#065f46",
              fontSize: 13,
              fontWeight: 600,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
              {record.currentCustodian?.name ?? record.collectedBy?.name ?? "Unknown"}
              <small style={{ color: "#047857", fontWeight: 500 }}>({record.currentCustodian?.role ?? record.collectedBy?.role ?? "INVESTIGATOR"})</small>
            </span>
          </div>
        </div>
        <div className="ev-header-actions" style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button
            className="button button-secondary small-button"
            onClick={handleDownloadCertificate}
            disabled={certDownloading}
            title="Download court-admissible forensic PDF Certificate"
          >
            {certDownloading ? "Generating PDF…" : "📄 Hash Certificate (PDF)"}
          </button>

          {canTransfer && (
            <button
              className="button button-secondary small-button"
              onClick={() => setShowTransferModal(true)}
              title="Transfer custody to another investigator or custodian"
            >
              ⇄ Transfer custody
            </button>
          )}

          <a
            className="button button-secondary small-button"
            href={`/evidence/${record.id}/annotate`}
            title="Annotate evidence image"
          >
            ✏ Annotate
          </a>

          <button
            className="button button-primary small-button"
            onClick={handleDownload}
            disabled={downloadState === "loading" || isAuditor}
            title={isAuditor ? "Auditors have read-only inspection access: download restricted" : "Download this evidence and log custody event"}
            aria-label="Download this evidence and log custody event"
          >
            {downloadState === "loading"
              ? <span className="loading-spinner">Downloading…</span>
              : downloadState === "done"
              ? "Downloaded ✓"
              : isAuditor
              ? "Download Restricted"
              : "Download"}
          </button>
        </div>
      </div>

      {transferSuccess && (
        <div className="ev-info-banner" role="status" style={{ background: "#ecfdf5", borderColor: "#a7f3d0", color: "#065f46" }}>
          ✓ {transferSuccess}
        </div>
      )}
      {downloadToast && (
        <div className="ev-info-banner" role="status" style={{ background: "#ecfdf5", borderColor: "#a7f3d0", color: "#065f46" }}>
          {downloadToast}
        </div>
      )}
      {downloadError && (
        <div className="error-message" role="alert">{downloadError}</div>
      )}


      {/* Detail layout */}
      <div className="detail-grid">
        {/* Left column */}
        <div className="detail-left">

          {/* SHA-256 card */}
          <div className="detail-card ev-hash-section">
            <p className="eyebrow">SHA-256 FINGERPRINT</p>
            <code className="ev-full-hash" aria-label={`SHA-256: ${record.sha256}`}>
              {record.sha256}
            </code>
            <button
              className="ev-copy-btn"
              onClick={copyHash}
              aria-label={copied ? "Hash copied to clipboard" : "Copy SHA-256 hash to clipboard"}
            >
              {copied ? "Copied ✓" : "Copy hash"}
            </button>
          </div>

          {/* Metadata */}
          <div className="detail-card">
            <p className="eyebrow">METADATA</p>
            <dl className="ev-meta-dl">
              <div><dt>File size</dt><dd>{fmtBytes(record.sizeBytes)}</dd></div>
              <div><dt>MIME type</dt><dd>{record.mimeType}</dd></div>
              <div><dt>Evidence ID</dt><dd><code>{record.id}</code></dd></div>
              <div>
                <dt>Collected by</dt>
                <dd>{record.collectedBy ? `${record.collectedBy.name} (${record.collectedBy.role})` : "Unknown"}</dd>
              </div>
              <div>
                <dt>Linked case</dt>
                <dd>{record.case ? record.case.title : <span className="ev-muted">None</span>}</dd>
              </div>
              <div><dt>Registered</dt><dd>{fmtDate(record.createdAt)}</dd></div>
              <div><dt>Last updated</dt><dd>{fmtDate(record.updatedAt)}</dd></div>
            </dl>
          </div>

          {/* Client-side integrity verify */}
          <div className="detail-card ev-verify-section">
            <p className="eyebrow">INTEGRITY CHECK — LOCAL</p>
            <h2>Verify file in browser</h2>
            <p className="ev-verify-desc">
              Upload the original file. SHA-256 is computed locally in your browser
              (the file is never sent to the server) and compared against the
              registered fingerprint.
            </p>

            <form onSubmit={handleClientVerify} className="ev-verify-form" aria-label="Local file integrity check">
              <label htmlFor="verify-file-input" className="ev-file-pick-label">
                <span className="sr-only">Choose file to verify</span>
                <input
                  id="verify-file-input"
                  type="file"
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setVerifyFile(e.target.files?.[0] ?? null)
                  }
                />
              </label>
              <button
                className="button button-primary"
                type="submit"
                disabled={!verifyFile || verifyState === "computing"}
                aria-label="Compute SHA-256 and compare to registered fingerprint"
              >
                {verifyState === "computing"
                  ? <span className="loading-spinner">Computing…</span>
                  : "Verify integrity"}
              </button>
            </form>

            {verifyState === "match" && (
              <div className="ev-verify-result ev-verify-result--match" role="status" aria-live="polite">
                <strong>Hash match — integrity confirmed</strong>
                <p>This file is identical to the registered evidence.</p>
                <code>{computedHash}</code>
              </div>
            )}
            {verifyState === "mismatch" && (
              <div className="ev-verify-result ev-verify-result--fail" role="alert" aria-live="assertive">
                <strong>Hash mismatch — file may be altered</strong>
                <p>Computed: <code>{computedHash.slice(0, 20)}…</code></p>
                <p>Registered: <code>{record.sha256.slice(0, 20)}…</code></p>
              </div>
            )}
          </div>

          {/* Server-side registry check */}
          <div className="detail-card ev-verify-section">
            <p className="eyebrow">INTEGRITY CHECK — REGISTRY</p>
            <h2>Check against database</h2>
            <p className="ev-verify-desc">
              Confirm this hash is still present and unmodified in the EviChain
              database via the public verification API.
            </p>
            <button
              className="button button-secondary"
              onClick={handleServerVerify}
              disabled={serverVerifying}
              aria-label="Check this hash in the EviChain database"
            >
              {serverVerifying
                ? <span className="loading-spinner">Checking…</span>
                : "Check registry"}
            </button>
            {serverVerify && (
              <div
                className={`ev-verify-result ${serverVerify.matched ? "ev-verify-result--match" : "ev-verify-result--fail"}`}
                role="status"
                aria-live="polite"
              >
                <strong>
                  {serverVerify.matched
                    ? "Hash found in registry ✓"
                    : "Hash not found in registry ✗"}
                </strong>
                {!serverVerify.matched && (
                  <p>This evidence may have been deleted or the database is unavailable.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column — custody timeline */}
        <div className="detail-right">
          <div className="detail-card timeline-card">

            <p className="eyebrow">CHAIN OF CUSTODY</p>
            <div className="timeline-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Custody timeline</h2>
              <span className="ev-chip" aria-label={`${events.length} custody events`}>{events.length} events</span>
            </div>

            {events.length === 0 ? (
              <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--muted, #6b7280)" }}>
                <p style={{ margin: 0, fontWeight: 500 }}>No custody events recorded yet.</p>
                <small>Initial custody registration will appear here.</small>
              </div>
            ) : (
              <div>
                <ol className="timeline" style={{ listStyle: "none", padding: 0, margin: 0 }} aria-label="Custody event timeline">
                  {(expandedTimeline ? events : events.slice(0, 5)).map((ev, idx) => {
                    const meta = eventMeta(ev.action);
                    return (
                      <li
                        key={ev.id}
                        style={{
                          display: "flex",
                          gap: 14,
                          position: "relative",
                          paddingBottom: idx === (expandedTimeline ? events.length : Math.min(events.length, 5)) - 1 ? 0 : 20,
                        }}
                      >
                        {/* Timeline connector vertical line */}
                        {idx < (expandedTimeline ? events.length : Math.min(events.length, 5)) - 1 && (
                          <div
                            style={{
                              position: "absolute",
                              left: 15,
                              top: 32,
                              bottom: 0,
                              width: 2,
                              background: "#e5e7eb",
                            }}
                            aria-hidden="true"
                          />
                        )}

                        {/* Action Icon Badge */}
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            background: meta.bg,
                            border: `1.5px solid ${meta.border}`,
                            color: meta.color,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 14,
                            fontWeight: 700,
                            flexShrink: 0,
                            zIndex: 1,
                          }}
                          aria-hidden="true"
                        >
                          {meta.icon}
                        </div>

                        {/* Event Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6 }}>
                            <strong style={{ fontSize: 14, color: "#111827" }}>{meta.label}</strong>
                            <small
                              style={{ color: "#6b7280", fontSize: 12 }}
                              title={new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeStyle: "medium" }).format(new Date(ev.timestamp))}
                            >
                              {fmtRelative(ev.timestamp)}
                            </small>
                          </div>

                          <div style={{ fontSize: 12, color: "#4b5563", marginTop: 2 }}>
                            Actor: <strong>{ev.actor?.name ?? "System"}</strong>{" "}
                            {ev.actor?.role && (
                              <span style={{ fontSize: 11, background: "#f3f4f6", padding: "1px 5px", borderRadius: 4, color: "#374151" }}>
                                {ev.actor.role}
                              </span>
                            )}
                          </div>

                          {ev.action === "TRANSFERRED" && (
                            <div style={{
                              margin: "6px 0",
                              padding: "6px 10px",
                              background: "#fffbeb",
                              border: "1px solid #fef3c7",
                              borderRadius: 6,
                              fontSize: 12,
                              color: "#92400e",
                            }}>
                              <span>From: <strong>{ev.fromUser?.name || "Previous Holder"}</strong></span>
                              <span style={{ margin: "0 6px" }}>→</span>
                              <span>To: <strong>{ev.toUser?.name || "New Custodian"}</strong></span>
                            </div>
                          )}

                          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#374151" }}>{ev.note}</p>
                          {ev.toLocation && (
                            <small style={{ color: "#6b7280", display: "block", marginTop: 2 }}>
                              Location: {ev.toLocation}
                            </small>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {events.length > 5 && (
                  <button
                    type="button"
                    className="button button-secondary small-button"
                    style={{ marginTop: 12, width: "100%" }}
                    onClick={() => setExpandedTimeline(!expandedTimeline)}
                  >
                    {expandedTimeline ? "Show fewer events ↑" : `Show all ${events.length} events (+${events.length - 5} older) ↓`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custody Transfer Modal */}
      {showTransferModal && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: "blur(2px)",
          }}
          role="dialog"
          aria-labelledby="transfer-modal-title"
          aria-modal="true"
        >
          <div
            className="modal-content"
            style={{
              background: "white",
              padding: 24,
              borderRadius: 8,
              maxWidth: 500,
              width: "92%",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 id="transfer-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                Transfer Evidence Custody
              </h2>
              <button
                type="button"
                onClick={() => { setShowTransferModal(false); setTransferError(""); }}
                disabled={transferring}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}
                aria-label="Close transfer dialog"
              >
                ×
              </button>
            </div>

            <p style={{ fontSize: 13, color: "var(--muted, #6b7280)", marginBottom: 16 }}>
              Transfer formal legal custody of <strong>{record.name}</strong> to another verified investigator or custodian.
            </p>

            {/* Current Custodian Line */}
            <div style={{ fontSize: 13, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "8px 12px", marginBottom: 14 }}>
              Current Custodian: <strong>{record.currentCustodian?.name ?? record.collectedBy?.name ?? "Unknown"}</strong> ({record.currentCustodian?.role ?? record.collectedBy?.role ?? "INVESTIGATOR"})
            </div>

            {/* Confirmation Summary if recipient is selected */}
            {(() => {
              const target = usersList.find((u) => u.id === transferToUserId);
              return target ? (
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "8px 12px", marginBottom: 14, fontSize: 13, color: "#1e40af" }}>
                  Confirm transfer of custody from <strong>{record.currentCustodian?.name || record.collectedBy?.name || "Current Custodian"}</strong> to <strong>{target.name} ({target.role})</strong>?
                </div>
              ) : null;
            })()}

            {transferError && (
              <div className="error-message" role="alert" style={{ marginBottom: 12, padding: "8px 12px" }}>
                {transferError}
              </div>
            )}

            <form onSubmit={handleTransferSubmit}>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="label" htmlFor="transfer-recipient">Recipient Operator (Investigator / Custodian) *</label>
                <select
                  id="transfer-recipient"
                  className="select"
                  value={transferToUserId}
                  onChange={(e) => setTransferToUserId(e.target.value)}
                  required
                  disabled={transferring}
                  style={{ width: "100%" }}
                >
                  <option value="">Select recipient investigator…</option>
                  {usersList
                    .filter((u) => u.id !== user?.id && u.role !== "AUDITOR")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role}) — {u.email}
                      </option>
                    ))}
                </select>
                <small style={{ color: "#6b7280", fontSize: 11, marginTop: 4, display: "block" }}>
                  Note: Auditors have read-only inspection access and cannot hold chain of custody.
                </small>
              </div>

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="label" htmlFor="transfer-location">Destination / Transfer Location</label>
                <input
                  id="transfer-location"
                  type="text"
                  className="input"
                  value={transferToLocation}
                  disabled={transferring}
                  onChange={(e) => setTransferToLocation(e.target.value)}
                  placeholder="e.g. Forensics Vault A, Locker 14"
                  style={{ width: "100%" }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 18 }}>
                <label className="label" htmlFor="transfer-note">Transfer Reason / Chain of Custody Note</label>
                <textarea
                  id="transfer-note"
                  className="textarea"
                  value={transferNote}
                  disabled={transferring}
                  onChange={(e) => setTransferNote(e.target.value)}
                  placeholder="Reason for handoff, physical condition, forensic handover protocol..."
                  rows={3}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => { setShowTransferModal(false); setTransferError(""); }}
                  disabled={transferring}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={transferring || !transferToUserId}
                >
                  {transferring ? "Transferring…" : "Confirm Transfer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}

