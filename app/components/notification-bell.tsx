"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useNotifications, type Notification } from "../notification-context";
import { NotificationBellIcon } from "./ui/notification-bell-icon";

// Severity visual tokens matching EviChain government-grade dark palette
const SEVERITY_CONFIG: Record<
  string,
  { label: string; dotColor: string; badgeBg: string; badgeText: string; borderColor: string }
> = {
  CRITICAL: {
    label: "CRITICAL",
    dotColor: "var(--accent-danger, #f43f5e)",
    badgeBg: "rgba(244, 63, 94, 0.15)",
    badgeText: "#f43f5e",
    borderColor: "rgba(244, 63, 94, 0.35)",
  },
  SECURITY: {
    label: "SECURITY",
    dotColor: "var(--accent-danger, #f43f5e)",
    badgeBg: "rgba(168, 85, 247, 0.15)",
    badgeText: "#c084fc",
    borderColor: "rgba(168, 85, 247, 0.35)",
  },
  HIGH: {
    label: "HIGH",
    dotColor: "var(--accent-warning, #fbbf24)",
    badgeBg: "rgba(249, 115, 22, 0.15)",
    badgeText: "#fb923c",
    borderColor: "rgba(249, 115, 22, 0.35)",
  },
  WARNING: {
    label: "WARNING",
    dotColor: "var(--accent-warning, #fbbf24)",
    badgeBg: "rgba(251, 191, 36, 0.12)",
    badgeText: "#fbbf24",
    borderColor: "rgba(251, 191, 36, 0.35)",
  },
  SUCCESS: {
    label: "VERIFIED",
    dotColor: "var(--accent-verified, #b5f542)",
    badgeBg: "rgba(181, 245, 66, 0.12)",
    badgeText: "#b5f542",
    borderColor: "rgba(181, 245, 66, 0.3)",
  },
  INFO: {
    label: "INFO",
    dotColor: "var(--accent-active, #22d3ee)",
    badgeBg: "rgba(34, 211, 238, 0.12)",
    badgeText: "#22d3ee",
    borderColor: "rgba(34, 211, 238, 0.25)",
  },
};

function fmtRelativeTime(iso: string) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
  } catch {
    return "";
  }
}

function AlertBeaconItem({
  n,
  onClose,
}: {
  n: Notification;
  onClose: () => void;
}) {
  const { markAsRead, dismissAlert, executeAction } = useNotifications();
  const sevKey = n.severity || "INFO";
  const conf = SEVERITY_CONFIG[sevKey] || SEVERITY_CONFIG.INFO;

  const handleAction = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (n.actionType) {
      await executeAction(n.id, n.actionType);
    } else {
      await markAsRead(n.id);
    }
    onClose();
  };

  return (
    <li
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "12px 14px",
        borderBottom: "1px solid var(--border-default, #23272f)",
        background: n.read ? "transparent" : "var(--surface-sunken, #0a0c0e)",
        transition: "background var(--transition-fast, 150ms ease)",
        position: "relative",
      }}
    >
      {/* Severity indicator pill */}
      <span
        style={{
          display: "inline-block",
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: conf.dotColor,
          marginTop: "6px",
          flexShrink: 0,
          boxShadow: n.actionRequired ? `0 0 8px ${conf.dotColor}` : "none",
        }}
        aria-hidden="true"
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "10px",
              fontWeight: 700,
              padding: "1px 5px",
              borderRadius: "3px",
              background: conf.badgeBg,
              color: conf.badgeText,
              border: `1px solid ${conf.borderColor}`,
              letterSpacing: "0.04em",
            }}
          >
            {conf.label}
          </span>
          {n.actionRequired && !n.resolvedAt && (
            <span
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "10px",
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: "3px",
                background: "rgba(251, 191, 36, 0.15)",
                color: "#fbbf24",
                border: "1px solid rgba(251, 191, 36, 0.35)",
              }}
            >
              ACTION REQUIRED
            </span>
          )}
          <time
            style={{
              fontSize: "10.5px",
              color: "var(--text-muted, #94a3b8)",
              fontFamily: "var(--font-mono, monospace)",
              marginLeft: "auto",
            }}
          >
            {fmtRelativeTime(n.createdAt)}
          </time>
        </div>

        {n.link ? (
          <Link
            href={n.link}
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--text-primary, #f8fafc)",
              textDecoration: "none",
              marginBottom: "3px",
            }}
            onClick={() => {
              markAsRead(n.id);
              onClose();
            }}
          >
            {n.title}
          </Link>
        ) : (
          <strong style={{ display: "block", fontSize: "13px", color: "var(--text-primary, #f8fafc)", marginBottom: "3px" }}>
            {n.title}
          </strong>
        )}

        <p style={{ margin: "0 0 6px", fontSize: "12px", color: "var(--text-secondary, #94a3b8)", lineHeight: 1.4, wordBreak: "break-word" }}>
          {n.message}
        </p>

        {/* Quick Triage Buttons */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
          {n.actionRequired && !n.resolvedAt && (
            <button
              onClick={handleAction}
              style={{
                background: "var(--surface-raised, #181b20)",
                border: `1px solid ${conf.borderColor}`,
                color: conf.badgeText,
                fontSize: "11px",
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              ⚡ {n.actionType?.replace(/_/g, " ") || "Review"}
            </button>
          )}

          {!n.read && (
            <button
              onClick={() => markAsRead(n.id)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted, #94a3b8)",
                fontSize: "11px",
                cursor: "pointer",
                padding: "2px 4px",
                textDecoration: "underline",
              }}
            >
              Mark read
            </button>
          )}

          <button
            onClick={() => dismissAlert(n.id)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted, #94a3b8)",
              fontSize: "11px",
              cursor: "pointer",
              marginLeft: "auto",
              padding: "2px 4px",
            }}
            title="Dismiss from quick feed"
          >
            Dismiss
          </button>
        </div>
      </div>
    </li>
  );
}

