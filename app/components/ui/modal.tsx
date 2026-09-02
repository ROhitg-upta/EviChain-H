"use client";

import { useEffect, type ReactNode } from "react";
import { Button } from "./button";
import { cn } from "./utils";

export type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: "sm" | "md" | "lg";
};

const sizeClass = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
};

export function Modal({ open, title, description, children, footer, onClose, size = "md" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
      <section
        className={cn("w-full rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950", sizeClass[size])}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby={description ? "modal-description" : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="modal-title" className="text-lg font-bold tracking-normal text-slate-950 dark:text-slate-50">{title}</h2>
            {description && <p id="modal-description" className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog">Close</Button>
        </header>
        <div>{children}</div>
        {footer && <footer className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">{footer}</footer>}
      </section>
    </div>
  );
}

export type ConfirmDialogProps = Omit<ModalProps, "children" | "footer"> & {
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

export function ConfirmDialog({
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  ...props
}: ConfirmDialogProps) {
  return (
    <Modal
      {...props}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={props.onClose}>{cancelLabel}</Button>
          <Button type="button" variant={destructive ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        This action needs confirmation before it continues.
      </div>
    </Modal>
  );
}
