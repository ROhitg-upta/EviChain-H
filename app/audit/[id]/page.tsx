"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../auth-context";
import { getAuditLogById, type AuditLog } from "@/lib/api";

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long",
    timeStyle: "medium",
  }).format(new Date(iso));
}

const ACTION_LABELS: Record<string, { label: string; desc: string }> = {
  "evidence.upload":    { label: "Evidence uploaded",       desc: "A new evidence file was registered and SHA-256 fingerprinted." },
  "evidence.view":      { label: "Evidence viewed",         desc: "An authenticated user accessed the evidence record." },
  "evidence.download":  { label: "Evidence downloaded",     desc: "A download was initiated; custody event logged." },
  "case.create":        { label: "Case created",            desc: "A new investigation case was opened." },
  "case.update":        { label: "Case updated",            desc: "Case metadata or status was modified." },
  "case.link_evidence": { label: "Evidence linked to case", desc: "An evidence record was associated with this case." },
};

export default function AuditDetailPage({ params }: { params: { id: string } }) {
  const { user, loading: authLoading, accessToken } = useAuth();

  const [log, setLog] = useState<AuditLog | null>(null);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) window.location.replace("/login");
  }, [authLoading, user]);

  useEffect(() => {
    if (!accessToken) return;
    setFetching(true);
    getAuditLogById(accessToken, params.id)
      .then(setLog)
      .catch((err: unknown) =>
        setFetchError(err instanceof Error ? err.message : "Failed to load audit log"),
      )
      .finally(() => setFetching(false));
  }, [accessToken, params.id]);

  if (authLoading || fetching) {
    return (
      <main className="audit-shell">
        <p className="audit-loading" role="status" aria-live="polite">Loading…</p>
      </main>
    );
  }

  if (fetchError || !log) {
    return (
      <main className="audit-shell">
        <header className="ev-topbar">
          <a className="ev-brand" href="/"><span className="brand-mark">E</span>
            <span><strong>EviChain</strong><small>Audit dashboard</small></span>
          </a>
        </header>
        <div className="error-message" style={{ marginTop: 40 }} role="alert">
          {fetchError || "Audit log not found."}
        </div>
        <a className="button button-secondary" style={{ marginTop: 16 }} href="/audit">
          ← Back to audit logs
        </a>
      </main>
    );
  }

  const meta = ACTION_LABELS[log.action];
  const detail = log.detailJson as Record<string, unknown> | null;

  return (
    <main className="audit-shell">
      <header className="ev-topbar">
        <a className="ev-brand" href="/">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span><strong>EviChain</strong><small>Audit dashboard</small></span>
        </a>
        <nav className="ev-nav" aria-label="Primary navigation">
          <a href="/audit">← Audit logs</a>
          <a href="/audit/export">Export</a>
          {user && <span className="operator" aria-label={user.name}>{user.initials}</span>}
        </nav>
      </header>

      <div className="page-header">
        <div>
          <p className="eyebrow">AUDIT EVENT · {log.id.slice(0, 8).toUpperCase()}</p>
          <h1>{meta?.label ?? log.action}</h1>
          {meta?.desc && (
            <p className="ev-page-sub">{meta.desc}</p>
          )}
        </div>
      </div>

      <div className="audit-detail-grid">
        {/* Left — event info */}
        <div className="audit-detail-left">

          {/* Core event card */}
          <div className="detail-card">
            <p className="eyebrow">EVENT DETAILS</p>
            <dl className="ev-meta-dl">
              <div>
                <dt>Action</dt>
                <dd><code>{log.action}</code></dd>
              </div>
              <div>
                <dt>Timestamp</dt>
                <dd>{fmtDate(log.timestamp)}</dd>
              </div>
              <div>
                <dt>Resource type</dt>
                <dd>{log.resourceType}</dd>
              </div>
              <div>
                <dt>Resource ID</dt>
                <dd><code>{log.resourceId}</code></dd>
              </div>
              {log.ipAddress && (
                <div>
                  <dt>IP address</dt>
                  <dd><code>{log.ipAddress}</code></dd>
                </div>
              )}
              {log.userAgent && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <dt>User agent</dt>
                  <dd style={{ fontSize: 10, wordBreak: "break-all" }}>
                    {log.userAgent}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Actor */}
          <div className="detail-card entity-card">
            <p className="eyebrow">ACTOR</p>
            {log.actor ? (
              <dl className="ev-meta-dl">
                <div>
                  <dt>Name</dt>
                  <dd>{log.actor.name}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>{log.actor.role}</dd>
                </div>
                <div>
                  <dt>User ID</dt>
                  <dd><code>{log.actorUserId}</code></dd>
                </div>
              </dl>
            ) : (
              <p className="ev-muted" style={{ fontSize: 12 }}>
                System-generated event — no user actor.
              </p>
            )}
          </div>

          {/* Detail JSON */}
          {detail && Object.keys(detail).length > 0 && (
            <div className="detail-card">
              <p className="eyebrow">EVENT PAYLOAD</p>
              <dl className="ev-meta-dl">
                {Object.entries(detail).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>
                      <code style={{ fontSize: 10, wordBreak: "break-all" }}>
                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </code>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>

        {/* Right — related entities + context */}
        <div className="audit-detail-right">

          {/* Related case */}
          {log.relatedCase && (
            <div className="detail-card entity-card">
              <p className="eyebrow">RELATED CASE</p>
              <dl className="ev-meta-dl">
                <div>
                  <dt>Title</dt>
                  <dd>{log.relatedCase.title}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{log.relatedCase.status}</dd>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <dt>Case ID</dt>
                  <dd><code>{log.relatedCase.id}</code></dd>
                </div>
              </dl>
              <a
                className="button button-secondary small-button"
                href={`/cases/${log.relatedCase.id}`}
                style={{ marginTop: 14 }}
              >
                Open case →
              </a>
            </div>
          )}

          {/* Related evidence */}
          {log.relatedEvidence && (
            <div className="detail-card entity-card">
              <p className="eyebrow">RELATED EVIDENCE</p>
              <dl className="ev-meta-dl">
                <div>
                  <dt>Name</dt>
                  <dd>{log.relatedEvidence.name}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{log.relatedEvidence.type}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{log.relatedEvidence.status}</dd>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <dt>SHA-256</dt>
                  <dd>
                    <code style={{ fontSize: 9, wordBreak: "break-all" }}>
                      {log.relatedEvidence.sha256}
                    </code>
                  </dd>
                </div>
              </dl>
              <a
                className="button button-secondary small-button"
                href={`/evidence/${log.relatedEvidence.id}`}
                style={{ marginTop: 14 }}
              >
                Open evidence →
              </a>
            </div>
          )}

          {/* Chain of custody context */}
          <div className="detail-card context-info">
            <p className="eyebrow">CHAIN OF CUSTODY</p>
            <h2 style={{ margin: "4px 0 12px", fontSize: 16, letterSpacing: "-0.03em" }}>
              About audit integrity
            </h2>
            <p>
              This record is part of EviChain&apos;s immutable audit ledger.
              Every action that creates, accesses, modifies, or deletes an
              evidence record is logged here automatically.
            </p>
            <p style={{ marginTop: 10 }}>
              The IP address and user-agent fields support forensic attribution.
              The payload field contains the exact data changed at the time of
              the event.
            </p>
            <p style={{ marginTop: 10 }}>
              For court submissions, export the full audit ledger via{" "}
              <a href="/audit/export" style={{ color: "var(--green)", fontWeight: 700 }}>
                Audit Export
              </a>{" "}
              and include the export timestamp.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
