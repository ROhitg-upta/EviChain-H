import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, AuthedRequest, requireRole } from "../middleware";
import { workspaceService, DEFAULT_WORKSPACE_CONFIG } from "../services/workspace.service";

const router = Router();

const updateWorkspaceConfigSchema = z.object({
  organizationName: z.string().min(2).max(100).optional(),
  unitName: z.string().max(100).nullable().optional(),
  jurisdictionLabel: z.string().max(100).nullable().optional(),
  classificationLabel: z.string().max(100).optional(),
  allowPublicVerification: z.boolean().optional(),
});

// ═══════════════════════════════════════════════════════════════════
// GET /workspace/config — Get Workspace Configuration
// ═══════════════════════════════════════════════════════════════════
router.get("/config", async (_req, res: Response) => {
  try {
    const config = await workspaceService.getWorkspaceConfig();
    return res.json(config);
  } catch (error) {
    console.error("[Workspace API] Get config error:", error);
    return res.status(500).json({ error: "Failed to load workspace config" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PUT /workspace/config — Update Workspace Configuration (Admin only)
// ═══════════════════════════════════════════════════════════════════
router.put(
  "/config",
  requireAuth,
  requireRole("ADMINISTRATOR"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const parsed = updateWorkspaceConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Invalid workspace configuration", details: parsed.error.flatten() },
        });
      }

      const previous = await prisma.systemSetting.findUnique({ where: { key: "SYSTEM_CONFIG" } });
      const prevValue = (previous?.value as object) || DEFAULT_WORKSPACE_CONFIG;

      const merged = {
        ...DEFAULT_WORKSPACE_CONFIG,
        ...prevValue,
        ...parsed.data,
      };

      await prisma.systemSetting.upsert({
        where: { key: "SYSTEM_CONFIG" },
        update: { value: merged },
        create: { key: "SYSTEM_CONFIG", value: merged },
      });

      await prisma.auditLog.create({
        data: {
          actorUserId: req.userId!,
          action: "SYSTEM_SETTINGS_UPDATE",
          resourceType: "system",
          resourceId: "SYSTEM_CONFIG",
          detailJson: { before: prevValue, after: merged, scope: "workspace.config.update" },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"] as string,
        },
      });

      const updated = await workspaceService.getWorkspaceConfig();
      return res.json(updated);
    } catch (error) {
      console.error("[Workspace API] Update config error:", error);
      return res.status(500).json({ error: "Failed to update workspace configuration" });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /workspace/briefing — Comprehensive Operations Briefing
// ═══════════════════════════════════════════════════════════════════
router.get("/briefing", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const briefing = await workspaceService.getWorkspaceBriefing(req.userId!, req.userRole!);
    return res.json(briefing);
  } catch (error) {
    console.error("[Workspace API] Briefing error:", error);
    return res.status(500).json({ error: "Failed to generate workspace operational briefing" });
  }
});

export default router;
