"use client";

import React, { useState } from "react";
import { Check, Copy, ShieldCheck } from "./icons";

interface SafeHashFieldProps {
  hash: string;
  label?: string;
  truncate?: boolean;
  truncateLength?: number;
  className?: string;
  showBadge?: boolean;
}

export default function SafeHashField({
  hash,
  label,
  truncate = false,
  truncateLength = 8,
  className = "",
  showBadge = false,
}: SafeHashFieldProps) {
  const [copied, setCopied] = useState(false);

  if (!hash) {
    return <span className="text-xs text-[#8b949e] italic font-mono">No hash recorded</span>;
  }

  const cleanHash = hash.trim().toLowerCase();

  const displayHash =
    truncate && cleanHash.length > truncateLength * 2
      ? `${cleanHash.slice(0, truncateLength)}...${cleanHash.slice(-truncateLength)}`
      : cleanHash;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(cleanHash);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = cleanHash;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className={`flex flex-col gap-1 max-w-full ${className}`}>
      {label && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8b949e]">
            {label}
          </span>
          {showBadge && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
              <ShieldCheck className="w-3 h-3" />
              SHA-256
            </span>
          )}
        </div>
      )}

      <div
        className="group relative flex items-center justify-between gap-2 bg-[#0d1117]/80 hover:bg-[#161b22] border border-[#30363d] rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer max-w-full overflow-hidden"
        onClick={handleCopy}
        title="Click to copy full SHA-256 hash"
      >
        <span
          className="font-mono text-xs text-cyan-300 break-all select-all tracking-tight"
          style={{ wordBreak: "break-all", overflowWrap: "anywhere" }}
        >
          {displayHash}
        </span>

        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy SHA-256 hash"
          className="shrink-0 p-1 rounded hover:bg-[#30363d] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>

        {copied && (
          <span className="absolute -top-7 right-2 bg-emerald-600 text-white text-[10px] font-medium px-2 py-0.5 rounded shadow-lg animate-in fade-in slide-in-from-bottom-1 pointer-events-none z-10">
            Copied SHA-256!
          </span>
        )}
      </div>
    </div>
  );
}
