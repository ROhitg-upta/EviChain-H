"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "./auth-context";
import { getAuditLogs } from "../lib/api";

export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  link?: string;
}

export interface ToastMessage {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
}

interface NotificationState {
  notifications: Notification[];
  toasts: ToastMessage[];
  unreadCount: number;
  loading: boolean;
}

type NotificationAction =
  | { type: "SET_NOTIFICATIONS"; payload: Notification[] }
  | { type: "ADD_NOTIFICATION"; payload: Notification }
  | { type: "MARK_READ"; payload: string }
  | { type: "MARK_ALL_READ" }
  | { type: "REMOVE_NOTIFICATION"; payload: string }
  | { type: "ADD_TOAST"; payload: ToastMessage }
  | { type: "REMOVE_TOAST"; payload: string }
  | { type: "SET_LOADING"; payload: boolean };

const initialState: NotificationState = {
  notifications: [],
  toasts: [],
  unreadCount: 0,
  loading: false,
};

function countUnread(notifications: Notification[]) {
  return notifications.filter((n) => !n.read).length;
}

function notificationReducer(
  state: NotificationState,
  action: NotificationAction,
): NotificationState {
  switch (action.type) {
    case "SET_NOTIFICATIONS":
      return {
        ...state,
        notifications: action.payload,
        unreadCount: countUnread(action.payload),
      };
    case "ADD_NOTIFICATION": {
      const next = [action.payload, ...state.notifications];
      return { ...state, notifications: next, unreadCount: countUnread(next) };
    }
    case "MARK_READ": {
      const next = state.notifications.map((n) =>
        n.id === action.payload ? { ...n, read: true } : n,
      );
      return { ...state, notifications: next, unreadCount: countUnread(next) };
    }
    case "MARK_ALL_READ": {
      const next = state.notifications.map((n) => ({ ...n, read: true }));
      return { ...state, notifications: next, unreadCount: 0 };
    }
    case "REMOVE_NOTIFICATION": {
      const next = state.notifications.filter((n) => n.id !== action.payload);
      return { ...state, notifications: next, unreadCount: countUnread(next) };
    }
    case "ADD_TOAST":
      return { ...state, toasts: [...state.toasts, action.payload] };
    case "REMOVE_TOAST":
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.payload),
      };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

interface NotificationContextValue extends NotificationState {
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismiss: (id: string) => void;
  toast: (toast: Omit<ToastMessage, "id">) => void;
  dismissToast: (id: string) => void;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

const POLL_INTERVAL_MS = 30_000;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, accessToken } = useAuth();
  const [state, dispatch] = useReducer(notificationReducer, initialState);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  // Persist which IDs have been marked read across polls
  const readIdsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const logs = await getAuditLogs(accessToken, { limit: 20 });
      const derived: Notification[] = logs.map((l) => ({
        id: l.id,
        type: l.action.includes("flag")   ? "warning" as const
             : l.action.includes("delete") ? "error"   as const
             : l.action.includes("upload") || l.action.includes("create") ? "success" as const
             : "info" as const,
        title:     l.action,
        message:   `${l.resourceType} · ${l.resourceId.slice(0, 8)}`,
        // Preserve read state from previous polls
        read:      readIdsRef.current.has(l.id),
        createdAt: l.timestamp,
        link:      l.resourceType === "evidence"
          ? `/evidence/${l.resourceId}`
          : l.resourceType === "case"
          ? `/cases/${l.resourceId}`
          : undefined,
      }));
      dispatch({ type: "SET_NOTIFICATIONS", payload: derived });
    } catch {
      // Silent fail on background refresh
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [accessToken]);

  useEffect(() => {
    if (!user || !accessToken) return;
    refresh();
    pollRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user, accessToken, refresh]);

  const markAsRead = useCallback(async (id: string) => {
    readIdsRef.current.add(id);
    dispatch({ type: "MARK_READ", payload: id });
  }, []);

  const markAllAsRead = useCallback(async () => {
    // Add all current notification IDs to the persistent read set
    state.notifications.forEach((n) => readIdsRef.current.add(n.id));
    dispatch({ type: "MARK_ALL_READ" });
  }, [state.notifications]);

  const dismiss = useCallback((id: string) => {
    readIdsRef.current.delete(id);
    dispatch({ type: "REMOVE_NOTIFICATION", payload: id });
  }, []);

  const toast = useCallback((t: Omit<ToastMessage, "id">) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const duration = t.duration ?? 4500;
    dispatch({ type: "ADD_TOAST", payload: { ...t, id } });
    if (duration > 0) {
      setTimeout(() => dispatch({ type: "REMOVE_TOAST", payload: id }), duration);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    dispatch({ type: "REMOVE_TOAST", payload: id });
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        ...state,
        markAsRead,
        markAllAsRead,
        dismiss,
        toast,
        dismissToast,
        refresh,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider",
    );
  }
  return ctx;
}