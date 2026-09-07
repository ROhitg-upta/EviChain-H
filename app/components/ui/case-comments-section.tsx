"use client";

import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/auth-context";
import { useNotifications } from "@/app/notification-context";
import {
  getCaseComments,
  createCaseComment,
  updateCaseComment,
  deleteCaseComment,
  getCaseMentionCandidates,
  type CaseComment,
  type CaseMentionCandidate,
} from "@/lib/api";
import { MessageSquare, Edit3, Trash2, Check, X } from "@/app/components/ui/icons";

interface CaseCommentsSectionProps {
  caseId: string;
}

export default function CaseCommentsSection({ caseId }: CaseCommentsSectionProps) {
  const { user, accessToken } = useAuth();
  const { toast } = useNotifications();

  const [comments, setComments] = useState<CaseComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);

  // Mention autocomplete state for top compose box
  const [candidates, setCandidates] = useState<CaseMentionCandidate[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionCursor, setMentionCursor] = useState(0);

  // Replying state
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);

  // Editing state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const isAuditor = user?.role === "Auditor";
  const isAdmin = user?.role === "Administrator";

  // Load comments
  const loadComments = useCallback(() => {
    if (!accessToken || !caseId) return;
    setLoading(true);
    getCaseComments(accessToken, caseId)
      .then(setComments)
      .catch((err: unknown) => {
        console.error("Failed to load comments:", err);
      })
      .finally(() => setLoading(false));
  }, [accessToken, caseId]);

  // Load mention candidates
  useEffect(() => {
    if (!accessToken || !caseId || isAuditor) return;
    getCaseMentionCandidates(accessToken, caseId)
      .then(setCandidates)
      .catch(() => {});
  }, [accessToken, caseId, isAuditor]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Handle typing with @ mention detection
  function handleCommentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    setNewComment(text);

    const pos = e.target.selectionStart;
    const textBefore = text.slice(0, pos);
    const lastAt = textBefore.lastIndexOf("@");

    if (lastAt !== -1) {
      const query = textBefore.slice(lastAt + 1);
      if (!query.includes(" ") && !query.includes("\n")) {
        setMentionFilter(query.toLowerCase());
        setShowMentions(true);
        setMentionCursor(lastAt);
        return;
      }
    }
    setShowMentions(false);
  }

  function handleSelectMention(candidate: CaseMentionCandidate) {
    const textBefore = newComment.slice(0, mentionCursor);
    const textAfter = newComment.slice(mentionCursor + mentionFilter.length + 1);
    const mentionTag = `@[${candidate.name}](${candidate.id}) `;
    setNewComment(textBefore + mentionTag + textAfter);
    setShowMentions(false);
  }

  async function handleAddComment(e: FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !accessToken || isAuditor) return;
    setSending(true);

    try {
      const c = await createCaseComment(accessToken, caseId, {
        content: newComment.trim(),
        parentId: null,
      });
      setComments((prev) => [...prev, c]);
      setNewComment("");
      setShowMentions(false);
      toast({ type: "success", title: "Comment posted" });
    } catch (err: unknown) {
      toast({ type: "error", title: err instanceof Error ? err.message : "Failed to post comment" });
    } finally {
      setSending(false);
    }
  }

  async function handleAddReply(parentId: string) {
    if (!replyText.trim() || !accessToken || isAuditor) return;
    setReplySending(true);

    try {
      const reply = await createCaseComment(accessToken, caseId, {
        content: replyText.trim(),
        parentId,
      });

      setComments((prev) =>
        prev.map((c) => (c.id === parentId ? { ...c, replies: [...(c.replies || []), reply] } : c)),
      );
      setReplyText("");
      setReplyingToId(null);
      toast({ type: "success", title: "Reply added" });
    } catch (err: unknown) {
      toast({ type: "error", title: err instanceof Error ? err.message : "Failed to add reply" });
    } finally {
      setReplySending(false);
    }
  }

  async function handleSaveEdit(commentId: string) {
    if (!editText.trim() || !accessToken || isAuditor) return;
    setEditSaving(true);

    try {
      const updated = await updateCaseComment(accessToken, caseId, commentId, {
        content: editText.trim(),
        reason: editReason.trim() || undefined,
      });

      // Update in top-level or replies
      setComments((prev) =>
        prev.map((c) => {
          if (c.id === commentId) return { ...c, content: updated.content, editedAt: updated.editedAt };
          return {
            ...c,
            replies: (c.replies || []).map((r) =>
              r.id === commentId ? { ...r, content: updated.content, editedAt: updated.editedAt } : r,
            ),
          };
        }),
      );

      setEditingCommentId(null);
      setEditText("");
      setEditReason("");
      toast({ type: "success", title: "Comment updated" });
    } catch (err: unknown) {
      toast({ type: "error", title: err instanceof Error ? err.message : "Failed to update comment" });
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(commentId: string) {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    if (!accessToken || isAuditor) return;

    try {
      await deleteCaseComment(accessToken, caseId, commentId);

      // Remove from view
      setComments((prev) =>
        prev
          .filter((c) => c.id !== commentId)
          .map((c) => ({
            ...c,
            replies: (c.replies || []).filter((r) => r.id !== commentId),
          })),
      );

      toast({ type: "success", title: "Comment deleted" });
    } catch (err: unknown) {
      toast({ type: "error", title: err instanceof Error ? err.message : "Failed to delete comment" });
    }
  }

  // Render styled mention chips in comment text
  function renderCommentBody(text: string) {
    // Match @[Name](UUID) or raw @Name
    const parts = text.split(/(@\[[^\]]+\]\([^)]+\)|@[\w\s.-]{2,30})/g);
    return parts.map((part, i) => {
      const bracketMatch = part.match(/^@\[([^\]]+)\]\(([^)]+)\)$/);
      if (bracketMatch) {
        return (
          <span
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "1px 6px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(34, 211, 238, 0.15)",
              border: "1px solid rgba(34, 211, 238, 0.35)",
              color: "var(--accent-active, #22d3ee)",
              fontWeight: 600,
              fontSize: "0.95em",
              margin: "0 2px",
            }}
          >
            @{bracketMatch[1]}
          </span>
        );
      }
      if (part.startsWith("@")) {
        return (
          <span
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "1px 6px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(34, 211, 238, 0.15)",
              border: "1px solid rgba(34, 211, 238, 0.35)",
              color: "var(--accent-active, #22d3ee)",
              fontWeight: 600,
              fontSize: "0.95em",
              margin: "0 2px",
            }}
          >
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  const filteredCandidates = candidates.filter((c) =>
    c.name.toLowerCase().includes(mentionFilter) || c.role.toLowerCase().includes(mentionFilter),
  );

  return (
    <div className="case-comments-section" style={{ marginTop: 24, paddingBottom: 60 }}>
      {/* Section Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MessageSquare width={18} height={18} style={{ color: "var(--accent-active, #22d3ee)" }} />
          <h3 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: 700, color: "var(--text-primary)" }}>
            Case Discussion & Team Notes
          </h3>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border-subtle)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--text-secondary)",
            }}
          >
            {comments.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0)} comments
          </span>
        </div>
      </div>

      {/* Auditor Read-Only Notice */}
      {isAuditor && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-secondary)",
            fontSize: "var(--text-xs)",
            marginBottom: 16,
          }}
        >
          🔒 <strong>Auditor Inspection Mode:</strong> Collaboration threads are visible in read-only format. Creating, editing, or deleting comments is restricted.
        </div>
      )}

      {/* Compose Form (Investigator / Administrator) */}
      {!isAuditor && user && (
        <div style={{ position: "relative", marginBottom: 24 }}>
          <form
            onSubmit={handleAddComment}
            style={{
              background: "var(--surface-sunken)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              padding: 14,
            }}
          >
            <div style={{ display: "flex", gap: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--brand-600)",
                  color: "#ffffff",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 700,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>

              <div style={{ flex: 1 }}>
                <textarea
                  className="input textarea"
                  rows={3}
                  placeholder="Post an investigation note… Type @ to mention case team members"
                  value={newComment}
                  onChange={handleCommentChange}
                  disabled={sending}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    resize: "vertical",
                    fontSize: "var(--text-sm)",
                    color: "var(--text-primary)",
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: "1px solid var(--border-subtle)",
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>
                    Type <strong style={{ color: "var(--accent-active)" }}>@</strong> to mention case investigators
                  </span>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={sending || !newComment.trim()}
                  >
                    {sending ? "Posting…" : "Post Comment"}
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* Mention Autocomplete Dropdown */}
          {showMentions && filteredCandidates.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 44,
                zIndex: 50,
                marginTop: 4,
                background: "var(--surface-raised)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-surface)",
                width: 260,
                maxHeight: 180,
                overflowY: "auto",
              }}
            >
              <div style={{ padding: "6px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-disabled)", borderBottom: "1px solid var(--border-subtle)", textTransform: "uppercase" }}>
                Case Team Mentions
              </div>
              {filteredCandidates.map((cand) => (
                <button
                  key={cand.id}
                  type="button"
                  onClick={() => handleSelectMention(cand)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "8px 12px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <strong>{cand.name}</strong>
                  <span style={{ fontSize: 10, color: "var(--text-disabled)", fontFamily: "var(--font-mono)" }}>
                    {cand.role}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Comments List */}
      {loading ? (
        <div style={{ display: "grid", gap: 12 }}>
          {[1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 80, borderRadius: "var(--radius-md)" }} />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "40px 16px",
            background: "var(--surface-sunken)",
            border: "1px dashed var(--border-default)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-secondary)",
          }}
        >
          <MessageSquare width={32} height={32} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
          <strong style={{ display: "block", color: "var(--text-primary)", fontSize: "var(--text-sm)" }}>
            No comments yet
          </strong>
          <p style={{ margin: "4px 0 0", fontSize: "var(--text-xs)", color: "var(--text-disabled)" }}>
            Start the case discussion or record initial briefing notes.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {comments.map((comment) => {
            const isAuthor = user?.id === comment.user.id;
            const canModify = (isAuthor || isAdmin) && !isAuditor;
            const isEditing = editingCommentId === comment.id;

            return (
              <div
                key={comment.id}
                style={{
                  background: "var(--surface-sunken)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md)",
                  padding: 16,
                }}
              >
                {/* Comment Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid var(--border-subtle)",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 700,
                        fontSize: 12,
                        color: "var(--text-primary)",
                      }}
                    >
                      {comment.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <strong style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>
                          {comment.user.name}
                        </strong>
                        {comment.user.role && (
                          <span style={{ fontSize: 10, color: "var(--text-disabled)", fontFamily: "var(--font-mono)" }}>
                            ({comment.user.role})
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-disabled)" }}>
                        <time dateTime={comment.createdAt}>
                          {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
                            new Date(comment.createdAt),
                          )}
                        </time>
                        {comment.editedAt && <span>· <em style={{ fontStyle: "normal", opacity: 0.8 }}>(edited)</em></span>}
                      </div>
                    </div>
                  </div>

                  {/* Comment Actions */}
                  {canModify && !isEditing && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCommentId(comment.id);
                          setEditText(comment.content);
                          setEditReason("");
                        }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 4 }}
                        title="Edit comment"
                      >
                        <Edit3 width={14} height={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(comment.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-danger)", padding: 4 }}
                        title="Delete comment"
                      >
                        <Trash2 width={14} height={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Comment Body or Edit Form */}
                {isEditing ? (
                  <div style={{ marginTop: 12, padding: 12, background: "var(--surface-raised)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                    <textarea
                      className="input textarea"
                      rows={3}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      disabled={editSaving}
                      style={{ width: "100%", marginBottom: 8 }}
                    />
                    {isAdmin && !isAuthor && (
                      <input
                        type="text"
                        className="input"
                        placeholder="Reason for administrative moderation..."
                        value={editReason}
                        onChange={(e) => setEditReason(e.target.value)}
                        style={{ marginBottom: 8, fontSize: 12 }}
                      />
                    )}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={editSaving}
                        onClick={() => setEditingCommentId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={editSaving || !editText.trim()}
                        onClick={() => handleSaveEdit(comment.id)}
                      >
                        {editSaving ? "Saving…" : "Save Changes"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6, wordBreak: "break-word" }}>
                    {renderCommentBody(comment.content)}
                  </div>
                )}

                {/* Reply Trigger */}
                {!isAuditor && user && !isEditing && (
                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingToId(replyingToId === comment.id ? null : comment.id);
                        setReplyText("");
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--brand-400)",
                        fontSize: 12,
                        fontWeight: 600,
                        padding: 0,
                      }}
                    >
                      {replyingToId === comment.id ? "Cancel Reply" : "↳ Reply"}
                    </button>
                  </div>
                )}

                {/* Reply Input Box */}
                {replyingToId === comment.id && !isAuditor && (
                  <div style={{ marginTop: 12, marginLeft: 20, padding: 12, background: "var(--surface-raised)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                    <textarea
                      className="input textarea"
                      rows={2}
                      placeholder={`Reply to ${comment.user.name}…`}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      disabled={replySending}
                      autoFocus
                      style={{ width: "100%", marginBottom: 8 }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={replySending}
                        onClick={() => setReplyingToId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={replySending || !replyText.trim()}
                        onClick={() => handleAddReply(comment.id)}
                      >
                        {replySending ? "Posting…" : "Post Reply"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Nested Replies */}
                {comment.replies && comment.replies.length > 0 && (
                  <div style={{ marginTop: 14, marginLeft: 20, borderLeft: "2px solid var(--border-subtle)", paddingLeft: 14, display: "grid", gap: 12 }}>
                    {comment.replies.map((reply) => {
                      const isReplyAuthor = user?.id === reply.user.id;
                      const canModifyReply = (isReplyAuthor || isAdmin) && !isAuditor;
                      const isEditingReply = editingCommentId === reply.id;

                      return (
                        <div key={reply.id} style={{ background: "rgba(255,255,255,0.02)", padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <strong style={{ fontSize: 12, color: "var(--text-primary)" }}>
                                {reply.user.name}
                              </strong>
                              <time dateTime={reply.createdAt} style={{ fontSize: 10, color: "var(--text-disabled)" }}>
                                {new Intl.DateTimeFormat("en-IN", { dateStyle: "short", timeStyle: "short" }).format(new Date(reply.createdAt))}
                              </time>
                              {reply.editedAt && <span style={{ fontSize: 10, color: "var(--text-disabled)" }}>(edited)</span>}
                            </div>

                            {canModifyReply && !isEditingReply && (
                              <div style={{ display: "flex", gap: 4 }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCommentId(reply.id);
                                    setEditText(reply.content);
                                    setEditReason("");
                                  }}
                                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 2 }}
                                  title="Edit reply"
                                >
                                  <Edit3 width={12} height={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(reply.id)}
                                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-danger)", padding: 2 }}
                                  title="Delete reply"
                                >
                                  <Trash2 width={12} height={12} />
                                </button>
                              </div>
                            )}
                          </div>

                          {isEditingReply ? (
                            <div style={{ marginTop: 8 }}>
                              <textarea
                                className="input textarea"
                                rows={2}
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                disabled={editSaving}
                                style={{ width: "100%", marginBottom: 6, fontSize: 12 }}
                              />
                              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  disabled={editSaving}
                                  onClick={() => setEditingCommentId(null)}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={editSaving || !editText.trim()}
                                  onClick={() => handleSaveEdit(reply.id)}
                                >
                                  {editSaving ? "Saving…" : "Save"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, wordBreak: "break-word" }}>
                              {renderCommentBody(reply.content)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
