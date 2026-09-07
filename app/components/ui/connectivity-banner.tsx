"use client";

import React, { useState, useEffect } from "react";
import { Wifi, WifiOff, RefreshCw, Layers } from "./icons";
import { useAuth } from "../../auth-context";
import { getOfflineDrafts } from "../../../lib/offline-queue";

interface ConnectivityBannerProps {
  onOpenQueue?: () => void;
}

export default function ConnectivityBanner({ onOpenQueue }: ConnectivityBannerProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [showRestored, setShowRestored] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const { user } = useAuth();

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setShowRestored(true);
      const timer = setTimeout(() => setShowRestored(false), 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowRestored(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Poll pending drafts count if user is logged in
  useEffect(() => {
    if (!user) return;
    const checkDrafts = async () => {
      try {
        const drafts = await getOfflineDrafts(user.id);
        const pending = drafts.filter((d) => d.status !== "SYNCED").length;
        setPendingCount(pending);
      } catch {
        // Ignore IDB errors during offline check
      }
    };

    checkDrafts();
    const interval = setInterval(checkDrafts, 5000);
    return () => clearInterval(interval);
  }, [user]);

  if (isOnline && !showRestored && pendingCount === 0) {
    return null;
  }

  return (
    <aside
      aria-label="Connectivity and sync status"
      className={`w-full text-xs font-medium px-4 py-2 flex items-center justify-between transition-all duration-300 z-40 select-none ${
        !isOnline
          ? "bg-amber-950/90 border-b border-amber-800/50 text-amber-200"
          : showRestored
          ? "bg-emerald-950/90 border-b border-emerald-800/50 text-emerald-200"
          : "bg-[#161b22] border-b border-[#30363d] text-[#c9d1d9]"
      }`}
    >
      <div className="flex items-center gap-2 overflow-hidden">
        {!isOnline ? (
          <>
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <span className="truncate">
              <strong>Offline Mode</strong> &bull; Drafts stored safely in local encrypted storage.
            </span>
          </>
        ) : showRestored ? (
          <>
            <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">
              <strong>Connection Restored</strong> &bull; EviChain network reachable.
            </span>
          </>
        ) : (
          <>
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400 shrink-0 animate-spin" />
            <span className="truncate">
              {pendingCount} offline {pendingCount === 1 ? "draft" : "drafts"} ready for sync.
            </span>
          </>
        )}
      </div>

      {pendingCount > 0 && onOpenQueue && (
        <button
          onClick={onOpenQueue}
          className="ml-3 shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-white text-[11px] font-semibold border border-[#30363d] transition-colors cursor-pointer"
        >
          <Layers className="w-3 h-3 text-emerald-400" />
          <span>Queue ({pendingCount})</span>
        </button>
      )}
    </aside>
  );
}
