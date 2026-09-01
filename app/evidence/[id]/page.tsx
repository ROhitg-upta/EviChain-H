"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../auth-context";
import {
  getEvidenceById, downloadEvidence, verifyByHash,
  type EvidenceRecord, type CustodyEvent, type PublicVerifyResult,
} from "@/lib/api";

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

// Map custody event action → display label, colour class, and aria description
const EVENT_META: Record<string, { label: string; cls: string; desc: string }> = {
  CREATED:     { label: "Registered",   cls: "ev-event--created",     desc: "Evidence was registered in the system" },
  ACCESSED:    { label: "Accessed",     cls: "ev-event--accessed",    desc: "Evidence record was viewed" },
  TRANSFERRED: { label: "Transferred",  cls: "ev-event--transferred", desc: "Custody transferred to another party" },
  DOWNLOADED:  { label: "Downloaded",   cls: "ev-event--downloaded",  desc: "Evidence was downloaded" },
  DELETED:     { label: "Deleted",      cls: "ev-event--deleted",     desc: "Evidence was deleted" },
};

function eventMeta(action: string) {
  return EVENT_META[action.toUpperCase()] ?? { label: action, cls: "", desc: action };
}

// ── Component ─────────────────────────────────────────────────────

export default function EvidenceDetailPage({
  params,
}: {
  params: { id: string };
}) {
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

  useEffect(() => {
    if (!authLoading && !user) window.location.replace("/login");
  }, [authLoading, user]);

  useEffect(() => {
    if (!accessToken) return;
    setFetching(true);
    getEvidenceById(accessToken, params.id)
      .then(setRecord)
      .catch((err: unknown) =>
        setFetchError(err instanceof Error ? err.message : "Failed to load record"),
      )
      .finally(() => setFetching(false));
  }, [accessToken, params.id]);

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
      setServerVerify({ sha256: record.sha256, matched: false, evidence: null });
    } finally {
      setServerVerifying(false);
    }
  }

  async function handleDownload() {
    if (!accessToken || !record) return;
    setDownloadState("loading");
    setDownloadError("");
    try {
      await downloadEvidence(accessToken, record.id);
      setDownloadState("done");
    } catch (err: unknown) {
      setDownloadState("error");
      setDownloadError(err instanceof Error ? err.message : "Download failed");
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
      <main className="evidence-shell">
        <p className="ev-loading" role="status" aria-live="polite">Loading…</p>
      </main>
    );
  }

  if (fetchError || !record) {
    return (
      <main className="evidence-shell">
        <header className="ev-topbar">
          <a className="ev-brand" href="/"><span className="brand-mark">E</span>
            <span><strong>EviChain</strong><small>Evidence workspace</small></span>
          </a>
        </header>
        <div className="error-message" style={{ marginTop: 40 }} role="alert">
          {fetchError || "Evidence record not found."}
        </div>
        <a className="button button-secondary" style={{ marginTop: 16 }} href="/evidence">
          ← Back to registry
        </a>
      </main>
    );
  }

  const statusCls = record.status.toLowerCase();
  const events: CustodyEvent[] = record.custodyEvents ?? [];

  // ── Main render ───────────────────────────────────────────────────
  return (
    <main className="evidence-shell">
      <header className="ev-topbar">
        <a className="ev-brand" href="/">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span><strong>EviChain</strong><small>Evidence workspace</small></span>
        </a>
        <nav className="ev-nav" aria-label="Primary navigation">
          <a href="/evidence">← Registry</a>
          <a href="/case">Cases</a>
          {user && <span className="operator" aria-label={user.name}>{user.initials}</span>}
        </nav>
      </header>

      {/* Page title */}
      <div className="page-header">
        <div>
          <p className="eyebrow">EVIDENCE RECORD</p>
          <h1>{record.name}</h1>
          <div className="ev-detail-chips">
            <span className={`status ${statusCls}`} aria-label={`Status: ${record.status}`}>
              <span aria-hidden="true" />
              {record.status.charAt(0) + record.status.slice(1).toLowerCase()}
            </span>
            <span className="ev-chip">{record.type}</span>
            <span className="ev-chip">{record.ownerOrg}</span>
            {record.case && (
              <a className="ev-chip ev-chip--link" href="/case">
                {record.case.title}
              </a>
            )}
          </div>
        </div>
        <div className="ev-header-actions">
          <button
            className="button button-secondary small-button"
            onClick={handleDownload}
            disabled={downloadState === "loading"}
            aria-label="Download this evidence and log custody event"
          >
            {downloadState === "loading"
              ? <span className="loading-spinner">Logging…</span>
              : downloadState === "done"
              ? "Downloaded ✓"
              : "Download"}
          </button>
        </div>
      </div>

      {downloadError && (
        <div className="error-message" role="alert">{downloadError}</div>
      )}
      {downloadState === "done" && (
        <div className="ev-info-banner" role="status">
          Download logged in chain of custody. File storage is not yet configured — contact your administrator for the file.
        </div>
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
            <div className="timeline-header-row">
              <h2>Custody timeline</h2>
              <span aria-label={`${events.length} custody events`}>{events.length} events</span>
            </div>

            {events.length === 0 ? (
              <p className="ev-muted" style={{ padding: "16px 0" }}>No custody events recorded.</p>
            ) : (
              <ol className="timeline" aria-label="Custody event timeline">
                {events.map((ev) => {
                  const meta = eventMeta(ev.action);
                  return (
                    <li className={`timeline-event ${meta.cls}`} key={ev.id}>
                      <span
                        className={`timeline-dot timeline-dot--${meta.cls.replace("ev-event--", "")}`}
                        aria-hidden="true"
                      />
                      <div className="timeline-content">
                        <strong>{meta.label}</strong>
                        <small>
                          {ev.actor?.name ?? "System"} ·{" "}
                          {new Intl.DateTimeFormat("en-IN", {
                            dateStyle: "medium", timeStyle: "short",
                          }).format(new Date(ev.timestamp))}
                        </small>
                        <p>{ev.note}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
