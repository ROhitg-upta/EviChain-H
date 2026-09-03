"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "../auth-context";
import { useNotifications, type Notification } from "../notification-context";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  CASE_CREATED:              { label: "CASE CREATED",     color: "var(--brand-400)",      bg: "var(--brand-900)" },
  CASE_UPDATED:              { label: "CASE UPDATED",     color: "var(--brand-400)",      bg: "var(--brand-900)" },
  EVIDENCE_UPLOADED:         { label: "EVIDENCE UPLOAD",  color: "var(--accent-active)",  bg: "var(--accent-active-dim)" },
  CUSTODY_TRANSFER_RECEIVED: { label: "CUSTODY TRANSFER", color: "var(--accent-warning)", bg: "var(--accent-warning-dim)" },
  CUSTODY_TRANSFER_COMPLETED:{ label: "CUSTODY COMPLETE", color: "var(--accent-warning)", bg: "var(--accent-warning-dim)" },
  INTEGRITY_ALERT:           { label: "INTEGRITY ALERT",  color: "var(--accent-danger)",  bg: "var(--accent-danger-dim)" },
  SECURITY_EVENT:            { label: "SECURITY NOTICE",  color: "var(--accent-danger)",  bg: "var(--accent-danger-dim)" },
  transfer:                  { label: "CUSTODY TRANSFER", color: "var(--accent-warning)", bg: "var(--accent-warning-dim)" },
  success:                   { label: "SUCCESS",          color: "var(--accent-active)",  bg: "var(--accent-active-dim)" },
  warning:                   { label: "WARNING",          color: "var(--accent-warning)", bg: "var(--accent-warning-dim)" },
  error:                     { label: "ERROR",            color: "var(--accent-danger)",  bg: "var(--accent-danger-dim)" },
  info:                      { label: "INFO",             color: "var(--accent-info)",    bg: "var(--accent-info-dim)" },
};

