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
import {
  getNotifications,
  getNeedsAttentionAlerts,
  executeAlertAction as apiExecuteAction,
  dismissNotificationAlert as apiDismissAlert,
  markNotificationRead as apiMarkRead,
  markAllNotificationsRead as apiMarkAllRead,
  deleteNotification as apiDeleteNotification,
  getNotificationStreamUrl,
  type NotificationRecord,
  type NotificationType,
  type AlertSeverity,
  type NeedsAttentionItem,
} from "../lib/api";

export type { AlertSeverity, NeedsAttentionItem };

export interface Notification {
  id: string;
  type: NotificationType;
  severity?: AlertSeverity;
  actionRequired?: boolean;
  actionType?: string | null;
  actionPayload?: Record<string, unknown> | null;
  dismissedAt?: string | null;
  resolvedAt?: string | null;
  groupingKey?: string | null;
  title: string;
  message: string;
  read: boolean;
  readAt?: string | null;
  createdAt: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}

export interface ToastMessage {
  id: string;
  type: NotificationType;
  severity?: AlertSeverity;
  title: string;
  message?: string;
  duration?: number;
}

export type HighestSeverity = "NONE" | "INFO" | "SUCCESS" | "WARNING" | "HIGH" | "CRITICAL" | "SECURITY";

export interface NotificationState {
  notifications: Notification[];
  toasts: ToastMessage[];
  unreadCount: number;
  actionRequiredCount: number;
  highestUnreadSeverity: HighestSeverity;
  needsAttentionQueue: NeedsAttentionItem[];
  loading: boolean;
}

type NotificationAction =
  | {
      type: "SET_NOTIFICATIONS";
      payload: {
        notifications: Notification[];
        unreadCount: number;
        actionRequiredCount: number;
      };
    }
  | { type: "SET_NEEDS_ATTENTION"; payload: NeedsAttentionItem[] }
  | { type: "ADD_NOTIFICATION"; payload: Notification }
  | { type: "MARK_READ"; payload: string }
  | { type: "MARK_ALL_READ" }
  | { type: "RESOLVE_ACTION"; payload: string }
  | { type: "REMOVE_NOTIFICATION"; payload: string }
  | { type: "ADD_TOAST"; payload: ToastMessage }
  | { type: "REMOVE_TOAST"; payload: string }
  | { type: "SET_LOADING"; payload: boolean };

function computeHighestSeverity(items: Notification[]): HighestSeverity {
  const unreadItems = items.filter((n) => !n.read && !n.dismissedAt);
  if (unreadItems.length === 0) return "NONE";

  if (unreadItems.some((n) => n.severity === "CRITICAL")) return "CRITICAL";
  if (unreadItems.some((n) => n.severity === "SECURITY")) return "SECURITY";
  if (unreadItems.some((n) => n.severity === "HIGH")) return "HIGH";
  if (unreadItems.some((n) => n.severity === "WARNING")) return "WARNING";
  if (unreadItems.some((n) => n.severity === "SUCCESS")) return "SUCCESS";
  return "INFO";
}

const initialState: NotificationState = {
  notifications: [],
  toasts: [],
  unreadCount: 0,
  actionRequiredCount: 0,
  highestUnreadSeverity: "NONE",
  needsAttentionQueue: [],
  loading: false,
};

