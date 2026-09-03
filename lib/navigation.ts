/**
 * EviChain — Canonical Navigation Configuration
 * Single source of truth for all navigation across the workspace.
 */

export type NavItem = {
  label: string;
  href: string;
  icon: string;       // emoji/text icon for compact rail
  /** Restrict visibility to these roles. Omit for all authenticated users. */
  roles?: string[];
  /** Badge count key for dynamic counts (e.g., notification count). */
  badgeKey?: string;
};

export type NavSection = {
  title?: string;
  items: NavItem[];
};

export const WORKSPACE_NAV: NavSection[] = [
  {
    items: [
      { label: "Dashboard",     href: "/dashboard",     icon: "◈" },
      { label: "Cases",         href: "/cases",         icon: "◫" },
      { label: "Evidence",      href: "/evidence",      icon: "◉" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Audit Logs",    href: "/audit",         icon: "▤" },
      { label: "Reports",       href: "/reports",       icon: "▥" },
      { label: "Notifications", href: "/notifications", icon: "◎", badgeKey: "notifications" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Users",         href: "/admin/users",    icon: "◬", roles: ["Administrator"] },
      { label: "Settings",      href: "/admin/settings", icon: "⚙", roles: ["Administrator"] },
    ],
  },
];

export const MOBILE_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "◈" },
  { label: "Cases",     href: "/cases",     icon: "◫" },
  { label: "Evidence",  href: "/evidence",  icon: "◉" },
  { label: "Audit",     href: "/audit",     icon: "▤" },
  { label: "More",      href: "/profile",   icon: "⋯" },
];

/** Public nav links for the landing page header. */
export const PUBLIC_NAV = [
  { label: "Features",       href: "#features" },
  { label: "How it works",   href: "#how" },
  { label: "Security",       href: "#security" },
  { label: "Verify evidence", href: "/verify" },
];
