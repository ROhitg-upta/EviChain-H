import { Router, Response } from "express";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware";
import {
  notificationService,
  DEFAULT_PREFERENCES,
  type NotificationType,
  type NotificationPreferenceKey,
} from "../services/notification.service";

const router = Router();

// Allowed preference keys for PUT /notifications/preferences
const ALLOWED_PREFERENCE_KEYS = new Set<string>([
  "caseUpdates",
  "evidenceUploads",
  "custodyTransfers",
  "securityAlerts",
  "auditActivity",
  "reportReady",
  "weeklyDigest",
]);

// ═══════════════════════════════════════════════════════════════════
// GET /notifications/stream — Real-time Server-Sent Events (SSE)
// ═══════════════════════════════════════════════════════════════════
router.get("/stream", requireAuth, (req: AuthedRequest, res: Response) => {
  notificationService.registerClient(req.userId!, res);
});

// ═══════════════════════════════════════════════════════════════════
// GET /notifications/unread-count — Quick unread count lookup
// ═══════════════════════════════════════════════════════════════════
router.get("/unread-count", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const unreadCount = await notificationService.getUnreadCount(req.userId!);
    return res.json({ unreadCount });
  } catch (error) {
    console.error("[Notifications API] Get unread count error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to fetch unread count" } });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /notifications/preferences — Get current user preferences
// ═══════════════════════════════════════════════════════════════════
router.get("/preferences", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const prefs = await notificationService.getPreferences(req.userId!);
    return res.json(prefs);
  } catch (error) {
    console.error("[Notifications API] Get preferences error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to fetch preferences" } });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PUT /notifications/preferences — Update user preferences
// ═══════════════════════════════════════════════════════════════════
router.put("/preferences", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({
        error: { code: "INVALID_BODY", message: "Request body must be a JSON object" },
      });
    }

    // Validate keys
    for (const key of Object.keys(req.body)) {
      if (!ALLOWED_PREFERENCE_KEYS.has(key)) {
        return res.status(400).json({
          error: { code: "INVALID_KEY", message: `Unknown preference key: ${key}` },
        });
      }
    }

    const updated = await notificationService.updatePreferences(req.userId!, req.body);
    return res.json(updated);
  } catch (error) {
    console.error("[Notifications API] Update preferences error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to update preferences" } });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /notifications — Paginated list of user notifications
// ═══════════════════════════════════════════════════════════════════
router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || req.query.limit || "20"), 10) || 20));
    const skip = (page - 1) * pageSize;

    const unreadOnly = req.query.unreadOnly === "true";
    const typeFilter = req.query.type as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const andConditions: Array<Record<string, unknown>> = [{ userId: req.userId! }];

    if (unreadOnly) {
      andConditions.push({ read: false });
    }

    if (typeFilter && typeFilter !== "ALL") {
      andConditions.push({ type: typeFilter });
    }

    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) {
        const d = new Date(from);
        if (!isNaN(d.getTime())) range.gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!isNaN(d.getTime())) {
          if (to.length <= 10) d.setUTCHours(23, 59, 59, 999);
          range.lte = d;
        }
      }
      if (Object.keys(range).length > 0) {
        andConditions.push({ createdAt: range });
      }
    }

    const where = { AND: andConditions };

    const [totalItems, items, unreadCount] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.notification.count({
        where: { userId: req.userId!, read: false },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / pageSize) || 0;

    return res.json({
      items,
      notifications: items, // Backwards compatibility for legacy components
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
      unreadCount,
    });
  } catch (error) {
    console.error("[Notifications API] Fetch error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to fetch notifications" } });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PATCH /notifications/:id/read — Mark single notification as read
// ═══════════════════════════════════════════════════════════════════
router.patch("/:id/read", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const id = req.params["id"] as string;

    const updated = await notificationService.markNotificationRead(req.userId!, id);
    if (!updated) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Notification not found" } });
    }

    return res.json(updated);
  } catch (error) {
    console.error("[Notifications API] Mark read error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to mark notification as read" } });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PATCH /notifications/read-all — Mark all notifications as read
// ═══════════════════════════════════════════════════════════════════
router.patch("/read-all", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const updatedCount = await notificationService.markAllNotificationsRead(req.userId!);

    return res.json({
      count: updatedCount,
      updatedCount,
      message: `${updatedCount} notifications marked as read`,
    });
  } catch (error) {
    console.error("[Notifications API] Mark all read error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to mark all as read" } });
  }
});

// ═══════════════════════════════════════════════════════════════════
// DELETE /notifications/:id — Delete a notification
// ═══════════════════════════════════════════════════════════════════
router.delete("/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const id = req.params["id"] as string;

    const notif = await prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.userId !== req.userId!) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Notification not found" } });
    }

    await prisma.notification.delete({ where: { id } });
    return res.json({ message: "Notification deleted" });
  } catch (error) {
    console.error("[Notifications API] Delete error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to delete notification" } });
  }
});

export default router;
