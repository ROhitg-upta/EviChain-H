import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware";
import { hashPassword, verifyPassword } from "../auth";
import { notificationService } from "../services/notification.service";

const router = Router();

router.use(requireAuth);

// ═══════════════════════════════════════════════════════════════════
// GET /profile — Get authenticated user's profile
// ═══════════════════════════════════════════════════════════════════
router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: { code: "USER_NOT_FOUND", message: "User not found" },
      });
    }

    return res.json(user);
  } catch (error) {
    console.error("[Profile API] Get profile error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to fetch profile" } });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PATCH /profile — Update own non-privileged profile information
// ═══════════════════════════════════════════════════════════════════
router.patch("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = z.object({
      name: z.string().min(2, "Name must be at least 2 characters").max(80),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid profile data", details: parsed.error.flatten() },
      });
    }

    const updated = await prisma.user.update({
      where: { id: req.userId! },
      data: { name: parsed.data.name },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId!,
        action: "user.profile_update",
        resourceType: "user",
        resourceId: req.userId!,
        detailJson: { name: parsed.data.name },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] as string,
      },
    });

    return res.json({
      message: "Profile updated successfully",
      user: updated,
    });
  } catch (error) {
    console.error("[Profile API] Update profile error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to update profile" } });
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /profile/change-password — Change password & revoke all sessions
// ═══════════════════════════════════════════════════════════════════
router.post("/change-password", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = z.object({
      currentPassword: z.string().min(1, "Current password is required"),
      newPassword: z.string().min(8, "New password must be at least 8 characters"),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid password data", details: parsed.error.flatten() },
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) {
      return res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User not found" } });
    }

    const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({
        error: { code: "INVALID_CREDENTIALS", message: "Current password is incorrect" },
      });
    }

    const newHash = await hashPassword(parsed.data.newPassword);

    await prisma.user.update({
      where: { id: req.userId! },
      data: { passwordHash: newHash },
    });

    // Revoke all existing sessions for this user
    await prisma.session.deleteMany({ where: { userId: req.userId! } });

    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId!,
        action: "user.password_change",
        resourceType: "user",
        resourceId: req.userId!,
        detailJson: { message: "User changed password; all sessions revoked." },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] as string,
      },
    });

    // Notify user of security event
    await notificationService.createNotification({
      userId: req.userId!,
      type: "SECURITY_EVENT",
      title: "Security Alert: Password Changed",
      message: "Your account password was successfully changed. All active sessions have been signed out.",
      entityType: "USER",
      entityId: req.userId!,
    });

    return res.json({
      message: "Password changed successfully. All active sessions have been revoked.",
      revokedSessions: true,
    });
  } catch (error) {
    console.error("[Profile API] Change password error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to change password" } });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /profile/security — User's security overview and login audit trail
// ═══════════════════════════════════════════════════════════════════
router.get("/security", async (req: AuthedRequest, res: Response) => {
  try {
    const [user, activeSessionCount, recentSecurityEvents] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.userId! },
        select: { id: true, email: true, lastLogin: true, createdAt: true },
      }),
      prisma.session.count({
        where: { userId: req.userId!, expiresAt: { gt: new Date() } },
      }),
      prisma.auditLog.findMany({
        where: {
          actorUserId: req.userId!,
          action: {
            in: [
              "auth.login",
              "auth.register",
              "user.change_password",
              "user.password_change",
              "user.profile_update",
              "user.update_profile",
            ],
          },
        },
        select: {
          id: true,
          action: true,
          ipAddress: true,
          userAgent: true,
          timestamp: true,
        },
        orderBy: { timestamp: "desc" },
        take: 10,
      }),
    ]);

    if (!user) {
      return res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User not found" } });
    }

    return res.json({
      userId: user.id,
      email: user.email,
      lastLogin: user.lastLogin,
      accountCreated: user.createdAt,
      activeSessions: activeSessionCount,
      recentEvents: recentSecurityEvents,
    });
  } catch (error) {
    console.error("[Profile API] Get security error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to fetch security overview" } });
  }
});

export default router;