function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtRelative(iso: string) {
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
  const { user, loading: authLoading } = useAuth();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    dismiss,
    loading,
    refresh,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<"ALL" | "UNREAD" | "CUSTODY" | "EVIDENCE" | "CASES" | "SECURITY">("ALL");

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (activeTab === "UNREAD") return !n.read;
      if (activeTab === "CUSTODY") {
        return n.type.includes("CUSTODY") || n.type === "transfer";
      }
      if (activeTab === "EVIDENCE") {
        return n.type.includes("EVIDENCE");
      }
      if (activeTab === "CASES") {
        return n.type.includes("CASE");
      }
      if (activeTab === "SECURITY") {
        return n.type.includes("SECURITY") || n.type.includes("INTEGRITY") || n.type === "error" || n.type === "warning";
      }
      return true;
    });
  }, [notifications, activeTab]);

  if (authLoading) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Notifications" }]}>
        <div style={{ padding: "32px" }}>
          <div className="skeleton" style={{ height: "40px", width: "240px", marginBottom: "20px" }} />
          <div className="skeleton" style={{ height: "200px", width: "100%" }} />
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell breadcrumbs={[{ label: "Notifications" }]}>
      <div style={{ padding: "28px", maxWidth: "1200px", margin: "0 auto" }}>
        
        {/* Header */}
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
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--brand-400)", textTransform: "uppercase" }}>
                SEC-ALERT DISPATCH
              </span>
            </div>
            <h1 style={{ fontSize: "26px", fontWeight: 800, color: "var(--text-primary)", margin: 0, letterSpacing: "var(--tracking-tight)" }}>
              Notification Center
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--text-secondary)" }}>
              {unreadCount > 0
                ? `You have ${unreadCount} unread system alert${unreadCount !== 1 ? "s" : ""}.`
                : "All caught up. No pending unread notifications."}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              className="btn btn-secondary btn-md"
              onClick={() => refresh()}
              disabled={loading}
              title="Refresh notifications"
            >
              ↻ Refresh
            </button>
            {unreadCount > 0 && (
              <button
                className="btn btn-primary btn-md"
                onClick={markAllAsRead}
              >
                ✓ Mark all as read
              </button>
            )}
          </div>
        </div>

        {/* Tab Filters */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "20px",
            borderBottom: "1px solid var(--border-default)",
            paddingBottom: "8px",
            overflowX: "auto",
          }}
        >
          {(
            [
              { key: "ALL", label: "All Activity" },
              { key: "UNREAD", label: `Unread (${unreadCount})` },
              { key: "CUSTODY", label: "Custody Transfers" },
              { key: "EVIDENCE", label: "Evidence" },
              { key: "CASES", label: "Cases" },
              { key: "SECURITY", label: "Security & Alerts" },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  background: isActive ? "var(--surface-raised)" : "transparent",
                  border: isActive ? "1px solid var(--border-default)" : "1px solid transparent",
                  borderRadius: "6px",
                  padding: "6px 14px",
                  fontSize: "13px",
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "var(--brand-400)" : "var(--text-secondary)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all var(--transition-fast)",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* List Panel */}
        <div
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border-default)",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          {loading ? (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)" }}>
              <div className="skeleton" style={{ height: "24px", width: "180px", margin: "0 auto 12px" }} />
              <div className="skeleton" style={{ height: "16px", width: "320px", margin: "0 auto" }} />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div style={{ padding: "54px 24px", textAlign: "center" }}>
              <div style={{ fontSize: "32px", marginBottom: "10px" }}>🔔</div>
              <strong style={{ display: "block", color: "var(--text-primary)", fontSize: "16px", marginBottom: "4px" }}>
                No notifications in this category
              </strong>
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "13px" }}>
                Activity and custody alerts will appear here as they occur.
              </p>
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {filteredNotifications.map((n) => {
                const conf = TYPE_CONFIG[n.type] || {
                  label: n.type.toUpperCase(),
                  color: "var(--text-secondary)",
                  bg: "var(--surface-sunken)",
                };

                return (
                  <li
                    key={n.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "16px",
                      padding: "16px 20px",
                      borderBottom: "1px solid var(--border-default)",
                      background: n.read ? "transparent" : "var(--surface-sunken)",
                      transition: "background var(--transition-fast)",
                    }}
                    className="table-row-hover"
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "10px",
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          color: conf.color,
                          background: conf.bg,
                          border: `1px solid ${conf.color}33`,
                          flexShrink: 0,
                          marginTop: "2px",
                        }}
                      >
                        {conf.label}
                      </span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                          {n.link ? (
                            <Link
                              href={n.link}
                              style={{
                                color: "var(--text-primary)",
                                fontSize: "14px",
                                fontWeight: 700,
                                textDecoration: "none",
                              }}
                              onClick={() => markAsRead(n.id)}
                            >
                              {n.title} ↗
                            </Link>
                          ) : (
                            <strong style={{ color: "var(--text-primary)", fontSize: "14px" }}>
                              {n.title}
                            </strong>
                          )}
                          {!n.read && (
                            <span
                              style={{
                                width: "6px",
                                height: "6px",
                                borderRadius: "50%",
                                background: "var(--brand-400)",
                                display: "inline-block",
                              }}
                              title="Unread"
                            />
                          )}
                        </div>

                        <p style={{ margin: "0 0 6px", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                          {n.message}
                        </p>

                        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11px", color: "var(--text-disabled)", fontFamily: "var(--font-mono)" }}>
                          <span>{fmtDate(n.createdAt)}</span>
                          <span>•</span>
                          <span>{fmtRelative(n.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      {!n.read && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => markAsRead(n.id)}
                          style={{ fontSize: "12px", padding: "4px 8px" }}
                          title="Mark as read"
                        >
                          Mark read
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => dismiss(n.id)}
                        style={{ fontSize: "12px", padding: "4px 8px", color: "var(--text-disabled)" }}
                        title="Dismiss notification"
                      >
                        Dismiss
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

      </div>
    </WorkspaceShell>
  );
}
