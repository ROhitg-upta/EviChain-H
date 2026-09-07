"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Camera,
  Video,
  Mic,
  FilePlus,
  Upload,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  RefreshCw,
} from "./icons";
import { useAuth } from "../../auth-context";
import { uploadEvidence, uploadCaseEvidence, getCases } from "../../../lib/api";
import { saveOfflineDraft } from "../../../lib/offline-queue";

interface EvidenceCaptureSheetProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCaseId?: string;
  onSuccess?: (evidenceId: string) => void;
}

export default function EvidenceCaptureSheet({
  isOpen,
  onClose,
  defaultCaseId,
  onSuccess,
}: EvidenceCaptureSheetProps) {
  const { user, accessToken } = useAuth();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [evidenceType, setEvidenceType] = useState("IMAGE");
  const [caseId, setCaseId] = useState<string>(defaultCaseId || "");
  const [ownerOrg, setOwnerOrg] = useState("Field Investigation Unit");
  const [description, setDescription] = useState("");
  const [cases, setCases] = useState<Array<{ id: string; title: string; caseNumber?: string }>>([]);

  const [isOnline, setIsOnline] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Hidden file inputs
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Auto-generate fresh idempotency key per sheet open
  const [idempotencyKey, setIdempotencyKey] = useState("");

  useEffect(() => {
    if (isOpen) {
      setIdempotencyKey(crypto.randomUUID());
      setIsOnline(navigator.onLine);
      setErrorMsg(null);
      setSuccessMsg(null);
      setProgress(0);
      setSelectedFile(null);
      setFilePreview(null);
      setTitle("");

      if (navigator.onLine && accessToken) {
        getCases(accessToken)
          .then((res) => {
            if (Array.isArray(res)) {
              setCases(res);
            }
          })
          .catch(() => {});
      }
    }
  }, [isOpen, accessToken]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleFileChange = (file: File, type: string) => {
    setSelectedFile(file);
    setEvidenceType(type);
    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, ""));
    }

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setFilePreview(url);
    } else {
      setFilePreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg("Please capture or select an evidence file.");
      return;
    }
    if (!user) {
      setErrorMsg("You must be signed in to submit evidence.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const activeIdempotencyKey = idempotencyKey || crypto.randomUUID();

    if (!isOnline) {
      // ── OFFLINE MODE: Save draft directly into IndexedDB ──
      try {
        await saveOfflineDraft({
          userId: user.id,
          idempotencyKey: activeIdempotencyKey,
          caseId: caseId.trim() ? caseId : null,
          name: title.trim() || selectedFile.name,
          type: evidenceType,
          ownerOrg: ownerOrg.trim() || "Field Unit",
          description: description.trim() || null,
          fileBlob: selectedFile,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          mimeType: selectedFile.type || "application/octet-stream",
          status: "QUEUED",
          progress: 0,
        });

        setSuccessMsg("Evidence stored safely in offline draft vault. Will sync automatically when connection resumes.");
        setTimeout(() => {
          onClose();
        }, 1800);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to store offline draft.");
      } finally {
        setSubmitting(false);
      }
    } else {
      // ── ONLINE MODE: Direct upload with live progress & idempotency key ──
      try {
        if (!accessToken) throw new Error("No access token available.");

        let res;
        if (caseId.trim()) {
          res = await uploadCaseEvidence(
            accessToken,
            caseId.trim(),
            selectedFile,
            {
              name: title.trim() || selectedFile.name,
              evidenceType,
              ownerOrg,
              description: description.trim() || undefined,
            },
            (pct) => setProgress(pct),
            activeIdempotencyKey,
          );
        } else {
          const formData = new FormData();
          formData.append("file", selectedFile);
          formData.append("name", title.trim() || selectedFile.name);
          formData.append("type", evidenceType);
          formData.append("ownerOrg", ownerOrg);
          if (description.trim()) formData.append("description", description.trim());
          formData.append("idempotencyKey", activeIdempotencyKey);

          res = await uploadEvidence(
            accessToken,
            formData,
            (pct) => setProgress(pct),
            activeIdempotencyKey,
          );
        }

        setSuccessMsg(`Evidence registered with SHA-256 fingerprint: ${res.sha256.slice(0, 12)}...`);
        if (onSuccess) onSuccess(res.id);
        setTimeout(() => {
          onClose();
        }, 1500);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setSubmitting(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Hidden Native Capture Inputs */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0], "IMAGE")}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0], "VIDEO")}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        capture
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0], "AUDIO")}
      />
      <input
        ref={docInputRef}
        type="file"
        accept="application/pdf,image/*,video/*,audio/*,text/*,application/zip,application/octet-stream"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            const ext = f.name.split(".").pop()?.toLowerCase();
            let t = "DOCUMENT";
            if (f.type.startsWith("image/")) t = "IMAGE";
            else if (f.type.startsWith("video/")) t = "VIDEO";
            else if (f.type.startsWith("audio/")) t = "AUDIO";
            else if (["dd", "raw", "iso", "img", "bin"].includes(ext || "")) t = "DISK_IMAGE";
            handleFileChange(f, t);
          }
        }}
      />

      <div
        className="w-full max-w-lg bg-[#161b22] border border-[#30363d] rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
        role="dialog"
        aria-label="Field Evidence Capture"
      >
        {/* Header */}
        <div className="p-4 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Field Evidence Capture
              </h2>
              <div className="flex items-center gap-2 text-xs">
                {isOnline ? (
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Online Live Ingest
                  </span>
                ) : (
                  <span className="text-amber-400 font-medium flex items-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    Offline Draft Vault
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#21262d] text-[#8b949e] hover:text-white transition-colors"
            aria-label="Close sheet"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Quick Capture Options */}
          {!selectedFile && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-[#0d1117] border border-[#30363d] hover:border-emerald-500/50 hover:bg-emerald-950/20 text-[#c9d1d9] transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform mb-1.5">
                  <Camera className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-white">Camera Photo</span>
                <span className="text-[10px] text-[#8b949e]">Rear lens</span>
              </button>

              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-[#0d1117] border border-[#30363d] hover:border-cyan-500/50 hover:bg-cyan-950/20 text-[#c9d1d9] transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform mb-1.5">
                  <Video className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-white">Record Video</span>
                <span className="text-[10px] text-[#8b949e]">HD Field clip</span>
              </button>

              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-[#0d1117] border border-[#30363d] hover:border-purple-500/50 hover:bg-purple-950/20 text-[#c9d1d9] transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform mb-1.5">
                  <Mic className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-white">Voice Note</span>
                <span className="text-[10px] text-[#8b949e]">Audio log</span>
              </button>

              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-[#0d1117] border border-[#30363d] hover:border-amber-500/50 hover:bg-amber-950/20 text-[#c9d1d9] transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform mb-1.5">
                  <FilePlus className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-white">Device File</span>
                <span className="text-[10px] text-[#8b949e]">PDF/Binaries</span>
              </button>
            </div>
          )}

          {/* Selected File Preview Box */}
          {selectedFile && (
            <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-3 flex items-center gap-3 relative">
              {filePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={filePreview}
                  alt="Capture Preview"
                  className="w-14 h-14 object-cover rounded-lg border border-[#30363d]"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-[#21262d] flex items-center justify-center text-cyan-400 shrink-0">
                  <FilePlus className="w-6 h-6" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">{selectedFile.name}</p>
                <p className="text-[11px] text-[#8b949e]">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB &bull; {selectedFile.type || "binary"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setFilePreview(null);
                }}
                className="p-1 rounded-lg hover:bg-[#21262d] text-[#8b949e] hover:text-rose-400"
                aria-label="Remove selected file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Metadata Fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#8b949e] mb-1">
                Evidence Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Broken Lock Photo - Main Entry"
                className="w-full bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white placeholder-[#8b949e] outline-none transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#8b949e] mb-1">
                  Evidence Classification
                </label>
                <select
                  value={evidenceType}
                  onChange={(e) => setEvidenceType(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded-lg px-2.5 py-2 text-xs text-white outline-none"
                >
                  <option value="IMAGE">Image / Photo</option>
                  <option value="VIDEO">Video Recording</option>
                  <option value="AUDIO">Audio Log / Memo</option>
                  <option value="DOCUMENT">Document / PDF</option>
                  <option value="DISK_IMAGE">Forensic Disk Image</option>
                  <option value="DATABASE">Database Dump</option>
                  <option value="NETWORK_CAPTURE">Network PCAP</option>
                  <option value="CONFIG">Config / Log File</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#8b949e] mb-1">
                  Assign Case
                </label>
                <select
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded-lg px-2.5 py-2 text-xs text-white outline-none"
                >
                  <option value="">Unassigned (Standalone)</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.caseNumber ? `[${c.caseNumber}] ` : ""}
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#8b949e] mb-1">
                Owner Organization / Division
              </label>
              <input
                type="text"
                value={ownerOrg}
                onChange={(e) => setOwnerOrg(e.target.value)}
                placeholder="Field Investigation Unit"
                className="w-full bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#8b949e] mb-1">
                Chain of Custody Notes
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Observed scene condition, device position, or collection notes..."
                className="w-full bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white placeholder-[#8b949e] outline-none"
              />
            </div>
          </div>

          {/* Progress Bar */}
          {submitting && progress > 0 && isOnline && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[#8b949e]">
                <span>Uploading to Secure Vault</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-[#0d1117] rounded-full h-2 overflow-hidden border border-[#30363d]">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Alerts */}
          {errorMsg && (
            <div className="p-3 bg-rose-950/40 border border-rose-900/50 rounded-lg flex items-start gap-2 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-lg flex items-start gap-2 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || !selectedFile}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isOnline ? "Registering Evidence..." : "Saving Offline..."}</span>
                </>
              ) : isOnline ? (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Submit &amp; Fingerprint</span>
                </>
              ) : (
                <>
                  <HardDrive className="w-4 h-4" />
                  <span>Save to Offline Vault</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
