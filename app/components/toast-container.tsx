"use client";

import { useNotifications, type ToastMessage } from "../notification-context";

const TYPE_CLASS: Record<string, string> = {
  success: "toast--success",
  error:   "toast--error",
  warning: "toast--warning",
  info:    "toast--info",
};

const TYPE_ICON: Record<string, string> = {
  success: "✓",
  error:   "✕",
  warning: "⚠",
  info:    "ℹ",
};

function Toast({ toast }: { toast: ToastMessage }) {
  const { dismissToast } = useNotifications();
  return (
    <div
      className={`toast ${TYPE_CLASS[toast.type] ?? "toast--info"}`}
      role="alert"
      aria-live="assertive"
    >
      <span className="toast-icon" aria-hidden="true">
        {TYPE_ICON[toast.type] ?? "ℹ"}
      </span>
      <div className="toast-body">
        <strong className="toast-title">{toast.title}</strong>
        {toast.message && <p className="toast-message">{toast.message}</p>}
      </div>
      <button
        className="toast-close"
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts } = useNotifications();
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-label="Notifications">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} />
      ))}
    </div>
  );
}
