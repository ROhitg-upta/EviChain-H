"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNotifications } from "@/app/notification-context";
import { LayoutDashboard, Briefcase, Camera, Shield, Bell } from "./icons";

interface MobileBottomNavProps {
  onOpenCapture: () => void;
  onOpenOfflineQueue?: () => void;
  pendingOfflineCount?: number;
}

export default function MobileBottomNav({
  onOpenCapture,
  onOpenOfflineQueue,
  pendingOfflineCount = 0,
}: MobileBottomNavProps) {
  const pathname = usePathname();
  const { unreadCount, actionRequiredCount, highestUnreadSeverity } = useNotifications();

  const isActive = (path: string) => {
    if (path === "/" && pathname === "/") return true;
    if (path !== "/" && pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#161b22]/95 backdrop-blur-md border-t border-[#30363d] pb-[env(safe-area-inset-bottom)] select-none shadow-2xl"
    >
      <div className="flex items-center justify-around h-16 px-2 relative">
        {/* 1. Dashboard */}
        <Link
          href="/"
          className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 text-[11px] font-medium transition-colors ${
            isActive("/") && pathname === "/"
              ? "text-emerald-400 font-semibold"
              : "text-[#8b949e] hover:text-[#c9d1d9]"
          }`}
        >
          <LayoutDashboard className="w-5 h-5 mb-1" />
          <span>Home</span>
        </Link>

        {/* 2. Cases */}
        <Link
          href="/cases"
          className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 text-[11px] font-medium transition-colors ${
            isActive("/cases")
              ? "text-emerald-400 font-semibold"
              : "text-[#8b949e] hover:text-[#c9d1d9]"
          }`}
        >
          <Briefcase className="w-5 h-5 mb-1" />
          <span>Cases</span>
        </Link>

        {/* 3. Center Elevated Emerald Capture CTA */}
        <div className="relative -top-5 flex flex-col items-center">
          <button
            type="button"
            onClick={onOpenCapture}
            aria-label="Open Field Evidence Capture"
            className="w-13 h-13 rounded-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-[#0d1117] flex items-center justify-center shadow-lg shadow-emerald-950/60 border-4 border-[#161b22] transition-transform cursor-pointer"
          >
            <Camera className="w-6 h-6 stroke-[2.5]" />
          </button>
          <span className="text-[10px] font-bold text-emerald-400 mt-0.5 tracking-tight">
            Capture
          </span>
        </div>

        {/* 4. Evidence */}
        <Link
          href="/evidence"
          className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 text-[11px] font-medium transition-colors ${
            isActive("/evidence")
              ? "text-emerald-400 font-semibold"
              : "text-[#8b949e] hover:text-[#c9d1d9]"
          }`}
        >
          <Shield className="w-5 h-5 mb-1" />
          <span>Evidence</span>
        </Link>

        {/* 5. Alerts / Investigation Command Center */}
        <Link
          href="/notifications"
          className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 text-[11px] font-medium transition-colors relative ${
            isActive("/notifications")
              ? "text-emerald-400 font-semibold"
              : "text-[#8b949e] hover:text-[#c9d1d9]"
          }`}
          aria-label="Alerts"
        >
          <div className="relative">
            <Bell className="w-5 h-5 mb-1" />
            {unreadCount > 0 && (
              <span
                className={`absolute -top-1 -right-2.5 text-[9px] font-bold min-w-4 h-4 px-1 rounded-full flex items-center justify-center ${
                  highestUnreadSeverity === "CRITICAL" || highestUnreadSeverity === "SECURITY"
                    ? "bg-rose-500 text-white"
                    : actionRequiredCount > 0
                    ? "bg-amber-400 text-slate-950"
                    : "bg-emerald-500 text-slate-950"
                }`}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          <span>Alerts</span>
        </Link>
      </div>
    </nav>
  );
}
