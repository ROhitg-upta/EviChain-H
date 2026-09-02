"use client";

import { useRef, useState, type DragEvent, type InputHTMLAttributes } from "react";
import { Button } from "./button";
import { cn } from "./utils";

export type FileUploadProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  label?: string;
  helperText?: string;
  progress?: number;
  uploading?: boolean;
  selectedFile?: File | null;
  onFileSelect: (file: File | null) => void;
};

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${sizes[index]}`;
}

export function FileUpload({
  label = "Upload file",
  helperText = "Drag a file here or browse from your device.",
  progress = 0,
  uploading = false,
  selectedFile,
  onFileSelect,
  className,
  ...props
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    onFileSelect(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div className="grid gap-2">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">{label}</span>
      <div
        className={cn(
          "grid min-h-44 place-items-center rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center transition dark:border-slate-700 dark:bg-slate-900",
          dragging && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950",
          selectedFile && "border-emerald-300 bg-emerald-50/50",
          className,
        )}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        aria-label={selectedFile ? `Selected file ${selectedFile.name}` : label}
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          onChange={(event) => onFileSelect(event.target.files?.[0] ?? null)}
          {...props}
        />
        {selectedFile ? (
          <div className="grid gap-3">
            <div>
              <p className="font-semibold text-slate-950 dark:text-slate-50">{selectedFile.name}</p>
              <p className="mt-1 text-xs text-slate-500">{formatBytes(selectedFile.size)}</p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={(event) => { event.stopPropagation(); onFileSelect(null); }}>Remove</Button>
          </div>
        ) : (
          <div>
            <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700">UP</div>
            <p className="font-semibold text-slate-950 dark:text-slate-50">{helperText}</p>
            <p className="mt-1 text-xs text-slate-500">Keyboard accessible drag-drop zone</p>
          </div>
        )}
      </div>
      {uploading && (
        <div className="grid gap-1" role="status" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
          <span className="text-xs text-slate-500">{progress}% complete</span>
        </div>
      )}
    </div>
  );
}
