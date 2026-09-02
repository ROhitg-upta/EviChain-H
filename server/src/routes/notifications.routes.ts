import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware";
import { notificationService } from "../services/notification.service";

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// GET /notifications/stream — Real-time Server-Sent Events (SSE)
// ═══════════════════════════════════════════════════════════════════
router.get("/stream", requireAuth, (req: AuthedRequest, res) => {
  notificationService.registerClient(req.userId!, res);
});

// ═══════════════════════════════════════════════════════════════════
// GET /notifications — Paginated list of notifications + unreadCount
// ═══════════════════════════════════════════════════════════════════
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const unreadOnly = req.query.unreadOnly === "true";

    const where = {
      userId: req.userId!,
      ...(unreadOnly ? { read: false } : {}),
    };

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({
        where: { userId: req.userId!, read: false },
      }),
    ]);

    return res.json({ notifications, unreadCount });
  } catch (error) {
    console.error("Fetch notifications error:", error);
    return res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PATCH /notifications/:id/read — Mark single notification as read
// ═══════════════════════════════════════════════════════════════════
router.patch("/:id/read", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = req.params["id"] as string;

    const notif = await prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.userId !== req.userId!) {
      return res.status(404).json({ error: "Notification not found" });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    return res.json(updated);
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({ error: "Failed to update notification" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PATCH /notifications/read-all — Mark all notifications as read
// ═══════════════════════════════════════════════════════════════════
router.patch("/read-all", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const updated = await prisma.notification.updateMany({
      where: { userId: req.userId!, read: false },
      data: { read: true },
    });

    return res.json({ count: updated.count, message: "All notifications marked as read" });
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    return res.status(500).json({ error: "Failed to update notifications" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// DELETE /notifications/:id — Delete a notification
// ═══════════════════════════════════════════════════════════════════
router.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = req.params["id"] as string;

    const notif = await prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.userId !== req.userId!) {
      return res.status(404).json({ error: "Notification not found" });
    }

    await prisma.notification.delete({ where: { id } });
    return res.json({ message: "Notification deleted" });
  } catch (error) {
    console.error("Delete notification error:", error);
    return res.status(500).json({ error: "Failed to delete notification" });
  }
});

export default router;