function notificationReducer(
  state: NotificationState,
  action: NotificationAction,
): NotificationState {
  switch (action.type) {
    case "SET_NOTIFICATIONS": {
      const highest = computeHighestSeverity(action.payload.notifications);
      return {
        ...state,
        notifications: action.payload.notifications,
        unreadCount: action.payload.unreadCount,
        actionRequiredCount: action.payload.actionRequiredCount,
        highestUnreadSeverity: highest,
      };
    }
    case "SET_NEEDS_ATTENTION":
      return {
        ...state,
        needsAttentionQueue: action.payload,
      };
    case "ADD_NOTIFICATION": {
      if (state.notifications.some((n) => n.id === action.payload.id)) {
        return state;
      }
      const next = [action.payload, ...state.notifications];
      const highest = computeHighestSeverity(next);
      const isUnread = !action.payload.read;
      const isAction = Boolean(action.payload.actionRequired && !action.payload.resolvedAt);

      return {
        ...state,
        notifications: next,
        unreadCount: state.unreadCount + (isUnread ? 1 : 0),
        actionRequiredCount: state.actionRequiredCount + (isAction ? 1 : 0),
        highestUnreadSeverity: highest,
      };
    }
    case "MARK_READ": {
      const next = state.notifications.map((n) =>
        n.id === action.payload ? { ...n, read: true, readAt: new Date().toISOString() } : n,
      );
      const highest = computeHighestSeverity(next);
      return {
        ...state,
        notifications: next,
        unreadCount: Math.max(0, state.unreadCount - 1),
        highestUnreadSeverity: highest,
      };
    }
    case "MARK_ALL_READ": {
      const nowIso = new Date().toISOString();
      const next = state.notifications.map((n) => ({ ...n, read: true, readAt: n.readAt ?? nowIso }));
      return {
        ...state,
        notifications: next,
        unreadCount: 0,
        highestUnreadSeverity: "NONE",
      };
    }
    case "RESOLVE_ACTION": {
      const nowIso = new Date().toISOString();
      const next = state.notifications.map((n) =>
        n.id === action.payload
          ? { ...n, read: true, readAt: n.readAt ?? nowIso, resolvedAt: nowIso }
          : n,
      );
      const nextQueue = state.needsAttentionQueue.filter((q) => q.id !== action.payload);
      return {
        ...state,
        notifications: next,
        needsAttentionQueue: nextQueue,
        actionRequiredCount: Math.max(0, state.actionRequiredCount - 1),
        unreadCount: Math.max(0, state.unreadCount - 1),
        highestUnreadSeverity: computeHighestSeverity(next),
      };
    }
    case "REMOVE_NOTIFICATION": {
      const removed = state.notifications.find((n) => n.id === action.payload);
      const next = state.notifications.filter((n) => n.id !== action.payload);
      const nextQueue = state.needsAttentionQueue.filter((q) => q.id !== action.payload);
      const unreadDec = removed && !removed.read ? 1 : 0;
      const actionDec = removed && removed.actionRequired && !removed.resolvedAt ? 1 : 0;

      return {
        ...state,
        notifications: next,
        needsAttentionQueue: nextQueue,
        unreadCount: Math.max(0, state.unreadCount - unreadDec),
        actionRequiredCount: Math.max(0, state.actionRequiredCount - actionDec),
        highestUnreadSeverity: computeHighestSeverity(next),
      };
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

export interface NotificationContextValue extends NotificationState {
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  dismissAlert: (id: string) => Promise<boolean>;
  executeAction: (id: string, actionType: string) => Promise<boolean>;
  fetchNeedsAttention: () => Promise<void>;
  toast: (toast: Omit<ToastMessage, "id">) => void;
  dismissToast: (id: string) => void;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const POLL_INTERVAL_MS = 45_000;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, accessToken } = useAuth();
  const [state, dispatch] = useReducer(notificationReducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const toast = useCallback((t: Omit<ToastMessage, "id">) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const duration = t.duration ?? 5000;
    dispatch({ type: "ADD_TOAST", payload: { ...t, id } });
    if (duration > 0) {
      setTimeout(() => dispatch({ type: "REMOVE_TOAST", payload: id }), duration);
    }
  }, []);

  const fetchNeedsAttention = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await getNeedsAttentionAlerts(accessToken);
      dispatch({ type: "SET_NEEDS_ATTENTION", payload: res.items || [] });
    } catch {
      // Background fetch silent
    }
  }, [accessToken]);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const [data, needsAttn] = await Promise.all([
        getNotifications(accessToken, { limit: 40 }),
        getNeedsAttentionAlerts(accessToken),
      ]);

      const items = data.items || data.notifications || [];
      const mapped: Notification[] = items.map((n) => ({
        id: n.id,
        type: n.type,
        severity: n.severity,
        actionRequired: n.actionRequired,
        actionType: n.actionType,
        actionPayload: n.actionPayload,
        dismissedAt: n.dismissedAt,
        resolvedAt: n.resolvedAt,
        groupingKey: n.groupingKey,
        title: n.title,
        message: n.message,
        read: n.read,
        createdAt: n.createdAt,
        link: n.link ?? undefined,
        entityType: n.entityType ?? undefined,
        entityId: n.entityId ?? undefined,
      }));

      dispatch({
        type: "SET_NOTIFICATIONS",
        payload: {
          notifications: mapped,
          unreadCount: data.unreadCount,
          actionRequiredCount: data.actionRequiredCount ?? 0,
        },
      });

      if (needsAttn?.items) {
        dispatch({ type: "SET_NEEDS_ATTENTION", payload: needsAttn.items });
      }
    } catch {
      // Background fetch failure handled gracefully
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [accessToken]);

  // Connect to SSE stream
  useEffect(() => {
    if (!user || !accessToken) return;

    refresh();

    // Setup SSE connection
    try {
      const streamUrl = getNotificationStreamUrl();
      const es = new EventSource(streamUrl, { withCredentials: true });
      eventSourceRef.current = es;

      es.addEventListener("notification", (event) => {
        try {
          const notif = JSON.parse(event.data) as NotificationRecord;
          const formatted: Notification = {
            id: notif.id,
            type: notif.type,
            severity: notif.severity,
            actionRequired: notif.actionRequired,
            actionType: notif.actionType,
            actionPayload: notif.actionPayload,
            dismissedAt: notif.dismissedAt,
            resolvedAt: notif.resolvedAt,
            groupingKey: notif.groupingKey,
            title: notif.title,
            message: notif.message,
            read: notif.read,
            createdAt: notif.createdAt,
            link: notif.link ?? undefined,
            entityType: notif.entityType ?? undefined,
            entityId: notif.entityId ?? undefined,
          };
          dispatch({ type: "ADD_NOTIFICATION", payload: formatted });

          toast({
            type: formatted.type,
            severity: formatted.severity,
            title: formatted.title,
            message: formatted.message,
          });

          // If action required, trigger needs attention refresh
          if (formatted.actionRequired) {
            fetchNeedsAttention();
          }
        } catch (err) {
          console.error("SSE parse error:", err);
        }
      });

      es.onerror = () => {
        es.close();
      };
    } catch (err) {
      console.warn("EventSource not supported or blocked:", err);
    }

    pollRef.current = setInterval(refresh, POLL_INTERVAL_MS);

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [user, accessToken, refresh, fetchNeedsAttention, toast]);

  const markAsRead = useCallback(
    async (id: string) => {
      if (!accessToken) return;
      dispatch({ type: "MARK_READ", payload: id });
      try {
        await apiMarkRead(accessToken, id);
      } catch {
        // Ignored if failed
      }
    },
    [accessToken],
  );

  const markAllAsRead = useCallback(async () => {
    if (!accessToken) return;
    dispatch({ type: "MARK_ALL_READ" });
    try {
      await apiMarkAllRead(accessToken);
    } catch {
      // Ignored if failed
    }
  }, [accessToken]);

  const dismiss = useCallback(
    async (id: string) => {
      if (!accessToken) return;
      dispatch({ type: "REMOVE_NOTIFICATION", payload: id });
      try {
        await apiDeleteNotification(accessToken, id);
      } catch {
        // Ignored if failed
      }
    },
    [accessToken],
  );

  const dismissAlert = useCallback(
    async (id: string): Promise<boolean> => {
      if (!accessToken) return false;
      dispatch({ type: "REMOVE_NOTIFICATION", payload: id });
      try {
        await apiDismissAlert(accessToken, id);
        return true;
      } catch {
        return false;
      }
    },
    [accessToken],
  );

  const executeAction = useCallback(
    async (id: string, actionType: string): Promise<boolean> => {
      if (!accessToken) return false;
      dispatch({ type: "RESOLVE_ACTION", payload: id });
      try {
        await apiExecuteAction(accessToken, id, actionType);
        return true;
      } catch (err) {
        console.error("Execute action error:", err);
        refresh();
        return false;
      }
    },
    [accessToken, refresh],
  );

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
        dismissAlert,
        executeAction,
        fetchNeedsAttention,
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
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return ctx;
}