"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../auth-context";
import InstallPWAPrompt from "../components/install-pwa-prompt";

export default function MobileLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  if (!user) {
    return (
      <div className="mobile-shell">
        <div className="mobile-auth-notice">
          <div className="brand-mark" style={{ margin: "0 auto 16px" }}>E</div>
          <h1>Sign in required</h1>
          <p>Sign in to access EviChain on mobile</p>
          <a className="btn btn-primary btn-lg" href="/login">Sign in</a>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-shell">
      <InstallPWAPrompt />

      {!isOnline && (
        <div className="offline-banner" role="status">
          <span aria-hidden="true">◌</span>
          <span>You&apos;re offline — some features may be limited.</span>
        </div>
      )}

      <header className="mobile-header">
        <div className="mobile-header-brand">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>EviChain</span>
        </div>
        <a href="/evidence/new" className="mobile-header-action" aria-label="Upload evidence">↑</a>
      </header>

      <main className="mobile-content">{children}</main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {[
          { href: "/",          icon: "⊞", label: "Home"     },
          { href: "/evidence",  icon: "◈", label: "Evidence" },
          { href: "/cases",     icon: "▣", label: "Cases"    },
          { href: "/profile",   icon: "○", label: "Profile"  },
        ].map(({ href, icon, label }) => (
          <a key={href} href={href} className="nav-item" aria-label={label}>
            <span aria-hidden="true">{icon}</span>
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
