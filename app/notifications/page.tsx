"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "../auth-context";
import { useNotifications } from "../notification-context";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

type FilterTab =
  | "ALL"
  | "NEEDS_ATTENTION"
  | "INTEGRITY"
  | "CUSTODY"
  | "EVIDENCE"
  | "SECURITY"
  | "OFFLINE_SYNC"
  | "READ";

const SEVERITY_TOKENS: Record<
  string,
  { label: string; rail: string; badgeBg: string; badgeColor: string; border: string }
> = {
  CRITICAL: {
    label: "CRITICAL",
    rail: "var(--accent-danger, #f43f5e)",
    badgeBg: "rgba(244, 63, 94, 0.14)",
    badgeColor: "#f43f5e",
    border: "rgba(244, 63, 94, 0.35)",
  },
  SECURITY: {
    label: "SECURITY",
    rail: "#c084fc",
    badgeBg: "rgba(168, 85, 247, 0.14)",
    badgeColor: "#c084fc",
    border: "rgba(168, 85, 247, 0.35)",
  },
  HIGH: {
    label: "HIGH",
    rail: "#fb923c",
    badgeBg: "rgba(249, 115, 22, 0.14)",
    badgeColor: "#fb923c",
    border: "rgba(249, 115, 22, 0.35)",
  },
  WARNING: {
    label: "WARNING",
    rail: "var(--accent-warning, #fbbf24)",
    badgeBg: "rgba(251, 191, 36, 0.12)",
    badgeColor: "#fbbf24",
    border: "rgba(251, 191, 36, 0.35)",
  },
  SUCCESS: {
    label: "VERIFIED",
    rail: "var(--accent-verified, #b5f542)",
    badgeBg: "rgba(181, 245, 66, 0.12)",
    badgeColor: "#b5f542",
    border: "rgba(181, 245, 66, 0.3)",
  },
  INFO: {
    label: "INFO",
    rail: "var(--accent-active, #22d3ee)",
    badgeBg: "rgba(34, 211, 238, 0.12)",
    badgeColor: "#22d3ee",
    border: "rgba(34, 211, 238, 0.25)",
  },
};

function formatIsoDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "short",
      timeStyle: "medium",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatRelativeTime(iso: string) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

