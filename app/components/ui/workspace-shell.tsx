"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/auth-context";
import { WORKSPACE_NAV, MOBILE_NAV, type NavItem } from "@/lib/navigation";
import NotificationBell from "@/app/components/notification-bell";

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

  /* Auth guard — redirect if not authenticated */
  useEffect(() => {
    if (!loading && !user) window.location.replace("/login");
  }, [loading, user]);

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
        {/* Brand */}
        <div className="ws-sidebar-top">
          <Link href="/" className="ws-brand" aria-label="EviChain home">
            <span className="ws-brand-mark" aria-hidden="true">E</span>
            <span className="ws-brand-name">EviChain</span>
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
        {/* Top header bar */}
        <header className="ws-topbar">
          {/* Breadcrumbs */}
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

          {/* Right side */}
          <div className="ws-topbar-right">
            <div className="ws-secure-status" aria-label="System status: secure">
              <span className="ws-status-dot" aria-hidden="true" />
              <span>Secure</span>
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

      {/* ── Mobile bottom nav ──────────────────────────────────────── */}
      <nav className="ws-mobile-nav" aria-label="Mobile navigation">
        {MOBILE_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`ws-mobile-item${isActive(pathname, item.href) ? " ws-mobile-item--active" : ""}`}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
          >
            <span className="ws-mobile-icon" aria-hidden="true">{item.icon}</span>
            <span className="ws-mobile-label">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
