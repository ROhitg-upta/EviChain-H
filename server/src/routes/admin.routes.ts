import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, AuthedRequest, requireRole } from "../middleware";
import { hashPassword } from "../auth";
import { notificationService } from "../services/notification.service";

const router = Router();

// All routes under /admin require requireAuth and ADMINISTRATOR role
router.use(requireAuth, requireRole("ADMINISTRATOR"));

const createUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMINISTRATOR", "INVESTIGATOR", "AUDITOR", "CUSTODIAN"]),
});

const updateRoleSchema = z.object({
  role: z.enum(["ADMINISTRATOR", "INVESTIGATOR", "AUDITOR", "CUSTODIAN"]),
});

const updateStatusSchema = z.object({
  isActive: z.boolean(),
});

const settingsSchema = z.object({
  organizationName: z.string().min(2).max(100).optional(),
  unitName: z.string().max(100).nullable().optional(),
  jurisdictionLabel: z.string().max(100).nullable().optional(),
  classificationLabel: z.string().max(100).optional(),
  retentionPolicyDays: z.number().int().min(30).max(3650).optional(),
  requireMfa: z.boolean().optional(),
  allowPublicVerification: z.boolean().optional(),
  sessionTimeoutMinutes: z.number().int().min(15).max(1440).optional(),
});

const DEFAULT_SETTINGS = {
  organizationName: "EviChain Forensic Division",
  unitName: null,
  jurisdictionLabel: null,
  classificationLabel: "AUTHORIZED ACCESS ONLY",
  retentionPolicyDays: 365,
  requireMfa: false,
  allowPublicVerification: true,
  sessionTimeoutMinutes: 60,
};

// ═══════════════════════════════════════════════════════════════════
// GET /admin/users — Paginated User List
// ═══════════════════════════════════════════════════════════════════
router.get("/users", async (req: AuthedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || "20"), 10) || 20));
    const role = req.query.role as string | undefined;
    const status = req.query.status as string | undefined;
    const q = req.query.q !== undefined ? String(req.query.q).trim() : "";

    const whereAnd: Array<Record<string, unknown>> = [];

    if (role && ["ADMINISTRATOR", "INVESTIGATOR", "AUDITOR", "CUSTODIAN"].includes(role.toUpperCase())) {
      whereAnd.push({ role: role.toUpperCase() });
    }

    if (status) {
      if (status === "active") whereAnd.push({ isActive: true });
      else if (status === "inactive") whereAnd.push({ isActive: false });
    }

    if (q) {
      whereAnd.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    const where = whereAnd.length > 0 ? { AND: whereAnd } : {};

    const [totalItems, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
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
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / pageSize) || 0;

    return res.json({
      items: users,
      users,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
    });
  } catch (error) {
    console.error("[Admin API] Get users error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to fetch users" } });
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /admin/users — Create a new user
// ═══════════════════════════════════════════════════════════════════
router.post("/users", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid user data", details: parsed.error.flatten() },
      });
    }

    const { email, password, name, role } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({
        error: { code: "EMAIL_EXISTS", message: "A user with this email address already exists." },
      });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId!,
        action: "user.create",
        resourceType: "user",
        resourceId: user.id,
        detailJson: { email: user.email, name: user.name, role: user.role },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] as string,
      },
    });

    return res.status(201).json({
      message: "User created successfully",
      user,
    });
  } catch (error) {
    console.error("[Admin API] Create user error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to create user" } });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PATCH /admin/users/:id/role — Change user role
// ═══════════════════════════════════════════════════════════════════
router.patch("/users/:id/role", async (req: AuthedRequest, res: Response) => {
  try {
    const id = req.params["id"] as string;
    const parsed = updateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid role specified", details: parsed.error.flatten() },
      });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        error: { code: "USER_NOT_FOUND", message: "User not found" },
      });
    }

    // Last administrator lockout & self-demotion guard
    if (existing.role === "ADMINISTRATOR" && parsed.data.role !== "ADMINISTRATOR") {
      const adminCount = await prisma.user.count({ where: { role: "ADMINISTRATOR", isActive: true } });
      if (adminCount <= 1 || id === req.userId) {
        return res.status(400).json({
          error: {
            code: "LAST_ADMIN_LOCKOUT",
            message: id === req.userId
              ? "Administrators cannot demote their own account clearance."
              : "Cannot demote the last remaining active administrator account. Promote another user first.",
          },
        });
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role: parsed.data.role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId!,
        action: "user.role_change",
        resourceType: "user",
        resourceId: id,
        detailJson: { oldRole: existing.role, newRole: updated.role },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] as string,
      },
    });

    // Notify affected user
    await notificationService.createNotification({
      userId: id,
      type: "SECURITY_EVENT",
      title: "Access Role Updated",
      message: `Your clearance role was updated from ${existing.role} to ${updated.role} by an Administrator.`,
      entityType: "USER",
      entityId: id,
    });

    return res.json({
      message: "Role updated successfully",
      user: updated,
    });
  } catch (error) {
    console.error("[Admin API] Update role error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to update user role" } });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PATCH /admin/users/:id/status — Activate or Deactivate user
