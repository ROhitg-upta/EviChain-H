import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, AuthedRequest, requireRole } from "../middleware";
import { hashPassword } from "../auth";

const router = Router();

const updateUserSchema = z.object({
  name:  z.string().min(2).optional(),
  role:  z.enum(["ADMINISTRATOR", "INVESTIGATOR", "AUDITOR", "CUSTODIAN"]).optional(),
  email: z.string().email().optional(),
});

// ── GET /users  — list all users (admin only) ──────────────────────
router.get(
  "/",
  requireAuth,
  requireRole("ADMINISTRATOR"),
  async (_req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id:        true,
          email:     true,
          name:      true,
          role:      true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return res.json(users);
    } catch (error) {
      console.error("Users list error:", error);
      return res.status(500).json({ error: "Failed to fetch users" });
    }
  },
);

// ── GET /users/me  — current authenticated user ───────────────────
router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: {
        id:        true,
        email:     true,
        name:      true,
        role:      true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json(user);
  } catch (error) {
    console.error("Get me error:", error);
    return res.status(500).json({ error: "Failed to fetch user" });
  }
});

// ── PATCH /users/me  — update own profile ─────────────────────────
router.patch("/me", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = z.object({
      name: z.string().min(2).optional(),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const user = await prisma.user.update({
      where: { id: req.userId! },
      data:  parsed.data,
      select: { id: true, email: true, name: true, role: true, updatedAt: true },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId:  req.userId!,
        action:       "user.update_profile",
        resourceType: "user",
        resourceId:   req.userId!,
        detailJson:   parsed.data as object,
        ipAddress:    req.ip,
        userAgent:    req.headers["user-agent"],
      },
    });

    return res.json(user);
  } catch (error) {
    console.error("Update me error:", error);
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

// ── PATCH /users/me/password  — change own password ───────────────
router.patch("/me/password", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = z.object({
      currentPassword: z.string().min(1),
      newPassword:     z.string().min(8),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const { verifyPassword } = await import("../auth");
    const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

    const newHash = await hashPassword(parsed.data.newPassword);
    await prisma.user.update({
      where: { id: req.userId! },
      data:  { passwordHash: newHash },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId:  req.userId!,
        action:       "user.change_password",
        resourceType: "user",
        resourceId:   req.userId!,
        detailJson:   {},
        ipAddress:    req.ip,
        userAgent:    req.headers["user-agent"],
      },
    });

    return res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ error: "Failed to change password" });
  }
});

// ── GET /users/:id  — get a specific user (admin only) ────────────
router.get(
  "/:id",
  requireAuth,
  requireRole("ADMINISTRATOR"),
  async (req: AuthedRequest, res) => {
    try {
      const id = req.params["id"] as string;
      const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
      });

      if (!user) return res.status(404).json({ error: "User not found" });
      return res.json(user);
    } catch (error) {
      console.error("Get user error:", error);
      return res.status(500).json({ error: "Failed to fetch user" });
    }
  },
);

// ── PATCH /users/:id  — update any user (admin only) ──────────────
router.patch(
  "/:id",
  requireAuth,
  requireRole("ADMINISTRATOR"),
  async (req: AuthedRequest, res) => {
    try {
      const id     = req.params["id"] as string;
      const parsed = updateUserSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "User not found" });

      const user = await prisma.user.update({
        where: { id },
        data:  parsed.data,
        select: { id: true, email: true, name: true, role: true, updatedAt: true },
      });

      await prisma.auditLog.create({
        data: {
          actorUserId:  req.userId!,
          action:       "user.admin_update",
          resourceType: "user",
          resourceId:   id,
          detailJson:   parsed.data as object,
          ipAddress:    req.ip,
          userAgent:    req.headers["user-agent"],
        },
      });

      return res.json(user);
    } catch (error) {
      console.error("Update user error:", error);
      return res.status(500).json({ error: "Failed to update user" });
    }
  },
);

// ── DELETE /users/:id  — delete a user (admin only) ───────────────
router.delete(
  "/:id",
  requireAuth,
  requireRole("ADMINISTRATOR"),
  async (req: AuthedRequest, res) => {
    try {
      const id = req.params["id"] as string;

      if (id === req.userId) {
        return res.status(400).json({ error: "You cannot delete your own account." });
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "User not found" });

      // Last-admin guard — prevent deleting the only administrator
      if (existing.role === "ADMINISTRATOR") {
        const adminCount = await prisma.user.count({ where: { role: "ADMINISTRATOR" } });
        if (adminCount <= 1) {
          return res.status(400).json({
            error: "Cannot delete the last administrator account. Promote another user first.",
          });
        }
      }

      await prisma.user.delete({ where: { id } });

      await prisma.auditLog.create({
        data: {
          actorUserId:  req.userId!,
          action:       "user.delete",
          resourceType: "user",
          resourceId:   id,
          detailJson:   { email: existing.email, name: existing.name },
          ipAddress:    req.ip,
          userAgent:    req.headers["user-agent"],
        },
      });

      return res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Delete user error:", error);
      return res.status(500).json({ error: "Failed to delete user" });
    }
  },
);

// ── GET /users/me/notification-preferences ────────────────────────
router.get("/me/notification-preferences", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId: req.userId! },
    });

    if (!prefs) {
      // Return defaults if no record exists yet
      return res.json({
        evidenceUploads: true,
        caseUpdates:     true,
        systemAlerts:    true,
        weeklyDigest:    false,
      });
    }

    return res.json({
      evidenceUploads: prefs.evidenceUploads,
      caseUpdates:     prefs.caseUpdates,
      systemAlerts:    prefs.systemAlerts,
      weeklyDigest:    prefs.weeklyDigest,
    });
  } catch (error) {
    console.error("Get prefs error:", error);
    return res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

// ── PUT /users/me/notification-preferences ────────────────────────
router.put("/me/notification-preferences", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const schema = z.object({
      evidenceUploads: z.boolean().optional(),
      caseUpdates:     z.boolean().optional(),
      systemAlerts:    z.boolean().optional(),
      weeklyDigest:    z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const prefs = await prisma.notificationPreference.upsert({
      where:  { userId: req.userId! },
      update: parsed.data,
      create: {
        userId:          req.userId!,
        evidenceUploads: parsed.data.evidenceUploads ?? true,
        caseUpdates:     parsed.data.caseUpdates     ?? true,
        systemAlerts:    parsed.data.systemAlerts    ?? true,
        weeklyDigest:    parsed.data.weeklyDigest    ?? false,
      },
    });

    return res.json({
      evidenceUploads: prefs.evidenceUploads,
      caseUpdates:     prefs.caseUpdates,
      systemAlerts:    prefs.systemAlerts,
      weeklyDigest:    prefs.weeklyDigest,
    });
  } catch (error) {
    console.error("Update prefs error:", error);
    return res.status(500).json({ error: "Failed to update preferences" });
  }
});

export default router;
