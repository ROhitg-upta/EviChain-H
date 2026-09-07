"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  X,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
  HardDrive,
  ExternalLink,
} from "./icons";
import { useAuth } from "../../auth-context";
import {
  OfflineEvidenceDraft,
  getOfflineDrafts,
  deleteOfflineDraft,
  syncOfflineDrafts,
  clearSyncedDrafts,
  getStorageQuota,
  updateOfflineDraft,
} from "../../../lib/offline-queue";
import SafeHashField from "./safe-hash-field";

interface OfflineQueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OfflineQueuePanel({ isOpen, onClose }: OfflineQueuePanelProps) {
  const { user, accessToken } = useAuth();
  const [drafts, setDrafts] = useState<OfflineEvidenceDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{
    usedBytes: number;
    quotaBytes: number;
    percentage: number;
    isLowStorage: boolean;
  } | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const items = await getOfflineDrafts(user.id);
      setDrafts(items);
      const quota = await getStorageQuota();
      setStorageInfo(quota);
    } catch (err) {
      console.error("Failed to load offline drafts:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSyncAll = async () => {
    if (!user || !accessToken || syncing) return;
    try {
      setSyncing(true);
      await syncOfflineDrafts(user.id, accessToken, (draftId, progress) => {
        setDrafts((prev) =>
          prev.map((d) => (d.id === draftId ? { ...d, progress, status: progress === 100 ? "SYNCED" : "UPLOADING" } : d)),
        );
      });
      await loadData();
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteOfflineDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleRetrySingle = async (id: string) => {
    try {
      await updateOfflineDraft(id, { status: "QUEUED", error: undefined, progress: 0 });
      await loadData();
      if (navigator.onLine) {
        handleSyncAll();
      }
    } catch (err) {
      console.error("Retry failed:", err);
    }
  };

  const handleClearCompleted = async () => {
    if (!user) return;
    try {
      await clearSyncedDrafts(user.id);
      await loadData();
    } catch (err) {
      console.error("Clear synced failed:", err);
    }
  };

  if (!isOpen) return null;

  const pendingCount = drafts.filter((d) => d.status !== "SYNCED").length;
  const syncedCount = drafts.filter((d) => d.status === "SYNCED").length;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-[#161b22] border-l border-[#30363d] h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-label="Offline Evidence Queue"
      >
        {/* Header */}
        <div className="p-4 border-b border-[#30363d] flex items-center justify-between bg-[#0d1117]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Offline Evidence Vault
              </h2>
              <p className="text-xs text-[#8b949e]">
                {drafts.length} stored {drafts.length === 1 ? "item" : "items"} on device
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#21262d] text-[#8b949e] hover:text-white transition-colors"
            aria-label="Close offline panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Storage Bar */}
        {storageInfo && (
          <div className="px-4 py-2.5 bg-[#0d1117]/60 border-b border-[#30363d] flex items-center justify-between text-xs">
            <span className="text-[#8b949e] flex items-center gap-1.5">
              <span>Device Vault:</span>
              <strong className="text-[#c9d1d9]">{formatBytes(storageInfo.usedBytes)}</strong>
            </span>
            {storageInfo.isLowStorage && (
              <span className="text-amber-400 flex items-center gap-1 font-semibold text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5" />
                Storage low ({storageInfo.percentage}%)
              </span>
            )}
          </div>
        )}

        {/* Action Toolbar */}
        <div className="p-3 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between gap-2">
          <button
            onClick={handleSyncAll}
            disabled={syncing || pendingCount === 0 || !navigator.onLine}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing Evidence..." : `Sync All (${pendingCount})`}
          </button>

          {syncedCount > 0 && (
            <button
              onClick={handleClearCompleted}
              className="px-3 py-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] text-xs font-medium border border-[#30363d] transition-colors"
            >
              Clear Synced
            </button>
          )}
        </div>

        {/* Drafts List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#8b949e] gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
              <span className="text-xs">Reading local storage...</span>
            </div>
          ) : drafts.length === 0 ? (
            <div className="text-center py-12 text-[#8b949e] space-y-2">
              <FileText className="w-10 h-10 mx-auto text-[#30363d]" />
              <p className="text-sm font-medium text-[#c9d1d9]">No offline evidence drafts</p>
              <p className="text-xs max-w-xs mx-auto">
                Evidence captured or drafted without an active connection will automatically queue here.
              </p>
            </div>
          ) : (
            drafts.map((draft) => (
              <div
                key={draft.id}
                className="bg-[#0d1117] border border-[#30363d] rounded-xl p-3.5 space-y-2.5 transition-colors hover:border-[#8b949e]/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold text-white truncate">
                      {draft.name || draft.fileName}
                    </h4>
                    <p className="text-xs text-[#8b949e] truncate">
                      {draft.type} &bull; {formatBytes(draft.fileSize)}
                      {draft.caseId && <span> &bull; Case Linked</span>}
                    </p>
                  </div>

                  {/* Status Badges */}
                  <div>
                    {draft.status === "SYNCED" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" /> Synced
                      </span>
                    )}
                    {draft.status === "UPLOADING" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                        <RefreshCw className="w-3 h-3 animate-spin" /> {draft.progress}%
                      </span>
                    )}
                    {(draft.status === "QUEUED" || draft.status === "DRAFT") && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        <Clock className="w-3 h-3" /> Queued
                      </span>
                    )}
                    {draft.status === "FAILED" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                        <AlertTriangle className="w-3 h-3" /> Failed
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar if uploading */}
                {draft.status === "UPLOADING" && (
                  <div className="w-full bg-[#21262d] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-cyan-400 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${draft.progress}%` }}
                    />
                  </div>
                )}

                {/* Verified Hash if synced */}
                {draft.status === "SYNCED" && draft.sha256 && (
                  <SafeHashField
                    hash={draft.sha256}
                    label="Server Verified Hash"
                    truncate={true}
                    truncateLength={10}
                    showBadge={true}
                  />
                )}

                {/* Error message */}
                {draft.status === "FAILED" && draft.error && (
                  <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/50 p-2 rounded-lg">
                    {draft.error}
                  </p>
                )}

                {/* Actions bottom bar */}
                <div className="flex items-center justify-between pt-1 text-xs text-[#8b949e] border-t border-[#21262d]">
                  <span>{new Date(draft.createdAt).toLocaleTimeString()}</span>

                  <div className="flex items-center gap-2">
                    {draft.status === "SYNCED" && draft.evidenceId && (
                      <Link
                        href={`/evidence/${draft.evidenceId}`}
                        onClick={onClose}
                        className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-medium"
                      >
                        <span>View Evidence</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}

                    {draft.status === "FAILED" && (
                      <button
                        onClick={() => handleRetrySingle(draft.id)}
                        className="text-cyan-400 hover:text-cyan-300 font-medium"
                      >
                        Retry
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(draft.id)}
                      className="p-1 text-[#8b949e] hover:text-rose-400 transition-colors"
                      aria-label="Delete draft"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