export default function NotificationBell() {
  const {
    notifications,
    unreadCount,
    actionRequiredCount,
    highestUnreadSeverity,
    markAllAsRead,
    loading,
    refresh,
  } = useNotifications();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, handleKeyDown]);

  const displayCount = unreadCount > 99 ? "99+" : String(unreadCount);

  // Determine beacon dot color and animation
  const isCritical = highestUnreadSeverity === "CRITICAL" || highestUnreadSeverity === "SECURITY";
  const hasAction = actionRequiredCount > 0;
  const bellState: "default" | "unread" | "action-required" | "critical" = isCritical
    ? "critical"
    : hasAction
    ? "action-required"
    : unreadCount > 0
    ? "unread"
    : "default";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) refresh();
        }}
        aria-label="Open investigation alerts"
        aria-expanded={open}
        aria-haspopup="true"
        title="Open Investigation Alerts"
        className="alert-beacon-btn"
        style={{
          background: "transparent",
          border: "1px solid var(--border-default, #23272f)",
          borderRadius: "var(--radius-md, 6px)",
          color: "var(--text-secondary, #94a3b8)",
          width: "44px",
          height: "44px",
          minWidth: "44px",
          minHeight: "44px",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          position: "relative",
          transition: "all var(--transition-fast, 150ms ease)",
        }}
      >
        {/* Standard recognizable bell icon */}
        <NotificationBellIcon
          size={20}
          state={bellState}
          decorative={true}
        />

        {/* Pulse / Badge indicator */}
        {unreadCount > 0 && (
          <span
            className={isCritical ? "critical-alert-pulse" : undefined}
            style={{
              position: "absolute",
              top: "2px",
              right: "2px",
              background: isCritical
                ? "var(--accent-danger, #f43f5e)"
                : hasAction
                ? "var(--accent-warning, #fbbf24)"
                : "var(--brand-500, #4abe94)",
              color: isCritical ? "#ffffff" : "#0a0c0e",
              borderRadius: "10px",
              fontSize: "10px",
              fontWeight: 800,
              fontFamily: "var(--font-mono, monospace)",
              padding: "1px 5px",
              lineHeight: 1.2,
              minWidth: "16px",
              textAlign: "center",
              boxShadow: isCritical
                ? "0 0 10px rgba(244, 63, 94, 0.7)"
                : hasAction
                ? "0 0 8px rgba(251, 191, 36, 0.5)"
                : "none",
            }}
          >
            {displayCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      {open && (
        <div
          role="dialog"
          aria-label="Investigation Alerts Feed"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "360px",
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "480px",
            background: "var(--surface-overlay, #181b20)",
            border: "1px solid var(--border-default, #23272f)",
            borderRadius: "var(--radius-lg, 8px)",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.6)",
            display: "flex",
            flexDirection: "column",
            zIndex: 1000,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border-default, #23272f)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--surface-raised, #181b20)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: isCritical
                    ? "var(--accent-danger, #f43f5e)"
                    : hasAction
                    ? "var(--accent-warning, #fbbf24)"
                    : "var(--brand-500, #4abe94)",
                }}
              />
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary, #f8fafc)" }}>
                Investigation Alerts
              </span>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted, #94a3b8)",
                    fontSize: "11px",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted, #94a3b8)",
                  fontSize: "16px",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
                aria-label="Close alerts popover"
              >
                ×
              </button>
            </div>
          </div>

          {/* Alert List */}
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              overflowY: "auto",
              flex: 1,
            }}
          >
            {loading && notifications.length === 0 ? (
              <li style={{ padding: "24px", textAlign: "center", color: "var(--text-muted, #94a3b8)", fontSize: "12px" }}>
                Scanning alert channels…
              </li>
            ) : notifications.length === 0 ? (
              <li style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-muted, #94a3b8)", fontSize: "12px" }}>
                <span style={{ display: "block", fontSize: "20px", marginBottom: "8px" }}>✓</span>
                All clear — no active alerts or integrity notices.
              </li>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <AlertBeaconItem key={n.id} n={n} onClose={() => setOpen(false)} />
              ))
            )}
          </ul>

          {/* Footer */}
          <div
            style={{
              padding: "10px 16px",
              borderTop: "1px solid var(--border-default, #23272f)",
              background: "var(--surface-sunken, #0a0c0e)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "11px", color: "var(--text-muted, #94a3b8)", fontFamily: "var(--font-mono, monospace)" }}>
              {actionRequiredCount > 0 ? `${actionRequiredCount} Action Required` : "Live Feed Active"}
            </span>
            <Link
              href="/notifications"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--brand-400, #4abe94)",
                textDecoration: "none",
              }}
              onClick={() => setOpen(false)}
            >
              Investigation Alert Center →
            </Link>
          </div>
        </div>
      )}

      {/* Reduced-motion & pulsating keyframes */}
      <style jsx global>{`
        @keyframes alert-pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.7);
          }
          70% {
            box-shadow: 0 0 0 6px rgba(244, 63, 94, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(244, 63, 94, 0);
          }
        }
        .alert-beacon-btn:hover {
          color: var(--text-primary, #f8fafc) !important;
          border-color: var(--border-hover, #3d4350) !important;
          background: var(--surface-raised, #181b20) !important;
        }
        .alert-beacon-btn:focus-visible {
          outline: 2px solid var(--brand-500, #4abe94) !important;
          outline-offset: 2px !important;
        }
        .critical-alert-pulse {
          animation: alert-pulse 2s infinite cubic-bezier(0.66, 0, 0, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          .critical-alert-pulse {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
