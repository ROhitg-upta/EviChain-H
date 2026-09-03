"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useNotifications, type Notification } from "../notification-context";

const TYPE_DOT: Record<string, { color: string; label: string }> = {
  CASE_CREATED:              { color: "var(--brand-400)",      label: "CASE" },
  CASE_UPDATED:              { color: "var(--brand-400)",      label: "CASE" },
  EVIDENCE_UPLOADED:         { color: "var(--accent-active)",  label: "EVIDENCE" },
  CUSTODY_TRANSFER_RECEIVED: { color: "var(--accent-warning)", label: "CUSTODY" },
  CUSTODY_TRANSFER_COMPLETED:{ color: "var(--accent-warning)", label: "CUSTODY" },
  INTEGRITY_ALERT:           { color: "var(--accent-danger)",  label: "ALERT" },
  SECURITY_EVENT:            { color: "var(--accent-danger)",  label: "SECURITY" },
  success:                   { color: "var(--accent-active)",  label: "OK" },
  warning:                   { color: "var(--accent-warning)", label: "WARN" },
  error:                     { color: "var(--accent-danger)",  label: "ERR" },
  info:                      { color: "var(--accent-info)",    label: "INFO" },
  transfer:                  { color: "var(--accent-warning)", label: "CUSTODY" },
};

function fmtDate(iso: string) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function NotifItem({ n, onClose }: { n: Notification; onClose: () => void }) {
  const { markAsRead, dismiss } = useNotifications();
  const meta = TYPE_DOT[n.type] || { color: "var(--text-secondary)", label: "NOTE" };

  return (
    <li
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "10px 14px",
        borderBottom: "1px solid var(--border-default)",
        background: n.read ? "transparent" : "var(--surface-sunken)",
        transition: "background var(--transition-fast)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: meta.color,
          marginTop: "6px",
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {n.link ? (
          <Link
            href={n.link}
            style={{
              display: "block",
              fontSize: "12.5px",
              fontWeight: 700,
              color: "var(--text-primary)",
              textDecoration: "none",
              marginBottom: "2px",
            }}
            onClick={() => {
              markAsRead(n.id);
              onClose();
            }}
          >
            {n.title}
          </Link>
        ) : (
          <strong style={{ display: "block", fontSize: "12.5px", color: "var(--text-primary)", marginBottom: "2px" }}>
            {n.title}
          </strong>
        )}
        <p style={{ margin: "0 0 4px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.35, wordBreak: "break-word" }}>
          {n.message}
        </p>
        <time style={{ fontSize: "10.5px", color: "var(--text-disabled)", fontFamily: "var(--font-mono)" }}>
          {fmtDate(n.createdAt)}
        </time>
      </div>
      <button
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-disabled)",
          fontSize: "14px",
          cursor: "pointer",
          padding: "2px 4px",
          lineHeight: 1,
        }}
        onClick={(e) => {
          e.stopPropagation();
          dismiss(n.id);
        }}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </li>
  );
}

export default function NotificationBell() {
  const { notifications, unreadCount, markAllAsRead, loading } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
    <div className="notif-bell-wrap" ref={ref} style={{ position: "relative" }}>
      <button
        className="notif-bell-btn"
        onClick={() => setOpen((p) => !p)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        style={{
          background: "var(--surface-raised)",
          border: "1px solid var(--border-default)",
          borderRadius: "6px",
          padding: "6px 10px",
          color: "var(--text-primary)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          position: "relative",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: "14px" }}>🔔</span>
        {unreadCount > 0 && (
          <span
            style={{
              background: "var(--brand-500)",
              color: "#000",
              fontSize: "10.5px",
              fontWeight: 800,
              padding: "1px 5px",
              borderRadius: "10px",
              fontFamily: "var(--font-mono)",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "360px",
            maxHeight: "440px",
            background: "var(--surface-raised)",
            border: "1px solid var(--border-default)",
            borderRadius: "8px",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.5)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--border-default)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--surface-sunken)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>Notifications</strong>
              {unreadCount > 0 && (
                <span style={{ fontSize: "11px", color: "var(--brand-400)", fontFamily: "var(--font-mono)" }}>
                  ({unreadCount} unread)
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--brand-400)",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "2px 4px",
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: "auto", flex: 1, maxHeight: "320px" }}>
            {loading ? (
              <p style={{ padding: "24px", textAlign: "center", color: "var(--text-disabled)", fontSize: "12px" }}>
                Loading updates…
              </p>
            ) : notifications.length === 0 ? (
              <p style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-secondary)", fontSize: "12.5px" }}>
                No notifications yet.
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {notifications.slice(0, 8).map((n) => (
                  <NotifItem key={n.id} n={n} onClose={() => setOpen(false)} />
                ))}
              </ul>
            )}
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid var(--border-default)",
              background: "var(--surface-sunken)",
              textAlign: "center",
            }}
          >
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--brand-400)",
                textDecoration: "none",
              }}
            >
              Open Notification Center →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
