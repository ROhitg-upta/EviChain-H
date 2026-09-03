"use client";

import { useEffect } from "react";
import { useAuth } from "../auth-context";
import { useNotifications } from "../notification-context";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

const TYPE_CLASS: Record<string, string> = {
  success: "case-status--active",
  warning: "case-status--review",
  error:   "case-status--archived",
  info:    "case-status--closed",
};

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const { notifications, unreadCount, markAllAsRead, dismiss, loading, refresh } =
    useNotifications();

  

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (authLoading) {
    return <WorkspaceShell breadcrumbs={[{ label: 'Notifications' }]}>
<div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}><p className="cases-loading">Loading…</p></div>
</WorkspaceShell>;
  }

  return (
    <WorkspaceShell breadcrumbs={[{ label: 'Notifications' }]}>
<div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}>
      

      <div className="page-header" style={{ marginBottom: "24px" }}>
        <div>
          <p className="eyebrow" style={{ color: "var(--text-disabled)", fontFamily: "var(--font-mono)", fontSize: "12px", textTransform: "uppercase" }}>ACTIVITY FEED</p>
          <h1 style={{ color: "var(--text-primary)", fontSize: "24px", margin: "8px 0" }}>Notifications</h1>
          <p className="ev-page-sub" style={{ color: "var(--text-secondary)" }}>
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
              : "All caught up."}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            className="button button-secondary"
            onClick={markAllAsRead}
          >
            Mark all as read
          </button>
        )}
      </div>

      <div className="panel" style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "16px", overflow: "hidden" }}>
        {loading ? (
          <p className="audit-loading" role="status">Loading notifications…</p>
        ) : notifications.length === 0 ? (
          <div className="ev-empty-state">
            <strong>No notifications yet.</strong>
            <p>Activity events will appear here as you use EviChain.</p>
          </div>
        ) : (
          <ul className="notif-full-list" aria-label="All notifications">
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`notif-full-item ${n.read ? "notif-full-item--read" : ""}`}
              >
                <div className="notif-full-left">
                  <span
                    className={`case-status-badge ${TYPE_CLASS[n.type] ?? "case-status--closed"}`}
                    aria-label={n.type}
                  >
                    {n.type}
                  </span>
                </div>

                <div className="notif-full-body">
                  {n.link ? (
                    <a href={n.link} className="notif-full-title">
                      {n.title}
                    </a>
                  ) : (
                    <strong className="notif-full-title">{n.title}</strong>
                  )}
                  <p className="notif-full-message">{n.message}</p>
                  <time className="notif-full-time" dateTime={n.createdAt}>
                    {fmtDate(n.createdAt)}
                  </time>
                </div>

                <div className="notif-full-actions">
                  {!n.read && (
                    <span className="notif-unread-dot" aria-label="Unread" />
                  )}
                  <button
                    className="button button-secondary small-button"
                    onClick={() => dismiss(n.id)}
                    aria-label="Dismiss notification"
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
</WorkspaceShell>
  );
}
