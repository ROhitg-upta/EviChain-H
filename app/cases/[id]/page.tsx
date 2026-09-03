"use client";

import React, { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "../../auth-context";
import { useNotifications } from "../../notification-context";
import {
  getCaseById, updateCase, getCaseComments, createCaseComment, downloadCaseSummaryPDF, uploadCaseEvidence,
  type CaseDetail, type EvidenceRecord, type CaseComment,
} from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";



// ── Comment sub-components ────────────────────────────────────────

function CommentItem({
  comment,
  onReply,
}: {
  comment: CaseComment;
  onReply: (parentId: string, content: string) => Promise<void>;
}) {
  const { user } = useAuth();
  const [replying, setReplying] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [sending, setSending] = useState(false);

  async function handleReplySubmit(e: FormEvent) {
    e.preventDefault();
    if (!replyContent.trim()) return;
    setSending(true);
    await onReply(comment.id, replyContent);
    setReplyContent("");
    setReplying(false);
    setSending(false);
  }

  return (
    <div className="comment-item">
      <div className="comment-avatar" aria-hidden="true">
        {comment.user.name.charAt(0).toUpperCase()}
      </div>
      <div className="comment-body">
        <div className="comment-header">
          <span className="comment-author">{comment.user.name}</span>
          <time className="comment-time" dateTime={comment.createdAt}>
            {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" })
              .format(new Date(comment.createdAt))}
          </time>
        </div>
        <div className="comment-content">
          {comment.content.split(/(@[\w\s.-]+)/g).map((part, i) =>
            part.startsWith("@") ? (
              <span key={i} className="comment-mention">{part}</span>
            ) : (
              <span key={i}>{part}</span>
            ),
          )}
        </div>

        {comment.replies.length > 0 && (
          <div className="comment-replies">
            {comment.replies.map((reply) => (
              <CommentItem key={reply.id} comment={reply} onReply={onReply} />
            ))}
          </div>
        )}

        {user && !replying && (
          <button className="comment-reply-btn" onClick={() => setReplying(true)}>
            Reply
          </button>
        )}

        {replying && (
          <form onSubmit={handleReplySubmit} className="comment-reply-form">
            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Write a reply… Use @ to mention someone"
              rows={2}
              autoFocus
            />
            <div className="comment-form-actions">
              <button type="submit" className="button button-primary small-button" disabled={sending}>
                {sending ? "Posting…" : "Reply"}
              </button>
              <button type="button" className="button button-secondary small-button" onClick={() => setReplying(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function CommentsSection({ caseId }: { caseId: string }) {
  const { user, accessToken } = useAuth();
  const { toast } = useNotifications();
  const [comments, setComments] = useState<CaseComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    getCaseComments(accessToken, caseId)
      .then(setComments)
      .catch(() => { /* silently ignore — comments are non-critical */ })
      .finally(() => setLoading(false));
  }, [accessToken, caseId]);

  async function handleAddComment(e: FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !accessToken) return;
    setSending(true);
    try {
      const c = await createCaseComment(accessToken, caseId, {
        content: newComment.trim(),
        mentions: [],
        parentId: null,
      });
      setComments((prev) => [...prev, c]);
      setNewComment("");
      toast({ type: "success", title: "Comment added" });
    } catch (err: unknown) {
      toast({ type: "error", title: err instanceof Error ? err.message : "Failed to add comment" });
    } finally {
      setSending(false);
    }
  }

  async function handleReply(parentId: string, content: string) {
    if (!accessToken) return;
    try {
      const reply = await createCaseComment(accessToken, caseId, {
        content, mentions: [], parentId,
      });
      setComments((prev) =>
        prev.map((c) =>
          c.id === parentId ? { ...c, replies: [...c.replies, reply] } : c,
        ),
      );
      toast({ type: "success", title: "Reply added" });
    } catch (err: unknown) {
      toast({ type: "error", title: err instanceof Error ? err.message : "Failed to reply" });
    }
  }

  return (
    <div className="detail-card" style={{ marginTop: "var(--space-5)", gridColumn: "1 / -1" }}>
      <p className="eyebrow">DISCUSSION</p>
      <h2 style={{ margin: "4px 0 var(--space-5)", fontSize: "var(--text-lg)", letterSpacing: "var(--tracking-snug)" }}>
        Comments
      </h2>

      {user && (
        <form onSubmit={handleAddComment} className="comment-form">
          <div className="comment-form-avatar" aria-hidden="true">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="comment-form-body">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment… Use @ to mention team members."
              rows={3}
            />
            <div className="comment-form-footer">
              <p className="comment-form-hint">Use @name to mention someone.</p>
              <button
                type="submit"
                className="button button-primary small-button"
                disabled={sending || !newComment.trim()}
              >
                {sending ? "Posting…" : "Post comment"}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="comments-list">
        {loading ? (
          <p className="ev-muted" style={{ fontSize: "var(--text-sm)", padding: "var(--space-4) 0" }}>
            Loading comments…
          </p>
        ) : comments.length === 0 ? (
          <div className="ev-empty-state" style={{ padding: "var(--space-8) 0" }}>
            <strong>No comments yet.</strong>
            <p>Start the discussion.</p>
          </div>
        ) : (
          comments.map((c) => (
            <CommentItem key={c.id} comment={c} onReply={handleReply} />
          ))
        )}
      </div>
    </div>
  );
}

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
  const [exportingPdf, setExportingPdf] = useState(false);

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

  useEffect(() => {
    loadCase();
  }, [loadCase]);

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

      {/* Detail grid */}
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

      {/* ── Comments section ─────────────────────────────────────── */}
      <div style={{ marginTop: 24 }}>
        <CommentsSection caseId={id} />
      </div>
    </WorkspaceShell>
  );
}
