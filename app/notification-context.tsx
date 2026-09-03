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
  markNotificationRead as apiMarkRead,
  markAllNotificationsRead as apiMarkAllRead,
  deleteNotification as apiDeleteNotification,
  getNotificationStreamUrl,
  type NotificationRecord,
  type NotificationType,
} from "../lib/api";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  link?: string;
  entityType?: string;
  entityId?: string;
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
  | { type: "SET_NOTIFICATIONS"; payload: { notifications: Notification[]; unreadCount: number } }
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

function notificationReducer(
  state: NotificationState,
  action: NotificationAction,
): NotificationState {
  switch (action.type) {
    case "SET_NOTIFICATIONS":
      return {
        ...state,
        notifications: action.payload.notifications,
        unreadCount: action.payload.unreadCount,
      };
    case "ADD_NOTIFICATION": {
      // Check if already in list
      if (state.notifications.some((n) => n.id === action.payload.id)) {
        return state;
      }
      const next = [action.payload, ...state.notifications];
      return {
        ...state,
        notifications: next,
        unreadCount: state.unreadCount + (action.payload.read ? 0 : 1),
      };
    }
    case "MARK_READ": {
      const next = state.notifications.map((n) =>
        n.id === action.payload ? { ...n, read: true } : n,
      );
      const unread = Math.max(0, state.unreadCount - 1);
      return { ...state, notifications: next, unreadCount: unread };
    }
    case "MARK_ALL_READ": {
      const next = state.notifications.map((n) => ({ ...n, read: true }));
      return { ...state, notifications: next, unreadCount: 0 };
    }
    case "REMOVE_NOTIFICATION": {
      const removed = state.notifications.find((n) => n.id === action.payload);
      const next = state.notifications.filter((n) => n.id !== action.payload);
      const unread = removed && !removed.read ? Math.max(0, state.unreadCount - 1) : state.unreadCount;
      return { ...state, notifications: next, unreadCount: unread };
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
  dismiss: (id: string) => Promise<void>;
  toast: (toast: Omit<ToastMessage, "id">) => void;
  dismissToast: (id: string) => void;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const POLL_INTERVAL_MS = 60_000;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, accessToken } = useAuth();
  const [state, dispatch] = useReducer(notificationReducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const toast = useCallback((t: Omit<ToastMessage, "id">) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const duration = t.duration ?? 4500;
    dispatch({ type: "ADD_TOAST", payload: { ...t, id } });
    if (duration > 0) {
      setTimeout(() => dispatch({ type: "REMOVE_TOAST", payload: id }), duration);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const data = await getNotifications(accessToken, { limit: 30 });
      const items = data.items || data.notifications || [];
      const mapped: Notification[] = items.map((n) => ({
        id: n.id,
        type: n.type,
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
        payload: { notifications: mapped, unreadCount: data.unreadCount },
      });
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
            title: formatted.title,
            message: formatted.message,
          });
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
  }, [user, accessToken, refresh, toast]);

  const markAsRead = useCallback(async (id: string) => {
    if (!accessToken) return;
    dispatch({ type: "MARK_READ", payload: id });
    try {
      await apiMarkRead(accessToken, id);
    } catch {
      // Ignored if failed
    }
  }, [accessToken]);

  const markAllAsRead = useCallback(async () => {
    if (!accessToken) return;
    dispatch({ type: "MARK_ALL_READ" });
    try {
      await apiMarkAllRead(accessToken);
    } catch {
      // Ignored if failed
    }
  }, [accessToken]);

  const dismiss = useCallback(async (id: string) => {
    if (!accessToken) return;
    dispatch({ type: "REMOVE_NOTIFICATION", payload: id });
    try {
      await apiDeleteNotification(accessToken, id);
    } catch {
      // Ignored if failed
    }
  }, [accessToken]);

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