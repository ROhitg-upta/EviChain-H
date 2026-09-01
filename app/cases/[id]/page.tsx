"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../auth-context";
import { useNotifications } from "../../notification-context";
import {
  getCaseById, updateCase, getCaseComments, createCaseComment,
  type CaseDetail, type EvidenceRecord, type CaseComment,
} from "@/lib/api";

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

function truncate(text: string, max = 100) {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
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

const STATUS_CLASS: Record<string, string> = {
  Active: "case-status--active",
  Review: "case-status--review",
  Closed: "case-status--closed",
  Archived: "case-status--archived",
};

const PRIORITY_CLASS: Record<string, string> = {
  Critical: "case-priority--critical",
  High: "case-priority--high",
  Medium: "case-priority--medium",
  Low: "case-priority--low",
};

const EV_STATUS_CLASS: Record<string, string> = {
  PENDING: "pending", VERIFIED: "verified",
  FLAGGED: "flagged", SEALED: "sealed",
};

// ── Component ─────────────────────────────────────────────────────

export default function CaseDetailPage({ params }: { params: { id: string } }) {
  const { user, loading: authLoading, accessToken, canEdit } = useAuth();

  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Status update
  const [newStatus, setNewStatus] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [updateSuccess, setUpdateSuccess] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) window.location.replace("/login");
  }, [authLoading, user]);

  useEffect(() => {
    if (!accessToken) return;
    setFetching(true);
    getCaseById(accessToken, params.id)
      .then((data) => {
        setCaseData(data);
        setNewStatus(data.status);
      })
      .catch((err: unknown) =>
        setFetchError(err instanceof Error ? err.message : "Failed to load case"),
      )
      .finally(() => setFetching(false));
  }, [accessToken, params.id]);

  async function handleStatusUpdate(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !caseData || newStatus === caseData.status) return;
    setUpdating(true);
    setUpdateError("");
    setUpdateSuccess(false);
    try {
      const updated = await updateCase(accessToken, params.id, { status: newStatus });
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
      <main className="cases-shell">
        <p className="cases-loading" role="status" aria-live="polite">Loading…</p>
      </main>
    );
  }

  if (fetchError || !caseData) {
    return (
      <main className="cases-shell">
        <header className="ev-topbar">
          <a className="ev-brand" href="/"><span className="brand-mark">E</span>
            <span><strong>EviChain</strong><small>Case management</small></span>
          </a>
        </header>
        <div className="error-message" style={{ marginTop: 40 }} role="alert">
          {fetchError || "Case not found."}
        </div>
        <a className="button button-secondary" style={{ marginTop: 16 }} href="/cases">
          ← Back to cases
        </a>
      </main>
    );
  }

  const evidence: EvidenceRecord[] = caseData.evidence ?? [];

  // ── Main render ────────────────────────────────────────────────
  return (
    <main className="cases-shell">
      <header className="ev-topbar">
        <a className="ev-brand" href="/">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span><strong>EviChain</strong><small>Case management</small></span>
        </a>
        <nav className="ev-nav" aria-label="Primary navigation">
          <a href="/cases">← Cases</a>
          <a href="/evidence">Evidence</a>
          {user && (
            <span className="operator" aria-label={user.name}>{user.initials}</span>
          )}
        </nav>
      </header>

      {/* Page title */}
      <div className="page-header">
        <div>
          <p className="eyebrow">CASE RECORD · {caseData.id.slice(0, 8).toUpperCase()}</p>
          <h1>{caseData.title}</h1>
          <div className="ev-detail-chips">
            <span
              className={`case-status-badge ${STATUS_CLASS[caseData.status] ?? "case-status--active"}`}
              aria-label={`Status: ${caseData.status}`}
            >
              {caseData.status}
            </span>
            {caseData.priority && (
              <span
                className={`case-priority-badge ${PRIORITY_CLASS[caseData.priority] ?? ""}`}
                aria-label={`Priority: ${caseData.priority}`}
              >
                {caseData.priority} priority
              </span>
            )}
            <span className="ev-chip">
              {evidence.length} evidence item{evidence.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="ev-header-actions">
          <a
            className="button button-primary small-button"
            href={`/evidence/new?caseId=${caseData.id}`}
            aria-label="Upload evidence for this case"
          >
            + Add evidence
          </a>
        </div>
      </div>

      {/* Detail layout */}
      <div className="case-detail-grid">
        {/* Left column — metadata + status + description */}
        <div className="case-detail-left">

          {/* Metadata card */}
          <div className="detail-card">
            <p className="eyebrow">CASE METADATA</p>
            <dl className="ev-meta-dl">
              <div>
                <dt>Case ID</dt>
                <dd><code>{caseData.id}</code></dd>
              </div>
              <div>
                <dt>Lead investigator</dt>
                <dd>{caseData.lead?.name ?? "—"}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{fmtDate(caseData.createdAt)}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{fmtDate(caseData.updatedAt)}</dd>
              </div>
              {caseData.priority && (
                <div>
                  <dt>Priority</dt>
                  <dd>{caseData.priority}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Description */}
          {caseData.description && (
            <div className="detail-card">
              <p className="eyebrow">DESCRIPTION</p>
              <p className="case-description-body">{caseData.description}</p>
            </div>
          )}

          {/* Status update */}
          <div className="detail-card">
            <p className="eyebrow">STATUS CONTROL</p>
            <h2 style={{ margin: "4px 0 14px", fontSize: 16, letterSpacing: "-0.03em" }}>
              Update case status
            </h2>
            <form
              onSubmit={handleStatusUpdate}
              className="case-status-form"
              aria-label="Update case status"
            >
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                aria-label="Select new status"
                disabled={!canEdit}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                className="button button-primary small-button"
                type="submit"
                disabled={updating || !canEdit || newStatus === caseData.status}
                aria-label="Save new status"
              >
                {updating
                  ? <span className="loading-spinner">Saving…</span>
                  : "Update status"}
              </button>
            </form>
            {updateError && (
              <div className="error-message" style={{ marginTop: 10 }} role="alert">
                {updateError}
              </div>
            )}
            {updateSuccess && (
              <div className="ev-info-banner" role="status" aria-live="polite">
                Status updated to <strong>{newStatus}</strong>.
              </div>
            )}
            {!canEdit && (
              <p className="ev-field-hint" style={{ marginTop: 8 }}>
                Auditor mode — status changes are disabled.
              </p>
            )}
          </div>
        </div>

        {/* Right column — evidence list */}
        <div className="case-detail-right">
          <div className="detail-card evidence-list-card">
            <div className="evidence-list-header">
              <div>
                <p className="eyebrow">LINKED EVIDENCE</p>
                <h2>Evidence items</h2>
              </div>
              <a
                className="button button-primary small-button"
                href={`/evidence/new?caseId=${caseData.id}`}
                aria-label="Upload new evidence for this case"
              >
                + Add evidence
              </a>
            </div>

            {evidence.length === 0 ? (
              <div className="evidence-empty">
                <strong>No evidence linked to this case yet.</strong>
                <p>
                  Upload evidence files and they will automatically appear here once
                  linked to this case.
                </p>
                <a
                  className="button button-primary small-button"
                  href={`/evidence/new?caseId=${caseData.id}`}
                >
                  Upload first evidence file →
                </a>
              </div>
            ) : (
              <ol className="evidence-list" aria-label="Evidence linked to this case">
                {evidence.map((ev) => (
                  <li key={ev.id} className="evidence-item">
                    <span className="ev-mime-badge" aria-hidden="true">
                      {mimeIcon(ev.mimeType)}
                    </span>
                    <div className="evidence-item-main">
                      <strong>{ev.name}</strong>
                      <small>
                        {fmtBytes(ev.sizeBytes)} ·{" "}
                        {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" })
                          .format(new Date(ev.createdAt))} ·{" "}
                        {ev.collectedBy?.name ?? "Unknown"}
                      </small>
                    </div>
                    <div className="evidence-item-right">
                      <span
                        className={`status ${EV_STATUS_CLASS[ev.status] ?? "pending"}`}
                        aria-label={`Evidence status: ${ev.status}`}
                      >
                        <span aria-hidden="true" />
                        {ev.status.charAt(0) + ev.status.slice(1).toLowerCase()}
                      </span>
                      <a
                        className="button button-secondary small-button"
                        href={`/evidence/${ev.id}`}
                        aria-label={`View evidence: ${ev.name}`}
                      >
                        View
                      </a>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      {/* ── Comments section ─────────────────────────────────────── */}
      <CommentsSection caseId={params.id} />
    </main>
  );
}
