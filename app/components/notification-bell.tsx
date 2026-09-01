"use client";

import { useState, useRef, useEffect } from "react";
import { useNotifications, type Notification } from "../notification-context";

const TYPE_DOT: Record<string, string> = {
  success: "notif-dot--success",
  error:   "notif-dot--error",
  warning: "notif-dot--warning",
  info:    "notif-dot--info",
};

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function NotifItem({ n }: { n: Notification }) {
  const { markAsRead, dismiss } = useNotifications();
  return (
    <li className={`notif-item ${n.read ? "notif-item--read" : ""}`}>
      <span
        className={`notif-dot ${TYPE_DOT[n.type] ?? "notif-dot--info"}`}
        aria-hidden="true"
      />
      <div className="notif-item-body">
        {n.link ? (
          <a
            href={n.link}
            className="notif-title"
            onClick={() => markAsRead(n.id)}
          >
            {n.title}
          </a>
        ) : (
          <strong className="notif-title">{n.title}</strong>
        )}
        <p className="notif-message">{n.message}</p>
        <time className="notif-time" dateTime={n.createdAt}>
          {fmtDate(n.createdAt)}
        </time>
      </div>
      <button
        className="notif-dismiss"
        onClick={() => dismiss(n.id)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </li>
  );
}

export default function NotificationBell() {
  const { notifications, unreadCount, markAllAsRead, loading } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button
        className="notif-bell-btn"
        onClick={() => setOpen((p) => !p)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span className="notif-badge" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown" role="dialog" aria-label="Notifications">
          <div className="notif-dropdown-header">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button
                className="notif-mark-all"
                onClick={markAllAsRead}
              >
                Mark all read
              </button>
            )}
          </div>

          {loading ? (
            <p className="notif-empty">Loading…</p>
          ) : notifications.length === 0 ? (
            <p className="notif-empty">No notifications</p>
          ) : (
            <ul className="notif-list">
              {notifications.slice(0, 8).map((n) => (
                <NotifItem key={n.id} n={n} />
              ))}
            </ul>
          )}

          <div className="notif-dropdown-footer">
            <a href="/notifications" onClick={() => setOpen(false)}>
              View all →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
