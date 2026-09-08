"use client";

import React, { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "../../auth-context";
import { useNotifications } from "../../notification-context";
import {
  getCaseById, updateCase, getCaseComments, createCaseComment, downloadCaseSummaryPDF, uploadCaseEvidence,
  getCaseIntegrity, assessCaseIntegrity,
  type CaseDetail, type EvidenceRecord, type CaseComment, type CaseIntegrityData,
} from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";



import CaseCommentsSection from "@/app/components/ui/case-comments-section";
import CaseActivityFeed from "@/app/components/ui/case-activity-feed";

// ── Helpers ───────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long", timeStyle: "short",
  }).format(new Date(iso));
}

function fmtBytes(n: number) {
  if (n === 0) return "0 B";
  const k = 1024, s = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${(n / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
}

function mimeIcon(mime: string) {
  if (mime.startsWith("image/")) return "IMG";
  if (mime.startsWith("video/")) return "VID";
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("word") || mime.includes("document")) return "DOC";
  if (mime.includes("excel") || mime.includes("sheet")) return "XLS";
  if (mime.includes("zip") || mime.includes("tar")) return "ZIP";
  return "FILE";
}

const STATUS_OPTIONS = ["Active", "Review", "Closed", "Archived"];

// ── Component ─────────────────────────────────────────────────────

export default function CaseDetailPage() {
  const routeParams = useParams();
  const id = typeof routeParams?.id === "string" ? routeParams.id : Array.isArray(routeParams?.id) ? routeParams.id[0] : "";
  const { loading: authLoading, accessToken, canEdit } = useAuth();
  const { toast } = useNotifications();

  const [caseData, setCaseData] = useState<CaseDetail | null>(null);

  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Status update
  const [newStatus, setNewStatus] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "activity" | "discussion" | "integrity">("overview");
  const [exportingPdf, setExportingPdf] = useState(false);

  // Module 15: Case Forensic Readiness State
  const [integrityData, setIntegrityData] = useState<CaseIntegrityData | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [integrityAssessing, setIntegrityAssessing] = useState(false);
  const [integrityError, setIntegrityError] = useState("");

  const loadCase = useCallback(() => {
    if (!accessToken || !id) return;
    setFetching(true);
    setFetchError("");
    getCaseById(accessToken, id)
      .then((data) => {
        setCaseData(data);
        setNewStatus(data.status);
      })
      .catch((err: unknown) =>
        setFetchError(err instanceof Error ? err.message : "Failed to load case"),
      )
      .finally(() => setFetching(false));
  }, [accessToken, id]);

  const loadCaseIntegrity = useCallback(() => {
    if (!accessToken || !id) return;
    setIntegrityLoading(true);
    setIntegrityError("");
    getCaseIntegrity(id, accessToken)
      .then(setIntegrityData)
      .catch((err) => setIntegrityError(err instanceof Error ? err.message : "Failed to load case readiness"))
      .finally(() => setIntegrityLoading(false));
  }, [accessToken, id]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  useEffect(() => {
    if (caseData) {
      loadCaseIntegrity();
    }
  }, [caseData, loadCaseIntegrity]);

  async function handleAssessCaseIntegrity() {
    if (!accessToken || !id) return;
    setIntegrityAssessing(true);
    setIntegrityError("");
    try {
      const data = await assessCaseIntegrity(id, accessToken);
      setIntegrityData(data);
      toast({ type: "success", title: "Forensic Readiness Assessment Complete" });
    } catch (err: unknown) {
      setIntegrityError(err instanceof Error ? err.message : "Case assessment failed");
      toast({ type: "error", title: err instanceof Error ? err.message : "Case assessment failed" });
    } finally {
      setIntegrityAssessing(false);
    }
  }

  async function handleExportPdf() {
    if (!accessToken || !caseData) return;
    setExportingPdf(true);
    try {
      const blob = await downloadCaseSummaryPDF(accessToken, caseData.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Case-Summary-${caseData.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast({ type: "error", title: err instanceof Error ? err.message : "Failed to export PDF" });
    } finally {
      setExportingPdf(false);
    }
  }

  // In-page evidence upload modal

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadType, setUploadType] = useState("DOCUMENT");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccessHash, setUploadSuccessHash] = useState<string | null>(null);

  async function handleUploadEvidence(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !caseData || !uploadFile) return;

    setUploading(true);
    setUploadError("");
    setUploadSuccessHash(null);
    setUploadProgress(0);

    try {
      const res = await uploadCaseEvidence(
        accessToken,
        caseData.id,
        uploadFile,
        {
          name: uploadName.trim() || undefined,
          description: uploadDesc.trim() || undefined,
          evidenceType: uploadType,
        },
        (pct) => setUploadProgress(pct),
      );

      setUploadSuccessHash(res.sha256);
      toast({
        type: "success",
        title: "Evidence Uploaded",
        message: `Registered "${res.filename}" with verified SHA-256.`,
      });

      // Refresh case details immediately so evidence table updates
      const updated = await getCaseById(accessToken, id);
      setCaseData(updated);

      setTimeout(() => {
        setShowUploadModal(false);
        setUploadFile(null);
        setUploadName("");
        setUploadDesc("");
        setUploadSuccessHash(null);
        setUploadProgress(0);
      }, 1600);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Evidence upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleStatusUpdate(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !caseData || newStatus === caseData.status) return;
    setUpdating(true);
    setUpdateError("");
    setUpdateSuccess(false);
    try {
      const updated = await updateCase(accessToken, id, { status: newStatus });
      setCaseData((prev) => prev ? { ...prev, status: updated.status } : prev);
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (err: unknown) {
      setUpdateError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setUpdating(false);
    }
  }

  // ── Loading / error ────────────────────────────────────────────
  if (authLoading || fetching) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Cases", href: "/cases" }, { label: "Case Detail" }]}>
        <div style={{ display: "grid", gap: 12 }}>
          {[1,2,3].map(i => (
            <div key={i} className="skeleton" style={{ height: 100, borderRadius: "var(--radius-md)" }} />
          ))}
        </div>
      </WorkspaceShell>
    );
  }

  if (fetchError || !caseData) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Cases", href: "/cases" }, { label: "Case Detail" }]}>
        <div className="error-message" style={{ marginTop: 24 }} role="alert">
          {fetchError || "Case not found."}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={loadCase}>
            Retry
          </button>
          <a className="btn btn-secondary" href="/cases">
            ← Back to cases
          </a>
        </div>
      </WorkspaceShell>
    );
  }

  const evidence: EvidenceRecord[] = caseData.evidence ?? [];

  // ── Main render ────────────────────────────────────────────────
  return (
    <WorkspaceShell breadcrumbs={[{ label: "Cases", href: "/cases" }, { label: caseData.title }]}>

      {/* Page header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingBottom: "var(--space-5)",
        marginBottom: "var(--space-5)",
        borderBottom: "1px solid var(--border-default)",
        flexWrap: "wrap",
        gap: 16,
      }}>
        <div>
          <p className="eyebrow" style={{ color: "var(--brand-600)", marginBottom: 6 }}>
            CASE DOSSIER · {caseData.id.slice(0, 8).toUpperCase()}
          </p>
          <h1 style={{
            margin: 0,
            fontSize: "var(--text-xl)",
            fontWeight: 800,
            letterSpacing: "var(--tracking-tight)",
            color: "var(--text-primary)",
          }}>
            {caseData.title}
          </h1>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 10px",
              borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--accent-active)",
              background: "var(--accent-active-dim)",
              border: "1px solid var(--accent-active-border)",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
              {caseData.status}
            </span>
            {caseData.priority && (
              <span style={{
                padding: "3px 10px",
                borderRadius: "var(--radius-sm)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: caseData.priority === "Critical" ? "var(--accent-danger)" : "var(--accent-pending)",
                background: caseData.priority === "Critical" ? "var(--accent-danger-dim)" : "var(--accent-pending-dim)",
                border: `1px solid ${caseData.priority === "Critical" ? "var(--accent-danger-border)" : "var(--accent-pending-border)"}`,
              }}>
                {caseData.priority} Priority
              </span>
            )}
            <span style={{
              padding: "3px 10px",
              borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-secondary)",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--border-subtle)",
            }}>
              {evidence.length} evidence item{evidence.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-secondary btn-md"
            onClick={handleExportPdf}
            disabled={exportingPdf}
            title="Download court-admissible Case Intelligence Report PDF"
          >
            {exportingPdf ? "Generating PDF…" : "📄 Intelligence PDF"}
          </button>
          {canEdit && (
            <button
              type="button"
              className="btn btn-primary btn-md"
              onClick={() => setShowUploadModal(true)}
              aria-label="Upload evidence for this case"
            >
              + Add Evidence
            </button>
          )}
        </div>
      </div>

      {/* Forensic Tab Navigation */}
      <div
        style={{
          display: "flex",
          gap: 8,
          borderBottom: "1px solid var(--border-default)",
          marginBottom: 24,
          overflowX: "auto",
        }}
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "overview"}
          onClick={() => setActiveTab("overview")}
          style={{
            padding: "10px 16px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "overview" ? "2px solid var(--brand-500)" : "2px solid transparent",
            color: activeTab === "overview" ? "var(--text-primary)" : "var(--text-secondary)",
            fontWeight: activeTab === "overview" ? 700 : 500,
            fontSize: "var(--text-sm)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>Overview & Evidence</span>
          <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 10, background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}>
            {evidence.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "activity"}
          onClick={() => setActiveTab("activity")}
          style={{
            padding: "10px 16px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "activity" ? "2px solid var(--brand-500)" : "2px solid transparent",
            color: activeTab === "activity" ? "var(--text-primary)" : "var(--text-secondary)",
            fontWeight: activeTab === "activity" ? 700 : 500,
            fontSize: "var(--text-sm)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>Activity Timeline</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "discussion"}
          onClick={() => setActiveTab("discussion")}
          style={{
            padding: "10px 16px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "discussion" ? "2px solid var(--brand-500)" : "2px solid transparent",
            color: activeTab === "discussion" ? "var(--text-primary)" : "var(--text-secondary)",
            fontWeight: activeTab === "discussion" ? 700 : 500,
            fontSize: "var(--text-sm)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>Discussion & Notes</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "integrity"}
          onClick={() => setActiveTab("integrity")}
          style={{
            padding: "10px 16px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "integrity" ? "2px solid var(--brand-500)" : "2px solid transparent",
            color: activeTab === "integrity" ? "var(--text-primary)" : "var(--text-secondary)",
            fontWeight: activeTab === "integrity" ? 700 : 500,
            fontSize: "var(--text-sm)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>Forensic Readiness</span>
          {integrityData?.assessment && (
            <span style={{
              fontSize: 11,
              padding: "1px 8px",
              borderRadius: 10,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              background: integrityData.assessment.overallScore >= 90
                ? "rgba(16, 185, 129, 0.2)"
                : integrityData.assessment.overallScore >= 70
                ? "rgba(251, 191, 36, 0.2)"
                : "rgba(244, 63, 94, 0.2)",
              color: integrityData.assessment.overallScore >= 90
                ? "var(--accent-verified, #10b981)"
                : integrityData.assessment.overallScore >= 70
                ? "var(--accent-pending, #fbbf24)"
                : "var(--accent-danger, #f43f5e)",
            }}>
              {integrityData.assessment.overallScore}/100
            </span>
          )}
        </button>
      </div>

      {/* Tab: Overview & Evidence Grid */}
      {activeTab === "overview" && (
      <div className="case-grid-layout" style={{ marginBottom: 32 }}>
        {/* Left Column: Metadata & Controls */}
        <div style={{ display: "grid", gap: 18 }}>
          {/* Metadata Card */}
          <div className="case-meta-box">
            <span className="eyebrow" style={{ display: "block", marginBottom: 12 }}>CASE METADATA</span>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <span className="eyebrow" style={{ fontSize: 9 }}>CASE RECORD ID</span>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--neutral-400)", wordBreak: "break-all", marginTop: 2 }}>
                  {caseData.id}
                </div>
              </div>
              <div>
                <span className="eyebrow" style={{ fontSize: 9 }}>LEAD INVESTIGATOR</span>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
                  {caseData.lead?.name || "Unassigned"}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <span className="eyebrow" style={{ fontSize: 9 }}>CREATED</span>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {fmtDate(caseData.createdAt)}
                  </div>
                </div>
                <div>
                  <span className="eyebrow" style={{ fontSize: 9 }}>LAST ACTIVITY</span>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {fmtDate(caseData.updatedAt)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Description Card */}
          {caseData.description && (
            <div className="case-meta-box">
              <span className="eyebrow" style={{ display: "block", marginBottom: 8 }}>INVESTIGATION SUMMARY</span>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {caseData.description}
              </p>
            </div>
          )}

          {/* Status Control Card */}
          <div className="case-meta-box">
            <span className="eyebrow" style={{ display: "block", marginBottom: 8 }}>STATUS CONTROL</span>
            <form onSubmit={handleStatusUpdate} style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <select
                className="input select"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                disabled={!canEdit}
                aria-label="Select new status"
                style={{ flex: 1 }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                type="submit"
                className="btn btn-primary btn-md"
                disabled={updating || !canEdit || newStatus === caseData.status}
              >
                {updating ? "Saving…" : "Update"}
              </button>
            </form>

            {updateError && (
              <div role="alert" style={{ marginTop: 10, padding: "8px 12px", background: "var(--accent-danger-dim)", border: "1px solid var(--accent-danger-border)", borderRadius: "var(--radius-sm)", color: "var(--accent-danger)", fontSize: 12 }}>
                {updateError}
              </div>
            )}
            {updateSuccess && (
              <div role="status" style={{ marginTop: 10, padding: "8px 12px", background: "var(--accent-verified-dim)", border: "1px solid var(--accent-verified-border)", borderRadius: "var(--radius-sm)", color: "var(--accent-verified)", fontSize: 12 }}>
                ✓ Status updated to <strong>{newStatus}</strong>.
              </div>
            )}
            {!canEdit && (
              <small style={{ display: "block", marginTop: 8, color: "var(--text-disabled)", fontSize: 11 }}>
                Auditor read-only mode active.
              </small>
            )}
          </div>
        </div>

        {/* Right Column: Linked Evidence Vault */}
        <div style={{ display: "grid", gap: 18 }}>
          <div className="case-meta-box">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <span className="eyebrow">LINKED EVIDENCE</span>
                <h2 style={{ margin: "4px 0 0", fontSize: "var(--text-md)", fontWeight: 700, color: "var(--text-primary)" }}>
                  Evidence Register ({evidence.length})
                </h2>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowUploadModal(true)}
                >
                  + Upload Evidence
                </button>
              )}
            </div>

            {evidence.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 24px", border: "1px dashed var(--border-default)", borderRadius: "var(--radius-md)", background: "var(--surface-sunken)" }}>
                <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>📁</div>
                <strong style={{ display: "block", color: "var(--text-primary)", fontSize: "var(--text-sm)", marginBottom: 4 }}>
                  No evidence registered to this case yet
                </strong>
                <p style={{ margin: "0 auto 16px", maxWidth: 360, fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
                  Upload evidence files to generate server-verified cryptographic SHA-256 fingerprints and establish immutable chain of custody.
                </p>
                {canEdit && (
                  <button
                    type="button"
                    className="btn btn-primary btn-md"
                    onClick={() => setShowUploadModal(true)}
                  >
                    + Upload First Evidence Item
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }} role="list">
                {evidence.map((ev) => (
                  <div
                    key={ev.id}
                    role="listitem"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                      padding: "12px 16px",
                      background: "var(--surface-sunken)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-md)",
                      transition: "border-color 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-subtle)", display: "grid", placeItems: "center", fontSize: 16, flexShrink: 0 }}>
                        {mimeIcon(ev.mimeType)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--text-primary)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                          {ev.name}
                        </strong>
                        <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--text-disabled)", marginTop: 2, flexWrap: "wrap" }}>
                          <span>{fmtBytes(ev.sizeBytes)}</span>
                          <span>·</span>
                          <span>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(ev.createdAt))}</span>
                          <span>·</span>
                          <span style={{ fontFamily: "var(--font-mono)" }}>SHA: {ev.sha256.slice(0, 10)}…</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "var(--radius-sm)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 600,
                        color: "var(--accent-verified)",
                        background: "var(--accent-verified-dim)",
                        border: "1px solid var(--accent-verified-border)",
                      }}>
                        {ev.status}
                      </span>
                      <a
                        className="btn btn-secondary btn-sm"
                        href={`/evidence/${ev.id}`}
                      >
                        Inspect →
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Tab: Activity Timeline */}
      {activeTab === "activity" && (
        <CaseActivityFeed caseId={id} />
      )}

      {/* Tab: Discussion & Notes */}
      {activeTab === "discussion" && (
        <CaseCommentsSection caseId={id} />
      )}

      {/* ── MODULE 15: Case Forensic Readiness Command Center ── */}
      {activeTab === "integrity" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, marginBottom: 32 }}>
          {/* Header & Controls */}
          <div style={{
            background: "var(--surface-raised, #181b20)",
            border: "1px solid var(--border-default, #23272f)",
            borderRadius: "8px",
            padding: "24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 16,
          }}>
            <div>
              <p className="eyebrow" style={{ color: "var(--brand-500, #38bdf8)", margin: "0 0 6px 0", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
                CASE FORENSIC READINESS COMMAND CENTER
              </p>
              <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary, #f3f4f6)" }}>
                Court Admissibility & Evidence Integrity
              </h2>
              <p style={{ margin: "6px 0 0 0", fontSize: "0.9rem", color: "var(--text-secondary, #9ca3af)", maxWidth: 650 }}>
                Aggregated cryptographic readiness assessment across all child evidence artifacts, chain of custody continuity, and vault storage state.
              </p>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-md"
              onClick={handleAssessCaseIntegrity}
              disabled={integrityAssessing}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {integrityAssessing ? (
                <>
                  <span className="loading-spinner" />
                  <span>Scanning Case Artifacts…</span>
                </>
              ) : (
                <>
                  <span aria-hidden="true">🛡️</span>
                  <span>Assess Forensic Readiness</span>
                </>
              )}
            </button>
          </div>

          {integrityError && (
            <div style={{
              padding: "12px 16px",
              borderRadius: "6px",
              background: "rgba(244, 63, 94, 0.12)",
              border: "1px solid rgba(244, 63, 94, 0.3)",
              color: "var(--accent-danger, #f43f5e)",
              fontSize: "0.9rem",
            }} role="alert">
              {integrityError}
            </div>
          )}

          {/* Critical Non-Negotiable Override Rule Banner */}
          {integrityData && (integrityData.distribution?.critical ?? 0) > 0 && (
            <div style={{
              padding: "16px 20px",
              borderRadius: "8px",
              background: "rgba(244, 63, 94, 0.1)",
              border: "1px solid rgba(244, 63, 94, 0.4)",
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
            }} role="alert">
              <span style={{ fontSize: "1.5rem" }} aria-hidden="true">⚠️</span>
              <div>
                <strong style={{ color: "var(--accent-danger, #f43f5e)", fontSize: "0.95rem", display: "block", marginBottom: 4 }}>
                  CRITICAL ANOMALY OVERRIDE ENFORCED
                </strong>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                  {integrityData.distribution?.critical ?? 0} exhibit(s) in this case triggered a <strong>CRITICAL</strong> finding (cryptographic hash mismatch or vault storage unavailability). By forensic integrity governance rules, this case is capped at <strong>{integrityData.assessment?.overallStatus ?? "AT_RISK"}</strong> status and cannot be declared court-ready until all critical findings are formally remediated and resolved by an Administrator.
                </p>
              </div>
            </div>
          )}

          {/* Readiness Score & Metrics Cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
          }}>
            {/* Overall Score */}
            <div style={{
              background: "var(--surface-raised, #181b20)",
              border: "1px solid var(--border-default, #23272f)",
              borderRadius: "8px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}>
              <span className="eyebrow" style={{ color: "var(--text-secondary)" }}>READINESS SCORE</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <strong style={{
                  fontSize: "2.75rem",
                  fontWeight: 800,
                  lineHeight: 1,
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
                  {integrityData?.assessment ? integrityData.assessment.overallScore : "—"}
                </strong>
                <span style={{ fontSize: "1.1rem", color: "var(--text-secondary)" }}>/100</span>
              </div>
              <span style={{
                alignSelf: "flex-start",
                padding: "2px 10px",
                borderRadius: "12px",
                fontSize: "0.75rem",
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
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
              }}>
                {integrityData?.assessment?.overallStatus ?? "UNASSESSED"}
              </span>
            </div>

            {/* Critical Exhibits */}
            <div style={{
              background: "var(--surface-raised, #181b20)",
              border: "1px solid var(--border-default, #23272f)",
              borderRadius: "8px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}>
              <span className="eyebrow" style={{ color: "var(--accent-danger, #f43f5e)" }}>CRITICAL ANOMALIES</span>
              <strong style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1, color: "var(--accent-danger, #f43f5e)" }}>
                {integrityData?.distribution?.critical ?? 0}
              </strong>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Evidence exhibits requiring immediate escalation
              </span>
            </div>

            {/* At Risk & Needs Review */}
            <div style={{
              background: "var(--surface-raised, #181b20)",
              border: "1px solid var(--border-default, #23272f)",
              borderRadius: "8px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}>
              <span className="eyebrow" style={{ color: "var(--accent-pending, #fbbf24)" }}>AT RISK / REVIEW</span>
              <strong style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1, color: "var(--accent-pending, #fbbf24)" }}>
                {(integrityData?.distribution?.atRisk ?? 0) + (integrityData?.distribution?.needsReview ?? 0)}
              </strong>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {integrityData?.distribution?.atRisk ?? 0} at risk · {integrityData?.distribution?.needsReview ?? 0} needs review
              </span>
            </div>

            {/* Verified Healthy */}
            <div style={{
              background: "var(--surface-raised, #181b20)",
              border: "1px solid var(--border-default, #23272f)",
              borderRadius: "8px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}>
              <span className="eyebrow" style={{ color: "var(--accent-verified, #10b981)" }}>VERIFIED HEALTHY</span>
              <strong style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1, color: "var(--accent-verified, #10b981)" }}>
                {integrityData?.distribution?.healthy ?? 0}
              </strong>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Exhibit integrity fully verified
              </span>
            </div>
          </div>

          {/* Child Evidence Breakdown Table */}
          <div style={{
            background: "var(--surface-raised, #181b20)",
            border: "1px solid var(--border-default, #23272f)",
            borderRadius: "8px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Evidence Exhibits Integrity Telemetry
                </h3>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  Cryptographic verification status for each exhibit tied to this case dossier.
                </p>
              </div>
            </div>

            {(!integrityData || integrityData.evidenceBreakdown.length === 0) ? (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>
                {evidence.length === 0 ? "No evidence exhibits registered to this case yet." : "Click 'Assess Forensic Readiness' to scan all exhibits."}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-default, #23272f)", textAlign: "left" }}>
                      <th style={{ padding: "10px 12px", color: "var(--text-secondary)", fontWeight: 600 }}>EXHIBIT</th>
                      <th style={{ padding: "10px 12px", color: "var(--text-secondary)", fontWeight: 600 }}>SHA-256 FINGERPRINT</th>
                      <th style={{ padding: "10px 12px", color: "var(--text-secondary)", fontWeight: 600 }}>RECORD STATUS</th>
                      <th style={{ padding: "10px 12px", color: "var(--text-secondary)", fontWeight: 600 }}>HEALTH SCORE</th>
                      <th style={{ padding: "10px 12px", color: "var(--text-secondary)", fontWeight: 600 }}>INTEGRITY STATUS</th>
                      <th style={{ padding: "10px 12px", color: "var(--text-secondary)", fontWeight: 600, textAlign: "right" }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {integrityData.evidenceBreakdown.map((ev) => (
                      <tr key={ev.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                        <td style={{ padding: "12px", color: "var(--text-primary)", fontWeight: 600 }}>
                          {ev.name}
                        </td>
                        <td style={{ padding: "12px", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-secondary)" }} title={ev.sha256}>
                          {ev.sha256 ? `${ev.sha256.slice(0, 12)}…${ev.sha256.slice(-8)}` : "—"}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span style={{
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            fontFamily: "var(--font-mono)",
                            background: "rgba(255, 255, 255, 0.05)",
                            color: "var(--text-primary)",
                          }}>
                            {ev.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px", fontWeight: 700 }}>
                          {ev.score !== null ? (
                            <span style={{
                              color: ev.score >= 90 ? "var(--accent-verified, #10b981)" : ev.score >= 70 ? "var(--accent-pending, #fbbf24)" : "var(--accent-danger, #f43f5e)",
                            }}>
                              {ev.score}/100
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-secondary)" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "2px 8px",
                            borderRadius: "10px",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            fontFamily: "var(--font-mono)",
                            background: ev.assessmentStatus === "HEALTHY"
                              ? "rgba(16, 185, 129, 0.15)"
                              : ev.assessmentStatus === "NEEDS_REVIEW"
                              ? "rgba(251, 191, 36, 0.15)"
                              : ev.assessmentStatus === "AT_RISK"
                              ? "rgba(249, 115, 22, 0.15)"
                              : ev.assessmentStatus === "CRITICAL"
                              ? "rgba(244, 63, 94, 0.15)"
                              : "rgba(255, 255, 255, 0.05)",
                            color: ev.assessmentStatus === "HEALTHY"
                              ? "var(--accent-verified, #10b981)"
                              : ev.assessmentStatus === "NEEDS_REVIEW"
                              ? "var(--accent-pending, #fbbf24)"
                              : ev.assessmentStatus === "AT_RISK"
                              ? "#f97316"
                              : ev.assessmentStatus === "CRITICAL"
                              ? "var(--accent-danger, #f43f5e)"
                              : "var(--text-secondary)",
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                            {ev.assessmentStatus}
                          </span>
                        </td>
                        <td style={{ padding: "12px", textAlign: "right" }}>
                          <a
                            href={`/evidence/${ev.id}`}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: "0.75rem", padding: "3px 10px" }}
                          >
                            Inspect Exhibit →
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Case Findings List */}
          {integrityData && integrityData.findings.length > 0 && (
            <div style={{
              background: "var(--surface-raised, #181b20)",
              border: "1px solid var(--border-default, #23272f)",
              borderRadius: "8px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Case-Level Integrity Findings ({integrityData.findings.length})
              </h3>
              {integrityData.findings.map((f) => (
                <div
                  key={f.id}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "6px",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border-default, #23272f)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      background: "rgba(251, 191, 36, 0.15)",
                      color: "var(--accent-pending, #fbbf24)",
                    }}>
                      {f.severity}
                    </span>
                    <strong style={{ color: "var(--text-primary)" }}>{f.title}</strong>
                    <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                      [{f.code}]
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>{f.description}</p>
                  <div style={{ fontSize: "0.8rem", color: "var(--brand-400)" }}>
                    <strong>Remediation: </strong>{f.remediation}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Forensic Notice */}
          <div style={{
            padding: "10px 14px",
            borderRadius: "6px",
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px dashed var(--border-default, #23272f)",
            fontSize: "0.75rem",
            color: "var(--text-secondary, #9ca3af)",
            lineHeight: 1.4,
          }}>
            <strong style={{ color: "var(--text-primary)" }}>Forensic Notice: </strong>
            {integrityData?.disclaimer ?? "Operational forensic readiness assessment based on EviChain records — does not constitute a legal admissibility determination."}
          </div>
        </div>
      )}

      {/* ── Direct Evidence Upload Modal (Dark Themed) ──────────────── */}
      {showUploadModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: "blur(4px)",
            padding: 16,
          }}
          role="dialog"
          aria-labelledby="upload-modal-title"
          aria-modal="true"
        >
          <div
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border-strong)",
              padding: 28,
              borderRadius: "var(--radius-lg)",
              maxWidth: 540,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "var(--shadow-surface)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <span className="eyebrow" style={{ color: "var(--brand-600)" }}>FORENSIC ACQUISITION</span>
                <h3 id="upload-modal-title" style={{ margin: "2px 0 0", fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--text-primary)" }}>
                  Upload Case Evidence
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !uploading && setShowUploadModal(false)}
                disabled={uploading}
                style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "var(--text-secondary)" }}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>

            <p style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", margin: "0 0 20px" }}>
              Target Case: <strong style={{ color: "var(--text-primary)" }}>{caseData.title}</strong>
            </p>

            {uploadError && (
              <div role="alert" style={{ marginBottom: 16, padding: "10px 14px", background: "var(--accent-danger-dim)", border: "1px solid var(--accent-danger-border)", borderRadius: "var(--radius-md)", color: "var(--accent-danger)", fontSize: "var(--text-sm)" }}>
                {uploadError}
              </div>
            )}

            {uploadSuccessHash && (
              <div
                style={{
                  background: "var(--accent-verified-dim)",
                  border: "1px solid var(--accent-verified-border)",
                  borderRadius: "var(--radius-md)",
                  padding: 14,
                  marginBottom: 16,
                  color: "var(--accent-verified)",
                }}
                role="status"
              >
                <strong style={{ display: "block", fontSize: "var(--text-sm)" }}>✓ Evidence registered & SHA-256 confirmed!</strong>
                <p style={{ margin: "6px 0 0", fontFamily: "var(--font-mono)", fontSize: 11, wordBreak: "break-all", color: "var(--neutral-400)" }}>
                  SHA-256: {uploadSuccessHash}
                </p>
              </div>
            )}

            <form onSubmit={handleUploadEvidence}>
              <div style={{ marginBottom: 16 }}>
                <label className="eyebrow" htmlFor="case-upload-file" style={{ display: "block", marginBottom: 6 }}>
                  EVIDENCE FILE (MAX 50MB) *
                </label>
                <input
                  id="case-upload-file"
                  type="file"
                  required
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setUploadFile(f);
                      if (!uploadName) setUploadName(f.name);
                    }
                  }}
                  className="input"
                  style={{ padding: "8px 12px" }}
                />
                {uploadFile && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-secondary)" }}>
                    Selected: <strong style={{ color: "var(--text-primary)" }}>{uploadFile.name}</strong> ({fmtBytes(uploadFile.size)})
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="eyebrow" htmlFor="case-upload-name" style={{ display: "block", marginBottom: 6 }}>
                  EVIDENCE LABEL / NAME (OPTIONAL)
                </label>
                <input
                  id="case-upload-name"
                  type="text"
                  className="input"
                  placeholder="e.g. Memory Dump / CCTV Capture"
                  value={uploadName}
                  disabled={uploading}
                  onChange={(e) => setUploadName(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="eyebrow" htmlFor="case-upload-type" style={{ display: "block", marginBottom: 6 }}>
                  EVIDENCE CATEGORY
                </label>
                <select
                  id="case-upload-type"
                  className="input select"
                  value={uploadType}
                  disabled={uploading}
                  onChange={(e) => setUploadType(e.target.value)}
                >
                  <option value="DOCUMENT">Document / PDF</option>
                  <option value="IMAGE">Image / Photograph</option>
                  <option value="VIDEO">Video / CCTV</option>
                  <option value="AUDIO">Audio Recording</option>
                  <option value="DISK_IMAGE">Forensic Disk / Memory Dump</option>
                  <option value="ARCHIVE">Zip / Archive</option>
                  <option value="LOG">System / Network Log</option>
                </select>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label className="eyebrow" htmlFor="case-upload-desc" style={{ display: "block", marginBottom: 6 }}>
                  ACQUISITION NOTES
                </label>
                <textarea
                  id="case-upload-desc"
                  className="input textarea"
                  rows={3}
                  placeholder="Acquisition context, hardware source, or chain of custody initial notes..."
                  value={uploadDesc}
                  disabled={uploading}
                  onChange={(e) => setUploadDesc(e.target.value)}
                />
              </div>

              {uploading && uploadProgress > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>
                    <span>Processing binary stream…</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div style={{ height: 6, background: "var(--surface-sunken)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${uploadProgress}%`, height: "100%", background: "var(--brand-500)", transition: "width 0.2s" }} />
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-md"
                  disabled={uploading}
                  onClick={() => setShowUploadModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-md"
                  disabled={uploading || !uploadFile}
                >
                  {uploading ? "Hashing & Registering…" : "Upload & Compute SHA-256"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}