export default function NotificationsPage() {
  const { loading: authLoading } = useAuth();
  const {
    notifications,
    unreadCount,
    actionRequiredCount,
    needsAttentionQueue,
    markAsRead,
    markAllAsRead,
    dismissAlert,
    executeAction,
    loading,
    refresh,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<FilterTab>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (activeTab === "NEEDS_ATTENTION") {
        return Boolean(n.actionRequired && !n.resolvedAt);
      }
      if (activeTab === "INTEGRITY") {
        return (
          n.type.includes("INTEGRITY") ||
          n.severity === "CRITICAL" ||
          n.entityType === "EVIDENCE"
        );
      }
      if (activeTab === "CUSTODY") {
        return n.type.includes("CUSTODY") || n.type === "transfer" || n.entityType === "CUSTODY";
      }
      if (activeTab === "EVIDENCE") {
        return n.type.includes("EVIDENCE") || n.entityType === "EVIDENCE";
      }
      if (activeTab === "SECURITY") {
        return (
          n.type.includes("SECURITY") ||
          n.severity === "SECURITY" ||
          n.type === "error" ||
          n.type === "warning"
        );
      }
      if (activeTab === "OFFLINE_SYNC") {
        return (
          n.type.includes("OFFLINE") ||
          n.title.toLowerCase().includes("offline") ||
          n.entityType === "OFFLINE_QUEUE"
        );
      }
      if (activeTab === "READ") {
        return n.read;
      }
      return true;
    });
  }, [notifications, activeTab]);

  const handleTriageAction = async (id: string, actionType: string) => {
    setActionLoadingId(id);
    try {
      await executeAction(id, actionType);
    } finally {
      setActionLoadingId(null);
    }
  };

  if (authLoading) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Alert Center" }]}>
        <div style={{ padding: "32px" }}>
          <div className="skeleton" style={{ height: "40px", width: "240px", marginBottom: "20px" }} />
          <div className="skeleton" style={{ height: "200px", width: "100%" }} />
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell breadcrumbs={[{ label: "Investigation Alert Center" }]}>
      <div style={{ padding: "24px 16px 80px", maxWidth: "1200px", margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        {/* Header Strip */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "var(--brand-400, #4abe94)",
                  textTransform: "uppercase",
                  background: "rgba(74, 190, 148, 0.12)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  border: "1px solid rgba(74, 190, 148, 0.25)",
                }}
              >
                ● LIVE INCIDENT BEACON ACTIVE
              </span>
            </div>
            <h1
              style={{
                fontSize: "clamp(22px, 4vw, 30px)",
                fontWeight: 800,
                color: "var(--text-primary, #f8fafc)",
                margin: 0,
                letterSpacing: "var(--tracking-tight, -0.02em)",
              }}
            >
              Investigation Alert Center
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--text-secondary, #94a3b8)" }}>
              {actionRequiredCount > 0 ? (
                <strong style={{ color: "var(--accent-warning, #fbbf24)" }}>
                  ⚠️ {actionRequiredCount} item(s) currently require investigator action.
                </strong>
              ) : unreadCount > 0 ? (
                `${unreadCount} unread alert${unreadCount !== 1 ? "s" : ""} in feed.`
              ) : (
                "Forensic perimeter verified. All alerts triaged."
              )}
            </p>
          </div>

          {/* Action Tools */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              className="btn btn-secondary btn-md"
              onClick={() => refresh()}
              disabled={loading}
              title="Refresh alert feed"
              style={{ minHeight: "40px" }}
            >
              ↻ Refresh
            </button>
            {unreadCount > 0 && (
              <button
                className="btn btn-secondary btn-md"
                onClick={markAllAsRead}
                title="Mark all notifications as read"
                style={{ minHeight: "40px" }}
              >
                Mark all read
              </button>
            )}
          </div>
        </div>

        {/* Needs Attention Alert Intelligence Banner (if items exist) */}
        {needsAttentionQueue.length > 0 && activeTab !== "NEEDS_ATTENTION" && (
          <div
            style={{
              padding: "16px 20px",
              background: "rgba(251, 191, 36, 0.08)",
              border: "1px solid rgba(251, 191, 36, 0.35)",
              borderRadius: "var(--radius-lg, 8px)",
              marginBottom: "24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "20px" }}>⚡</span>
              <div>
                <strong style={{ color: "var(--accent-warning, #fbbf24)", fontSize: "14px", display: "block" }}>
                  {needsAttentionQueue.length} High-Priority Alert(s) Demand Review
                </strong>
                <span style={{ fontSize: "12px", color: "var(--text-secondary, #94a3b8)" }}>
                  Evidence integrity anomalies or inactive leads need your immediate forensic review.
                </span>
              </div>
            </div>
            <button
              className="btn btn-sm"
              onClick={() => setActiveTab("NEEDS_ATTENTION")}
              style={{
                background: "rgba(251, 191, 36, 0.2)",
                color: "#fbbf24",
                border: "1px solid rgba(251, 191, 36, 0.4)",
                fontWeight: 700,
                minHeight: "36px",
              }}
            >
              Filter Needs Attention ({needsAttentionQueue.length}) →
            </button>
          </div>
        )}

        {/* Filter Navigation Tabs */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            overflowX: "auto",
            paddingBottom: "8px",
            marginBottom: "20px",
            borderBottom: "1px solid var(--border-default, #23272f)",
            WebkitOverflowScrolling: "touch",
          }}
          role="tablist"
          aria-label="Filter alerts"
        >
          {[
            { id: "ALL", label: "All Alerts", count: notifications.length },
            { id: "NEEDS_ATTENTION", label: "Needs Attention", count: actionRequiredCount },
            { id: "INTEGRITY", label: "Integrity", count: undefined },
            { id: "CUSTODY", label: "Custody", count: undefined },
            { id: "EVIDENCE", label: "Evidence", count: undefined },
            { id: "SECURITY", label: "Security", count: undefined },
            { id: "OFFLINE_SYNC", label: "Offline Sync", count: undefined },
            { id: "READ", label: "Read", count: undefined },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id as FilterTab)}
                style={{
                  background: isActive ? "var(--surface-raised, #181b20)" : "transparent",
                  color: isActive ? "var(--text-primary, #f8fafc)" : "var(--text-muted, #94a3b8)",
                  border: isActive
                    ? "1px solid var(--border-default, #23272f)"
                    : "1px solid transparent",
                  borderBottom: isActive ? "2px solid var(--brand-500, #4abe94)" : "none",
                  borderRadius: "6px 6px 0 0",
                  padding: "8px 14px",
                  fontSize: "13px",
                  fontWeight: isActive ? 700 : 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  minHeight: "40px",
                  transition: "all var(--transition-fast, 150ms ease)",
                }}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "11px",
                      background:
                        tab.id === "NEEDS_ATTENTION"
                          ? "rgba(251, 191, 36, 0.2)"
                          : "rgba(255, 255, 255, 0.08)",
                      color: tab.id === "NEEDS_ATTENTION" ? "#fbbf24" : "var(--text-secondary, #94a3b8)",
                      padding: "1px 6px",
                      borderRadius: "10px",
                      fontWeight: 700,
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Alerts List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {loading && notifications.length === 0 ? (
            <div
              style={{
                padding: "48px",
                textAlign: "center",
                color: "var(--text-muted, #94a3b8)",
                background: "var(--surface-raised, #181b20)",
                borderRadius: "var(--radius-lg, 8px)",
                border: "1px solid var(--border-default, #23272f)",
              }}
            >
              Loading forensic alert dispatch…
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div
              style={{
                padding: "60px 24px",
                textAlign: "center",
                background: "var(--surface-raised, #181b20)",
                borderRadius: "var(--radius-lg, 8px)",
                border: "1px solid var(--border-default, #23272f)",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  margin: "0 auto 16px",
                  borderRadius: "50%",
                  background: "rgba(74, 190, 148, 0.12)",
                  color: "var(--brand-400, #4abe94)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "24px",
                  border: "1px solid rgba(74, 190, 148, 0.25)",
                }}
              >
                ✓
              </div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary, #f8fafc)", margin: "0 0 6px" }}>
                All Clear — No Alerts Found
              </h3>
              <p style={{ fontSize: "13px", color: "var(--text-muted, #94a3b8)", margin: 0, maxWidth: "420px", marginLeft: "auto", marginRight: "auto" }}>
                There are no alerts matching the selected filter ({activeTab.replace(/_/g, " ")}).
              </p>
            </div>
          ) : (
            filteredNotifications.map((notif) => {
              const sevKey = notif.severity || "INFO";
              const sev = SEVERITY_TOKENS[sevKey] || SEVERITY_TOKENS.INFO;
              const isExpanded = expandedId === notif.id;
              const isActionLoading = actionLoadingId === notif.id;

              return (
                <article
                  key={notif.id}
                  style={{
                    display: "flex",
                    position: "relative",
                    background: notif.read ? "var(--surface-raised, #181b20)" : "var(--surface-sunken, #0a0c0e)",
                    border: "1px solid var(--border-default, #23272f)",
                    borderRadius: "var(--radius-lg, 8px)",
                    overflow: "hidden",
                    transition: "border-color var(--transition-fast, 150ms ease)",
                  }}
                >
                  {/* Vertical Severity Rail on the Left */}
                  <div
                    style={{
                      width: "6px",
                      background: sev.rail,
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  />

                  <div style={{ flex: 1, padding: "18px 20px", minWidth: 0 }}>
                    {/* Top Metadata Row */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                        marginBottom: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono, monospace)",
                          fontSize: "11px",
                          fontWeight: 800,
                          padding: "2px 7px",
                          borderRadius: "4px",
                          background: sev.badgeBg,
                          color: sev.badgeColor,
                          border: `1px solid ${sev.border}`,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {sev.label}
                      </span>

                      {notif.actionRequired && !notif.resolvedAt && (
                        <span
                          style={{
                            fontFamily: "var(--font-mono, monospace)",
                            fontSize: "11px",
                            fontWeight: 800,
                            padding: "2px 7px",
                            borderRadius: "4px",
                            background: "rgba(251, 191, 36, 0.15)",
                            color: "#fbbf24",
                            border: "1px solid rgba(251, 191, 36, 0.4)",
                          }}
                        >
                          ⚡ ACTION REQUIRED
                        </span>
                      )}

                      {notif.resolvedAt && (
                        <span
                          style={{
                            fontFamily: "var(--font-mono, monospace)",
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: "4px",
                            background: "rgba(181, 245, 66, 0.1)",
                            color: "var(--accent-verified, #b5f542)",
                            border: "1px solid rgba(181, 245, 66, 0.25)",
                          }}
                        >
                          RESOLVED
                        </span>
                      )}

                      {notif.entityType && notif.entityId && (
                        <span
                          style={{
                            fontFamily: "var(--font-mono, monospace)",
                            fontSize: "11px",
                            color: "var(--text-muted, #94a3b8)",
                            background: "rgba(255, 255, 255, 0.04)",
                            padding: "2px 6px",
                            borderRadius: "4px",
                          }}
                        >
                          {notif.entityType}: {notif.entityId.slice(0, 8)}…
                        </span>
                      )}

                      <time
                        style={{
                          fontFamily: "var(--font-mono, monospace)",
                          fontSize: "11.5px",
                          color: "var(--text-muted, #94a3b8)",
                          marginLeft: "auto",
                        }}
                        title={formatIsoDateTime(notif.createdAt)}
                      >
                        {formatRelativeTime(notif.createdAt)}
                      </time>
                    </div>

                    {/* Title */}
                    <div style={{ marginBottom: "6px" }}>
                      {notif.link ? (
                        <Link
                          href={notif.link}
                          style={{
                            fontSize: "15px",
                            fontWeight: 700,
                            color: "var(--text-primary, #f8fafc)",
                            textDecoration: "none",
                          }}
                          onClick={() => markAsRead(notif.id)}
                        >
                          {notif.title} →
                        </Link>
                      ) : (
                        <h3
                          style={{
                            fontSize: "15px",
                            fontWeight: 700,
                            color: "var(--text-primary, #f8fafc)",
                            margin: 0,
                          }}
                        >
                          {notif.title}
                        </h3>
                      )}
                    </div>

                    {/* Message Body */}
                    <p
                      style={{
                        margin: "0 0 14px",
                        fontSize: "13.5px",
                        color: "var(--text-secondary, #94a3b8)",
                        lineHeight: 1.5,
                        wordBreak: "break-word",
                      }}
                    >
                      {notif.message}
                    </p>

                    {/* Expandable Payload / Supporting Context */}
                    {notif.actionPayload && (
                      <div style={{ marginBottom: "14px" }}>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : notif.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--brand-400, #4abe94)",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            padding: 0,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          {isExpanded ? "▲ Hide Technical Details" : "▼ Show Technical Details"}
                        </button>
                        {isExpanded && (
                          <pre
                            style={{
                              marginTop: "8px",
                              padding: "10px 12px",
                              background: "var(--surface-base, #0f1114)",
                              border: "1px solid var(--border-default, #23272f)",
                              borderRadius: "4px",
                              fontFamily: "var(--font-mono, monospace)",
                              fontSize: "11px",
                              color: "var(--accent-active, #22d3ee)",
                              overflowX: "auto",
                            }}
                          >
                            {JSON.stringify(notif.actionPayload, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Actions Bar */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        flexWrap: "wrap",
                        paddingTop: "12px",
                        borderTop: "1px solid var(--border-default, #23272f)",
                      }}
                    >
                      {notif.actionRequired && !notif.resolvedAt && (
                        <button
                          className="btn btn-sm"
                          disabled={isActionLoading}
                          onClick={() =>
                            handleTriageAction(
                              notif.id,
                              notif.actionType || "REVIEW_INTEGRITY",
                            )
                          }
                          style={{
                            background: "var(--brand-500, #4abe94)",
                            color: "#0a0c0e",
                            fontWeight: 700,
                            minHeight: "36px",
                            padding: "0 14px",
                          }}
                        >
                          {isActionLoading
                            ? "Executing…"
                            : `⚡ Resolve (${notif.actionType?.replace(/_/g, " ") || "Review"})`}
                        </button>
                      )}

                      {notif.link && (
                        <Link
                          href={notif.link}
                          className="btn btn-secondary btn-sm"
                          style={{ minHeight: "36px", textDecoration: "none" }}
                          onClick={() => markAsRead(notif.id)}
                        >
                          Navigate Entity →
                        </Link>
                      )}

                      {!notif.read && (
                        <button
                          onClick={() => markAsRead(notif.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-muted, #94a3b8)",
                            fontSize: "12px",
                            cursor: "pointer",
                            textDecoration: "underline",
                            padding: "4px 8px",
                          }}
                        >
                          Mark as read
                        </button>
                      )}

                      <button
                        onClick={() => dismissAlert(notif.id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted, #94a3b8)",
                          fontSize: "12px",
                          cursor: "pointer",
                          marginLeft: "auto",
                          padding: "4px 8px",
                        }}
                        title="Dismiss alert"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </WorkspaceShell>
  );
}
