"use client";

import { useEffect } from "react";
import { useAuth } from "../auth-context";
import { useNotifications } from "../notification-context";

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
    if (!authLoading && !user) window.location.replace("/login");
  }, [authLoading, user]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (authLoading) {
    return <main className="cases-shell"><p className="cases-loading">Loading…</p></main>;
  }

  return (
    <main className="cases-shell">
      <header className="ev-topbar">
        <a className="ev-brand" href="/">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span><strong>EviChain</strong><small>Notifications</small></span>
        </a>
        <nav className="ev-nav">
          <a href="/">← Dashboard</a>
          {user && (
            <span className="ev-user-badge">
              <span className="operator" aria-hidden="true">{user.initials}</span>
              <span>{user.name}</span>
            </span>
          )}
        </nav>
      </header>

      <div className="page-header">
        <div>
          <p className="eyebrow">ACTIVITY FEED</p>
          <h1>Notifications</h1>
          <p className="ev-page-sub">
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

      <div className="panel" style={{ overflow: "hidden" }}>
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
    </main>
  );
}
