"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { WifiOff, RefreshCw, HardDrive, ShieldCheck, ArrowLeft } from "@/app/components/ui/icons";

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleRetry = () => {
    setChecking(true);
    setTimeout(() => {
      if (navigator.onLine) {
        window.location.href = "/";
      } else {
        setChecking(false);
      }
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] flex flex-col items-center justify-center p-6 select-none font-sans">
      <div className="max-w-md w-full bg-[#161b22] border border-[#30363d] rounded-2xl p-8 shadow-2xl text-center relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="mx-auto w-16 h-16 rounded-2xl bg-[#21262d] border border-[#30363d] flex items-center justify-center mb-6 shadow-inner text-amber-400">
          <WifiOff className="w-8 h-8 animate-pulse" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
          Offline Mode Active
        </h1>
        <p className="text-sm text-[#8b949e] mb-6 leading-relaxed">
          You are currently disconnected from the EviChain network. Evidence capture, local drafts, and integrity caches remain operational offline on this device.
        </p>

        <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4 mb-6 text-left space-y-2.5">
          <div className="flex items-center gap-2.5 text-xs text-[#c9d1d9]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Field drafts saved safely in local encrypted storage</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-[#c9d1d9]">
            <HardDrive className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>Automatic sync initiates once connection resumes</span>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleRetry}
            disabled={checking}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium text-sm transition-all duration-150 disabled:opacity-50 shadow-lg shadow-emerald-950/40 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking Network..." : isOnline ? "Reconnect Now" : "Retry Connection"}
          </button>

          <Link
            href="/evidence/new"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] font-medium text-sm border border-[#30363d] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Field Capture
          </Link>
        </div>

        <div className="mt-6 pt-4 border-t border-[#21262d] text-center">
          <p className="text-[11px] text-[#8b949e]">
            EviChain PWA Engine &bull; Zero-Knowledge Offline Vault
          </p>
        </div>
      </div>
    </div>
  );
}
