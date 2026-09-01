"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../auth-context";
import { exportAuditLogs, type ExportAuditParams } from "@/lib/api";

export default function AuditExportPage() {
  const { user, loading: authLoading, accessToken } = useAuth();

  const [format, setFormat] = useState<"json" | "csv">("json");
  const [resourceType, setResourceType] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [downloadedFile, setDownloadedFile] = useState("");

  useEffect(() => {
    if (!authLoading && !user) window.location.replace("/login");
  }, [authLoading, user]);

  // Role check — only ADMINISTRATOR and AUDITOR can export
  const canExport =
    user?.role === "Administrator" ||
    user?.role === "Auditor";

  async function handleExport(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setExporting(true);
    setError("");
    setDownloadedFile("");

    const params: ExportAuditParams = { format };
    if (resourceType.trim()) params.resourceType = resourceType.trim();
    if (resourceId.trim())   params.resourceId   = resourceId.trim();
    if (actorUserId.trim())  params.actorUserId  = actorUserId.trim();
    if (action.trim())       params.action       = action.trim();
    if (from)                params.from         = from;
    if (to)                  params.to           = `${to}T23:59:59`;

    try {
      const filename = await exportAuditLogs(accessToken, params);
      setDownloadedFile(filename);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (authLoading) {
    return <main className="audit-shell"><p className="audit-loading">Loading…</p></main>;
  }

  return (
    <main className="audit-shell">
      <header className="ev-topbar">
        <a className="ev-brand" href="/">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span><strong>EviChain</strong><small>Audit export</small></span>
        </a>
        <nav className="ev-nav">
          <a href="/audit">← Audit logs</a>
          <a href="/evidence">Evidence</a>
        </nav>
      </header>

      <div className="page-header">
        <div>
          <p className="eyebrow">AUDIT LEDGER</p>
          <h1>Export audit logs</h1>
          <p className="ev-page-sub">
            Download a filtered or complete export for compliance review or court submission.
          </p>
        </div>
        <a className="button button-secondary" href="/audit">← Back</a>
      </div>

      {!canExport && (
        <div className="readonly-banner" role="alert">
          Only Administrators and Auditors can export audit logs.
        </div>
      )}

      <div className="export-grid">
        {/* Export form */}
        <form
          className="export-form"
          onSubmit={handleExport}
          aria-label="Export audit logs form"
          noValidate
        >
          <div className="form-section">
            <h2>Export format</h2>
            <div className="export-format-row" role="radiogroup" aria-label="Select export format">
              <label className={`export-format-card ${format === "json" ? "export-format-card--active" : ""}`}>
                <input
                  type="radio"
                  name="format"
                  value="json"
                  checked={format === "json"}
                  onChange={() => setFormat("json")}
                  className="sr-only"
                />
                <span className="export-format-icon" aria-hidden="true">{ }</span>
                <strong>JSON</strong>
                <small>Machine-readable, includes all fields and nested detail JSON</small>
              </label>

              <label className={`export-format-card ${format === "csv" ? "export-format-card--active" : ""}`}>
                <input
                  type="radio"
                  name="format"
                  value="csv"
                  checked={format === "csv"}
                  onChange={() => setFormat("csv")}
                  className="sr-only"
                />
                <span className="export-format-icon" aria-hidden="true">⊟</span>
                <strong>CSV</strong>
                <small>Spreadsheet-compatible, one row per event, details as JSON string</small>
              </label>
            </div>
          </div>

          <div className="form-section">
            <h2>Filters <span className="ev-field-required">(all optional)</span></h2>
            <div className="upload-fields">
              <div className="form-group">
                <label htmlFor="ex-resourceType">Resource type</label>
                <select
                  id="ex-resourceType"
                  value={resourceType}
                  onChange={(e) => setResourceType(e.target.value)}
                >
                  <option value="">All resources</option>
                  <option value="evidence">Evidence</option>
                  <option value="case">Case</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="ex-action">Action (partial match)</label>
                <input
                  id="ex-action"
                  type="text"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  placeholder="e.g. evidence.upload"
                />
              </div>

              <div className="form-group">
                <label htmlFor="ex-actorUserId">Actor user ID</label>
                <input
                  id="ex-actorUserId"
                  type="text"
                  value={actorUserId}
                  onChange={(e) => setActorUserId(e.target.value)}
                  placeholder="UUID of specific user"
                />
              </div>

              <div className="form-group">
                <label htmlFor="ex-resourceId">Resource ID</label>
                <input
                  id="ex-resourceId"
                  type="text"
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                  placeholder="UUID of specific case or evidence"
                />
              </div>

              <div className="form-group">
                <label htmlFor="ex-from">Date from</label>
                <input
                  id="ex-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="ex-to">Date to</label>
                <input
                  id="ex-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="error-message" role="alert" aria-live="assertive">
              {error}
            </div>
          )}

          {downloadedFile && (
            <div className="ev-info-banner" role="status" aria-live="polite">
              Download started: <strong>{downloadedFile}</strong>
            </div>
          )}

          <div className="case-form-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={exporting || !canExport}
              aria-disabled={exporting || !canExport}
            >
              {exporting
                ? <span className="loading-spinner">Preparing export…</span>
                : `Download ${format.toUpperCase()}`}
            </button>
            <a className="button button-secondary" href="/audit">Cancel</a>
          </div>
        </form>

        {/* Info sidebar */}
        <aside className="info-section" aria-label="Export format details">
          <h2>Format details</h2>

          <div className="context-info">
            <p className="eyebrow">JSON FORMAT</p>
            <p>
              Includes a metadata wrapper with <code>exportedAt</code>,
              <code>exportedBy</code>, <code>totalRecords</code>, and a
              <code>logs</code> array. Each log entry contains the full
              <code>detailJson</code> payload and actor information.
              Best for programmatic processing or archiving.
            </p>
          </div>

          <div className="context-info" style={{ marginTop: 18 }}>
            <p className="eyebrow">CSV FORMAT</p>
            <p>
              One row per event with columns: <code>id</code>,
              <code>timestamp</code>, <code>action</code>,
              <code>resourceType</code>, <code>resourceId</code>,
              <code>actorUserId</code>, <code>actorName</code>,
              <code>actorRole</code>, <code>ipAddress</code>,
              <code>details</code>. The <code>details</code> column
              contains the JSON detail payload as a quoted string.
              Compatible with Excel and Google Sheets.
            </p>
          </div>

          <div className="context-info" style={{ marginTop: 18 }}>
            <p className="eyebrow">CHAIN OF CUSTODY NOTE</p>
            <p>
              Audit exports are themselves logged in the audit trail.
              For court submissions, export in both formats and include
              the export timestamp with your submission package.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