// ═══════════════════════════════════════════════════════════════════
router.patch("/users/:id/status", async (req: AuthedRequest, res: Response) => {
  try {
    const id = req.params["id"] as string;
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid status specified", details: parsed.error.flatten() },
      });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        error: { code: "USER_NOT_FOUND", message: "User not found" },
      });
    }

    // Last administrator deactivation & self-deactivation guard
    if (existing.role === "ADMINISTRATOR" && !parsed.data.isActive) {
      const activeAdminCount = await prisma.user.count({ where: { role: "ADMINISTRATOR", isActive: true } });
      if (activeAdminCount <= 1 || id === req.userId) {
        return res.status(400).json({
          error: {
            code: "LAST_ADMIN_LOCKOUT",
            message: id === req.userId
              ? "Administrators cannot deactivate their own account."
              : "Cannot deactivate the last remaining active administrator account.",
          },
        });
      }
    }

    // If deactivating, revoke all active sessions immediately
    if (!parsed.data.isActive) {
      await prisma.session.deleteMany({ where: { userId: id } });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: parsed.data.isActive },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    const action = parsed.data.isActive ? "user.reactivate" : "user.deactivate";
    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId!,
        action,
        resourceType: "user",
        resourceId: id,
        detailJson: { isActive: parsed.data.isActive },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] as string,
      },
    });

    return res.json({
      message: `User ${parsed.data.isActive ? "reactivated" : "deactivated"} successfully`,
      user: updated,
    });
  } catch (error) {
    console.error("[Admin API] Update status error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to update user status" } });
  }
});

// ═══════════════════════════════════════════════════════════════════
// DELETE /admin/users/:id — Hard delete a user with last-admin guard
// ═══════════════════════════════════════════════════════════════════
router.delete("/users/:id", async (req: AuthedRequest, res: Response) => {
  try {
    const id = req.params["id"] as string;

    if (id === req.userId) {
      return res.status(400).json({
        error: { code: "SELF_DELETE_FORBIDDEN", message: "You cannot delete your own account." },
      });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        error: { code: "USER_NOT_FOUND", message: "User not found" },
      });
    }

    if (existing.role === "ADMINISTRATOR") {
      const adminCount = await prisma.user.count({ where: { role: "ADMINISTRATOR" } });
      if (adminCount <= 1) {
        return res.status(400).json({
          error: {
            code: "LAST_ADMIN_LOCKOUT",
            message: "Cannot delete the last administrator account. Promote another user first.",
          },
        });
      }
    }

    // Cascade remove dependent records or delete user cleanly
    await prisma.session.deleteMany({ where: { userId: id } });
    await prisma.notification.deleteMany({ where: { userId: id } });
    await prisma.notificationPreference.deleteMany({ where: { userId: id } });
    await prisma.searchPreset.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId!,
        action: "user.delete",
        resourceType: "user",
        resourceId: id,
        detailJson: { email: existing.email, name: existing.name },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] as string,
      },
    });

    return res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("[Admin API] Delete user error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to delete user" } });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /admin/settings — Get System Settings
// ═══════════════════════════════════════════════════════════════════
router.get("/settings", async (_req: AuthedRequest, res: Response) => {
  try {
    const dbSettings = await prisma.systemSetting.findUnique({
      where: { key: "SYSTEM_CONFIG" },
    });

    if (!dbSettings) {
      return res.json(DEFAULT_SETTINGS);
    }

    return res.json({
      ...DEFAULT_SETTINGS,
      ...(dbSettings.value as object),
    });
  } catch (error) {
    console.error("[Admin API] Get settings error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to load system settings" } });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PUT /admin/settings — Update System Settings
// ═══════════════════════════════════════════════════════════════════
router.put("/settings", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid settings data", details: parsed.error.flatten() },
      });
    }

    const previous = await prisma.systemSetting.findUnique({ where: { key: "SYSTEM_CONFIG" } });
    const prevValue = (previous?.value as object) || DEFAULT_SETTINGS;

    const merged = {
      ...DEFAULT_SETTINGS,
      ...prevValue,
      ...parsed.data,
    };

    const saved = await prisma.systemSetting.upsert({
      where: { key: "SYSTEM_CONFIG" },
      update: { value: merged },
      create: { key: "SYSTEM_CONFIG", value: merged },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId!,
        action: "settings.update",
        resourceType: "system",
        resourceId: "SYSTEM_CONFIG",
        detailJson: { before: prevValue, after: merged },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] as string,
      },
    });

    return res.json({
      message: "System settings saved successfully",
      settings: saved.value,
    });
  } catch (error) {
    console.error("[Admin API] Update settings error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to update system settings" } });
  }
});

export default router;
