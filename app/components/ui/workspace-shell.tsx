"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/auth-context";
import { WORKSPACE_NAV, type NavItem } from "@/lib/navigation";
import NotificationBell from "@/app/components/notification-bell";
import ConnectivityBanner from "./connectivity-banner";
import OfflineQueuePanel from "./offline-queue-panel";
import EvidenceCaptureSheet from "./evidence-capture-sheet";
import MobileBottomNav from "./mobile-bottom-nav";
import { getOfflineDrafts } from "@/lib/offline-queue";
import { getWorkspaceConfig, type WorkspaceConfig } from "@/lib/api";

/* ── Helpers ───────────────────────────────────────────────────────── */

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

/* ── Types ─────────────────────────────────────────────────────────── */

type Breadcrumb = { label: string; href?: string };

type WorkspaceShellProps = {
  children: ReactNode;
  /** Page-level breadcrumbs (workspace root is always first). */
  breadcrumbs?: Breadcrumb[];
};

/* ── Component ─────────────────────────────────────────────────────── */

export default function WorkspaceShell({ children, breadcrumbs }: WorkspaceShellProps) {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname() ?? "/";

  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [pendingDraftsCount, setPendingDraftsCount] = useState(0);
  const [wsConfig, setWsConfig] = useState<WorkspaceConfig | null>(null);

  /* Auth guard — redirect if not authenticated */
  useEffect(() => {
    if (!loading && !user) window.location.replace("/login");
  }, [loading, user]);

  /* Load workspace config */
  useEffect(() => {
    getWorkspaceConfig()
      .then(setWsConfig)
      .catch(() => {});
  }, []);

  /* Check offline drafts count */
  useEffect(() => {
    if (!user) return;
    const checkCount = async () => {
      try {
        const drafts = await getOfflineDrafts(user.id);
        setPendingDraftsCount(drafts.filter((d) => d.status !== "SYNCED").length);
      } catch {
        // IDB error fallback
      }
    };
    checkCount();
    const interval = setInterval(checkCount, 6000);
    return () => clearInterval(interval);
  }, [user]);

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--surface-base)",
        color: "var(--text-secondary)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-sm)",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 36, height: 36, margin: "0 auto 12px",
            background: "var(--brand-600)", borderRadius: "var(--radius-md)",
            display: "grid", placeItems: "center",
            color: "var(--neutral-50)", fontWeight: 800, fontSize: 18,
          }}>E</div>
          Initializing workspace…
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="ws-root">
      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside className="ws-sidebar" aria-label="Workspace navigation">
        {/* Brand & Agency Context */}
        <div className="ws-sidebar-top">
          <Link href="/" className="ws-brand" aria-label="EviChain home">
            <span className="ws-brand-mark" aria-hidden="true">E</span>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span className="ws-brand-name">EviChain</span>
              {wsConfig?.organizationName && wsConfig.organizationName !== "EviChain Secure Workspace" && (
                <span style={{ fontSize: "10px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>
                  {wsConfig.organizationName}
                </span>
              )}
            </div>
          </Link>

          {/* Navigation sections */}
          <nav className="ws-nav" aria-label="Main navigation">
            {WORKSPACE_NAV.map((section, si) => (
              <div key={si} className="ws-nav-section">
                {section.title && (
                  <span className="ws-nav-section-title">{section.title}</span>
                )}
                {section.items
                  .filter((item: NavItem) => !item.roles || item.roles.includes(user.role))
                  .map((item: NavItem) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`ws-nav-item${isActive(pathname, item.href) ? " ws-nav-item--active" : ""}`}
                      aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    >
                      <span className="ws-nav-icon" aria-hidden="true">{item.icon}</span>
                      <span className="ws-nav-label">{item.label}</span>
                    </Link>
                  ))}
              </div>
            ))}
          </nav>
        </div>

        {/* User footer */}
        <div className="ws-sidebar-footer">
          <Link href="/profile" className="ws-user" aria-label={`Profile — ${user.name}`}>
            <div className="ws-user-avatar" aria-hidden="true">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="ws-user-info">
              <span className="ws-user-name">{user.name}</span>
              <span className="ws-user-role">{user.role}</span>
            </div>
          </Link>
          <button
            className="ws-signout"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
          >
            ⏻
          </button>
        </div>
      </aside>

      {/* ── Main content area ──────────────────────────────────────── */}
      <div className="ws-main">
        {/* Connectivity Strip */}
        <ConnectivityBanner onOpenQueue={() => setIsQueueOpen(true)} />

        {/* Top header bar */}
        <header className="ws-topbar">
          {/* Breadcrumbs & Security Classification Banner */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
            <nav className="ws-breadcrumbs" aria-label="Breadcrumbs">
              <Link href="/dashboard" className="ws-breadcrumb-link">Workspace</Link>
              {breadcrumbs?.map((bc, i) => (
                <span key={i} className="ws-breadcrumb-item">
                  <span className="ws-breadcrumb-sep" aria-hidden="true">/</span>
                  {bc.href ? (
                    <Link href={bc.href} className="ws-breadcrumb-link">{bc.label}</Link>
                  ) : (
                    <span className="ws-breadcrumb-current" aria-current="page">{bc.label}</span>
                  )}
                </span>
              ))}
            </nav>

            {/* Classification Badge */}
            <span
              style={{
                fontSize: "10px",
                fontFamily: "var(--font-mono, monospace)",
                fontWeight: 700,
                letterSpacing: "0.06em",
                padding: "2px 8px",
                borderRadius: "3px",
                background: "rgba(234, 179, 8, 0.12)",
                color: "#eab308",
                border: "1px solid rgba(234, 179, 8, 0.3)",
                textTransform: "uppercase",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
              title="Official Agency Security Classification Level"
            >
              🔒 {wsConfig?.classificationLabel || "AUTHORIZED ACCESS ONLY"}
            </span>
          </div>

          {/* Right side */}
          <div className="ws-topbar-right">
            {pendingDraftsCount > 0 && (
              <button
                onClick={() => setIsQueueOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-amber-300 text-xs font-semibold border border-amber-500/30 transition-colors cursor-pointer"
                title="View offline evidence drafts"
              >
                <span>Offline Vault ({pendingDraftsCount})</span>
              </button>
            )}
            <div className="ws-secure-status" aria-label="System status: secure" title="Cryptographic Ledger Integrity: Verified">
              <span className="ws-status-dot" aria-hidden="true" />
              <span>Operational</span>
            </div>
            <NotificationBell />
            <Link href="/profile" className="ws-topbar-avatar" aria-label="Profile">
              {user.initials}
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="ws-content">
          {children}
        </main>
      </div>

      {/* ── Mobile Bottom Navigation with Center Capture CTA ────────── */}
      <MobileBottomNav
        onOpenCapture={() => setIsCaptureOpen(true)}
        onOpenOfflineQueue={() => setIsQueueOpen(true)}
        pendingOfflineCount={pendingDraftsCount}
      />

      {/* ── Modals / Drawers ───────────────────────────────────────── */}
      <OfflineQueuePanel
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
      />

      <EvidenceCaptureSheet
        isOpen={isCaptureOpen}
        onClose={() => setIsCaptureOpen(false)}
      />
    </div>
  );
}
