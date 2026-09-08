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
  getEvidenceIntegrity,
  assessEvidenceIntegrity,
  acknowledgeIntegrityFinding,
  resolveIntegrityFinding,
  type EvidenceRecord,
  type CustodyEvent,
  type PublicVerifyResult,
  type UserRecord,
  type EvidenceIntegrityData,
  type IntegrityFindingRecord,
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

  // Module 15: Evidence Integrity Intelligence Engine State
  const [integrityData, setIntegrityData] = useState<EvidenceIntegrityData | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [integrityAssessing, setIntegrityAssessing] = useState(false);
  const [integrityError, setIntegrityError] = useState("");
  const [resolveModalFinding, setResolveModalFinding] = useState<IntegrityFindingRecord | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolveSubmitting, setResolveSubmitting] = useState(false);
  const [resolveError, setResolveError] = useState("");

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

  const loadIntegrity = useCallback(() => {
    if (!accessToken || !id) return;
    setIntegrityLoading(true);
    setIntegrityError("");
    getEvidenceIntegrity(id, accessToken)
      .then(setIntegrityData)
      .catch((err) => setIntegrityError(err instanceof Error ? err.message : "Failed to load integrity report"))
      .finally(() => setIntegrityLoading(false));
  }, [accessToken, id]);

  useEffect(() => {
    loadEvidence();
  }, [loadEvidence]);

  useEffect(() => {
    if (record) {
      loadIntegrity();
    }
  }, [record, loadIntegrity]);

  async function handleAssessIntegrity() {
    if (!accessToken || !id) return;
    setIntegrityAssessing(true);
    setIntegrityError("");
    try {
      const data = await assessEvidenceIntegrity(id, accessToken);
      setIntegrityData(data);
    } catch (err: unknown) {
      setIntegrityError(err instanceof Error ? err.message : "Assessment failed");
    } finally {
      setIntegrityAssessing(false);
    }
  }

  async function handleAcknowledgeFinding(findingId: string) {
    if (!accessToken) return;
    try {
      await acknowledgeIntegrityFinding(findingId, accessToken);
      loadIntegrity();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to acknowledge finding");
    }
  }

  async function handleResolveFindingSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !resolveModalFinding || !resolutionNote.trim()) return;
    setResolveSubmitting(true);
    setResolveError("");
    try {
      await resolveIntegrityFinding(resolveModalFinding.id, resolutionNote.trim(), accessToken);
      setResolveModalFinding(null);
      setResolutionNote("");
      loadIntegrity();
    } catch (err: unknown) {
      setResolveError(err instanceof Error ? err.message : "Failed to resolve finding");
    } finally {
      setResolveSubmitting(false);
    }
  }

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
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Current Custodian:</span>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 20,
              background: "var(--accent-verified-dim)",
              border: "1px solid var(--accent-verified-border)",
              color: "var(--accent-verified)",
              fontSize: 13,
              fontWeight: 600,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-verified)" }} />
              {record.currentCustodian?.name ?? record.collectedBy?.name ?? "Unknown"}
              <small style={{ color: "var(--text-secondary)", fontWeight: 500 }}>({record.currentCustodian?.role ?? record.collectedBy?.role ?? "INVESTIGATOR"})</small>
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
        <div className="ev-info-banner" role="status" style={{ background: "var(--accent-verified-dim)", borderColor: "var(--accent-verified-border)", color: "var(--accent-verified)" }}>
          ✓ {transferSuccess}
        </div>
      )}
      {downloadToast && (
        <div className="ev-info-banner" role="status" style={{ background: "var(--accent-verified-dim)", borderColor: "var(--accent-verified-border)", color: "var(--accent-verified)" }}>
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

          {/* ── MODULE 15: Evidence Integrity Intelligence Report ── */}
          <div className="detail-card ev-integrity-section" style={{
            background: "var(--surface-raised, #181b20)",
            border: "1px solid var(--border-default, #23272f)",
            borderRadius: "8px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <p className="eyebrow" style={{ color: "var(--brand-500, #38bdf8)", margin: "0 0 4px 0", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
                  FORENSIC INTELLIGENCE ENGINE
                </p>
                <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary, #f3f4f6)" }}>
                  Evidence Integrity Report
                </h2>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary, #9ca3af)" }}>
                  Automated deterministic verification of cryptographic hash, custody origin, and vault storage continuity.
                </p>
              </div>

              <button
                type="button"
                className="button button-secondary"
                onClick={handleAssessIntegrity}
                disabled={integrityAssessing || isAuditor}
                title={isAuditor ? "Auditors have read-only inspection access" : "Run immediate cryptographic integrity assessment"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  borderRadius: "6px",
                }}
              >
                {integrityAssessing ? (
                  <>
                    <span className="loading-spinner" />
                    <span>Evaluating…</span>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">🛡️</span>
                    <span>Assess Integrity</span>
                  </>
                )}
              </button>
            </div>

            {integrityError && (
              <div style={{
                padding: "10px 14px",
                borderRadius: "6px",
                background: "rgba(244, 63, 94, 0.12)",
                border: "1px solid rgba(244, 63, 94, 0.3)",
                color: "var(--accent-danger, #f43f5e)",
                fontSize: "0.85rem",
              }} role="alert">
                {integrityError}
              </div>
            )}

            {/* Score & Status Display */}
            {integrityLoading && !integrityData ? (
              <div style={{ padding: "16px 0", color: "var(--text-secondary)" }}>
                Loading integrity telemetry…
              </div>
            ) : (
              <div>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "16px",
                  borderRadius: "6px",
                  background: "var(--surface-base, #0f1114)",
                  border: "1px solid var(--border-default, #23272f)",
                  flexWrap: "wrap",
                }}>
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "110px",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                  }}>
                    <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                      HEALTH SCORE
                    </span>
                    <strong style={{
                      fontSize: "2rem",
                      fontWeight: 800,
                      lineHeight: 1.1,
                      color: !integrityData?.assessment
                        ? "var(--text-secondary)"
                        : integrityData.assessment.overallScore >= 90
                        ? "var(--accent-verified, #10b981)"
                        : integrityData.assessment.overallScore >= 70
                        ? "var(--accent-pending, #fbbf24)"
                        : integrityData.assessment.overallScore >= 40
                        ? "#f97316"
                        : "var(--accent-danger, #f43f5e)",
                    }}>
                      {integrityData?.assessment ? `${integrityData.assessment.overallScore}` : "—"}
                      <span style={{ fontSize: "1rem", fontWeight: 500, color: "var(--text-secondary)" }}>/100</span>
                    </strong>
                  </div>

                  <div style={{ flex: 1, minWidth: "180px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 12px",
                        borderRadius: "20px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        fontFamily: "var(--font-mono)",
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        background: !integrityData?.assessment
                          ? "rgba(255, 255, 255, 0.05)"
                          : integrityData.assessment.overallStatus === "HEALTHY"
                          ? "rgba(16, 185, 129, 0.15)"
                          : integrityData.assessment.overallStatus === "NEEDS_REVIEW"
                          ? "rgba(251, 191, 36, 0.15)"
                          : integrityData.assessment.overallStatus === "AT_RISK"
                          ? "rgba(249, 115, 22, 0.15)"
                          : "rgba(244, 63, 94, 0.15)",
                        color: !integrityData?.assessment
                          ? "var(--text-secondary)"
                          : integrityData.assessment.overallStatus === "HEALTHY"
                          ? "var(--accent-verified, #10b981)"
                          : integrityData.assessment.overallStatus === "NEEDS_REVIEW"
                          ? "var(--accent-pending, #fbbf24)"
                          : integrityData.assessment.overallStatus === "AT_RISK"
                          ? "#f97316"
                          : "var(--accent-danger, #f43f5e)",
                        border: `1px solid ${
                          !integrityData?.assessment
                            ? "var(--border-default)"
                            : integrityData.assessment.overallStatus === "HEALTHY"
                            ? "rgba(16, 185, 129, 0.3)"
                            : integrityData.assessment.overallStatus === "NEEDS_REVIEW"
                            ? "rgba(251, 191, 36, 0.3)"
                            : integrityData.assessment.overallStatus === "AT_RISK"
                            ? "rgba(249, 115, 22, 0.3)"
                            : "rgba(244, 63, 94, 0.3)"
                        }`,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                        {integrityData?.assessment?.overallStatus ?? "NOT EVALUATED"}
                      </span>

                      {integrityData?.assessment?.assessedAt && (
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          Last scan: {fmtRelative(integrityData.assessment.assessedAt)} (v{integrityData.assessment.engineVersion})
                        </span>
                      )}
                    </div>

                    <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      {integrityData?.assessment?.overallStatus === "HEALTHY" && "Cryptographic fingerprint and custody timeline are fully synchronized."}
                      {integrityData?.assessment?.overallStatus === "NEEDS_REVIEW" && "Minor metadata or verification gaps detected. Exhibit requires review."}
                      {integrityData?.assessment?.overallStatus === "AT_RISK" && "Significant anomalies or custody transfer continuity concerns detected."}
                      {integrityData?.assessment?.overallStatus === "CRITICAL" && "CRITICAL ANOMALY: Possible hash mismatch or physical storage absence detected."}
                      {!integrityData?.assessment && "No formal forensic assessment recorded for this evidence artifact yet."}
                    </p>
                  </div>
                </div>

                {/* Findings Section */}
                {integrityData && integrityData.findings.length > 0 ? (
                  <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Active Findings ({integrityData.findings.length})
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {integrityData.findings.map((f) => (
                        <div
                          key={f.id}
                          style={{
                            padding: "12px 14px",
                            borderRadius: "6px",
                            background: f.status === "RESOLVED" ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.04)",
                            border: `1px solid ${
                              f.status === "RESOLVED"
                                ? "var(--border-default)"
                                : f.severity === "CRITICAL"
                                ? "rgba(244, 63, 94, 0.4)"
                                : f.severity === "HIGH"
                                ? "rgba(249, 115, 22, 0.4)"
                                : f.severity === "MEDIUM"
                                ? "rgba(251, 191, 36, 0.3)"
                                : "rgba(148, 163, 184, 0.3)"
                            }`,
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                fontFamily: "var(--font-mono)",
                                textTransform: "uppercase",
                                background: f.severity === "CRITICAL"
                                  ? "rgba(244, 63, 94, 0.15)"
                                  : f.severity === "HIGH"
                                  ? "rgba(249, 115, 22, 0.15)"
                                  : f.severity === "MEDIUM"
                                  ? "rgba(251, 191, 36, 0.15)"
                                  : "rgba(148, 163, 184, 0.15)",
                                color: f.severity === "CRITICAL"
                                  ? "var(--accent-danger, #f43f5e)"
                                  : f.severity === "HIGH"
                                  ? "#f97316"
                                  : f.severity === "MEDIUM"
                                  ? "var(--accent-pending, #fbbf24)"
                                  : "#94a3b8",
                                border: `1px solid currentColor`,
                              }}>
                                {f.severity}
                              </span>
                              <strong style={{ fontSize: "0.9rem", color: "var(--text-primary)" }}>
                                {f.title}
                              </strong>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                                [{f.code}]
                              </span>
                            </div>

                            <span style={{
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              padding: "2px 8px",
                              borderRadius: "12px",
                              fontFamily: "var(--font-mono)",
                              background: f.status === "RESOLVED"
                                ? "rgba(16, 185, 129, 0.15)"
                                : f.status === "ACKNOWLEDGED"
                                ? "rgba(56, 189, 248, 0.15)"
                                : "rgba(251, 191, 36, 0.15)",
                              color: f.status === "RESOLVED"
                                ? "var(--accent-verified, #10b981)"
                                : f.status === "ACKNOWLEDGED"
                                ? "var(--brand-400, #38bdf8)"
                                : "var(--accent-pending, #fbbf24)",
                            }}>
                              {f.status}
                            </span>
                          </div>

                          <p style={{ margin: 0, fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                            {f.description}
                          </p>

                          <div style={{
                            padding: "8px 10px",
                            borderRadius: "4px",
                            background: "rgba(0, 0, 0, 0.2)",
                            borderLeft: "3px solid var(--brand-500, #38bdf8)",
                            fontSize: "0.8rem",
                            color: "var(--text-secondary)",
                          }}>
                            <strong style={{ color: "var(--text-primary)" }}>Remediation Guidance: </strong>
                            {f.remediation}
                          </div>

                          {f.status === "RESOLVED" && f.resolutionNote && (
                            <div style={{ fontSize: "0.75rem", color: "var(--accent-verified)", fontStyle: "italic" }}>
                              Resolved note: {f.resolutionNote}
                            </div>
                          )}

                          {/* Action Controls for Finding */}
                          {!isAuditor && f.status !== "RESOLVED" && (
                            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", marginTop: 4 }}>
                              {f.status === "OPEN" && (
                                <button
                                  type="button"
                                  className="button button-secondary small-button"
                                  onClick={() => handleAcknowledgeFinding(f.id)}
                                  style={{ fontSize: "0.75rem", padding: "3px 10px" }}
                                >
                                  Acknowledge
                                </button>
                              )}

                              {f.code === "HASH_MISMATCH_DETECTED" && !isAdmin ? (
                                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                  Admin signoff required to resolve
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="button button-primary small-button"
                                  onClick={() => {
                                    setResolveModalFinding(f);
                                    setResolutionNote("");
                                    setResolveError("");
                                  }}
                                  style={{ fontSize: "0.75rem", padding: "3px 10px" }}
                                >
                                  Resolve Finding…
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : integrityData && integrityData.findings.length === 0 ? (
                  <div style={{
                    marginTop: 12,
                    padding: "12px 14px",
                    borderRadius: "6px",
                    background: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                    fontSize: "0.85rem",
                    color: "var(--accent-verified, #10b981)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    <span aria-hidden="true">✓</span>
                    <span>All forensic integrity checks verified. Zero custody or bit-level discrepancies detected.</span>
                  </div>
                ) : null}

                {/* Mandatory Disclaimer */}
                <div style={{
                  marginTop: 14,
                  padding: "8px 12px",
                  borderRadius: "4px",
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px dashed var(--border-default, #23272f)",
                  fontSize: "0.75rem",
                  color: "var(--text-secondary, #9ca3af)",
                  lineHeight: 1.4,
                }}>
                  <strong style={{ color: "var(--text-primary)" }}>Forensic Notice: </strong>
                  {integrityData?.disclaimer ?? "Operational integrity assessment based on EviChain records — does not constitute a legal admissibility determination."}
                </div>
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
                            <strong style={{ fontSize: 14, color: "var(--text-primary)" }}>{meta.label}</strong>
                            <small
                              style={{ color: "var(--text-secondary)", fontSize: 12 }}
                              title={new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeStyle: "medium" }).format(new Date(ev.timestamp))}
                            >
                              {fmtRelative(ev.timestamp)}
                            </small>
                          </div>

                          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                            Actor: <strong style={{ color: "var(--text-primary)" }}>{ev.actor?.name ?? "System"}</strong>{" "}
                            {ev.actor?.role && (
                              <span style={{ fontSize: 11, background: "var(--surface-sunken)", border: "1px solid var(--border-default)", padding: "1px 5px", borderRadius: 4, color: "var(--text-secondary)" }}>
                                {ev.actor.role}
                              </span>
                            )}
                          </div>

                          {ev.action === "TRANSFERRED" && (
                            <div style={{
                              margin: "6px 0",
                              padding: "6px 10px",
                              background: "var(--accent-pending-dim)",
                              border: "1px solid var(--accent-pending-border)",
                              borderRadius: 6,
                              fontSize: 12,
                              color: "var(--accent-pending)",
                            }}>
                              <span>From: <strong>{ev.fromUser?.name || "Previous Holder"}</strong></span>
                              <span style={{ margin: "0 6px" }}>→</span>
                              <span>To: <strong>{ev.toUser?.name || "New Custodian"}</strong></span>
                            </div>
                          )}

                          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-primary)" }}>{ev.note}</p>
                          {ev.toLocation && (
                            <small style={{ color: "var(--text-secondary)", display: "block", marginTop: 2 }}>
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
            backgroundColor: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: "blur(4px)",
          }}
          role="dialog"
          aria-labelledby="transfer-modal-title"
          aria-modal="true"
        >
          <div
            className="modal-content"
            style={{
              background: "var(--surface-overlay)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
              padding: 24,
              borderRadius: 12,
              maxWidth: 500,
              width: "92%",
              boxShadow: "var(--shadow-4)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 id="transfer-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
                Transfer Evidence Custody
              </h2>
              <button
                type="button"
                onClick={() => { setShowTransferModal(false); setTransferError(""); }}
                disabled={transferring}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-secondary)" }}
                aria-label="Close transfer dialog"
              >
                ×
              </button>
            </div>

            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
              Transfer formal legal custody of <strong style={{ color: "var(--text-primary)" }}>{record.name}</strong> to another verified investigator or custodian.
            </p>

            {/* Current Custodian Line */}
            <div style={{ fontSize: 13, background: "var(--surface-sunken)", border: "1px solid var(--border-default)", color: "var(--text-primary)", borderRadius: 6, padding: "8px 12px", marginBottom: 14 }}>
              Current Custodian: <strong style={{ color: "var(--accent-verified)" }}>{record.currentCustodian?.name ?? record.collectedBy?.name ?? "Unknown"}</strong> ({record.currentCustodian?.role ?? record.collectedBy?.role ?? "INVESTIGATOR"})
            </div>

            {/* Confirmation Summary if recipient is selected */}
            {(() => {
              const target = usersList.find((u) => u.id === transferToUserId);
              return target ? (
                <div style={{ background: "var(--accent-active-dim)", border: "1px solid var(--accent-active-border)", borderRadius: 6, padding: "8px 12px", marginBottom: 14, fontSize: 13, color: "var(--accent-active)" }}>
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

      {/* ── MODULE 15: Resolve Integrity Finding Modal ── */}
      {resolveModalFinding && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="resolve-modal-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--surface-raised, #181b20)",
              border: "1px solid var(--border-default, #23272f)",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "540px",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
            }}
          >
            <p className="eyebrow" style={{ color: "var(--brand-500, #38bdf8)", margin: "0 0 6px 0", fontSize: "0.75rem" }}>
              AUDIT TRAIL GOVERNANCE
            </p>
            <h2 id="resolve-modal-title" style={{ margin: "0 0 12px 0", fontSize: "1.25rem", color: "var(--text-primary)" }}>
              Resolve Integrity Finding
            </h2>

            <div style={{
              padding: "10px 12px",
              borderRadius: "6px",
              background: "var(--surface-base, #0f1114)",
              border: "1px solid var(--border-default, #23272f)",
              marginBottom: 16,
              fontSize: "0.85rem",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  padding: "1px 6px",
                  borderRadius: "4px",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  background: resolveModalFinding.severity === "CRITICAL" ? "rgba(244, 63, 94, 0.2)" : "rgba(251, 191, 36, 0.2)",
                  color: resolveModalFinding.severity === "CRITICAL" ? "var(--accent-danger, #f43f5e)" : "var(--accent-pending, #fbbf24)",
                }}>
                  {resolveModalFinding.severity}
                </span>
                <strong>{resolveModalFinding.title}</strong>
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                Code: <code>{resolveModalFinding.code}</code>
              </div>
            </div>

            {resolveError && (
              <div style={{
                padding: "8px 12px",
                borderRadius: "6px",
                background: "rgba(244, 63, 94, 0.12)",
                border: "1px solid rgba(244, 63, 94, 0.3)",
                color: "var(--accent-danger, #f43f5e)",
                fontSize: "0.85rem",
                marginBottom: 14,
              }} role="alert">
                {resolveError}
              </div>
            )}

            <form onSubmit={handleResolveFindingSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label className="label" htmlFor="resolution-note" style={{ display: "block", marginBottom: 6, fontSize: "0.85rem", fontWeight: 600 }}>
                  Forensic Resolution Note (Mandatory Audit Explanation) *
                </label>
                <textarea
                  id="resolution-note"
                  className="textarea"
                  value={resolutionNote}
                  disabled={resolveSubmitting}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Explain why this anomaly is cleared (e.g. Vault restore confirmed bit parity, physical signoff verified)..."
                  rows={4}
                  required
                  style={{ width: "100%", fontSize: "0.85rem" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => { setResolveModalFinding(null); setResolutionNote(""); setResolveError(""); }}
                  disabled={resolveSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={resolveSubmitting || !resolutionNote.trim()}
                >
                  {resolveSubmitting ? "Submitting Resolution…" : "Confirm Resolution"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}

