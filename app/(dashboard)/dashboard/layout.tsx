"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../auth-context";

const NAV_ITEMS = [
  { href: "/",               icon: "⊞", label: "Dashboard"     },
  { href: "/evidence",       icon: "◈", label: "Evidence"      },
  { href: "/cases",          icon: "▣", label: "Cases"         },
  { href: "/audit",          icon: "≡", label: "Audit logs"    },
  { href: "/reports",        icon: "↗", label: "Reports"       },
  { href: "/verify",         icon: "✓", label: "Verify"        },
  { href: "/notifications",  icon: "◉", label: "Notifications" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const pathname = usePathname() ?? "/";

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <div className="dash-root">
      <aside className="dash-sidebar" aria-label="Sidebar navigation">
        <div className="dash-sidebar-top">
          <Link href="/" className="dash-logo" aria-label="EviChain home">
            <span className="brand-mark" aria-hidden="true">E</span>
            <span className="dash-logo-name">EviChain</span>
          </Link>

          <nav className="dash-nav" aria-label="Main navigation">
            {NAV_ITEMS.map(({ href, icon, label }) => (
              <Link
                key={href}
                href={href}
                className={`dash-nav-item${isActive(href) ? " dash-nav-item--active" : ""}`}
                aria-current={isActive(href) ? "page" : undefined}
                aria-label={label}
              >
                <span className="dash-nav-icon" aria-hidden="true">{icon}</span>
                <span className="dash-nav-label">{label}</span>
              </Link>
            ))}

            {/* Admin link — role is now title-case after normaliseRole() fix */}
            {user?.role === "Administrator" && (
              <Link
                href="/admin"
                className={`dash-nav-item${isActive("/admin") ? " dash-nav-item--active" : ""}`}
                aria-current={isActive("/admin") ? "page" : undefined}
                aria-label="Admin"
              >
                <span className="dash-nav-icon" aria-hidden="true">⚙</span>
                <span className="dash-nav-label">Admin</span>
              </Link>
            )}
          </nav>
        </div>

        {user && (
          <div className="dash-sidebar-footer">
            <Link
              href="/profile"
              className="dash-user-link"
              aria-label={`Go to profile — ${user.name}`}
            >
              <div className="dash-user-avatar" aria-hidden="true">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="dash-user-info">
                <span className="dash-user-name">{user.name}</span>
                <span className="dash-user-role">{user.role}</span>
              </div>
              <span className="dash-user-arrow" aria-hidden="true">→</span>
            </Link>
            <button
              className="dash-signout"
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
            >
              ⏻
            </button>
          </div>
        )}
      </aside>

      <main className="dash-content">{children}</main>
    </div>
  );
}
