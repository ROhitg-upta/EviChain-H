import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, AuthedRequest, requireRole } from "../middleware";

const router = Router();

// ── Schemas ───────────────────────────────────────────────────────

const createCaseSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters"),
  description: z.string().optional(),
  status: z.string().optional().default("Active"),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional().default("Medium"),
  // leadUserId is optional: falls back to the authenticated user
  leadUserId: z.string().uuid().optional(),
});

const updateCaseSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════
// GET /cases  — list with evidence count and lead user
// ═══════════════════════════════════════════════════════════════════
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const status = req.query.status as string | undefined;

    const cases = await prisma.case.findMany({
      where: status ? { status } : undefined,
      include: {
        lead: { select: { id: true, name: true, role: true } },
        _count: { select: { evidence: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Flatten _count into evidenceCount for convenience
    const payload = cases.map((c) => ({
      ...c,
      evidenceCount: c._count.evidence,
    }));

    return res.json(payload);
  } catch (error) {
    console.error("Case list error:", error);
    return res.status(500).json({ error: "Failed to list cases" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /cases/:id  — full detail with evidence array
// ═══════════════════════════════════════════════════════════════════
router.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = req.params["id"] as string;

    const caseRecord = await prisma.case.findUnique({
      where: { id },
      include: {
        lead: { select: { id: true, name: true, role: true } },
        evidence: {
          orderBy: { createdAt: "desc" },
          include: {
            collectedBy: { select: { id: true, name: true, role: true } },
            custodyEvents: { orderBy: { timestamp: "desc" }, take: 1 },
          },
        },
      },
    });

    if (!caseRecord) {
      return res.status(404).json({ error: "Case not found" });
    }

    return res.json({
      ...caseRecord,
      evidenceCount: caseRecord.evidence.length,
    });
  } catch (error) {
    console.error("Case detail error:", error);
    return res.status(500).json({ error: "Failed to get case" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /cases  — create a new case
// ═══════════════════════════════════════════════════════════════════
router.post(
  "/",
  requireAuth,
  requireRole("ADMINISTRATOR", "INVESTIGATOR"),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = createCaseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      // Use provided leadUserId or fall back to the authenticated user
      const leadUserId = parsed.data.leadUserId ?? req.userId!;

      const caseRecord = await prisma.case.create({
        data: {
          title: parsed.data.title,
          description: parsed.data.description ?? "",
          status: parsed.data.status ?? "Active",
          priority: parsed.data.priority ?? "Medium",
          leadUserId,
        },
        include: {
          lead: { select: { id: true, name: true, role: true } },
        },
      });

      await prisma.auditLog.create({
        data: {
          actorUserId: req.userId!,
          action: "case.create",
          resourceType: "case",
          resourceId: caseRecord.id,
          detailJson: { title: caseRecord.title, status: caseRecord.status },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      return res.status(201).json({ ...caseRecord, evidenceCount: 0 });
    } catch (error) {
      console.error("Case creation error:", error);
      return res.status(500).json({ error: "Failed to create case" });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// PATCH /cases/:id  — partial update
// PUT   /cases/:id  — alias (some clients send PUT)
// ═══════════════════════════════════════════════════════════════════
async function handleUpdate(req: AuthedRequest, res: import("express").Response) {
  try {
    const id = req.params["id"] as string;
    const parsed = updateCaseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const existing = await prisma.case.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Case not found" });
    }

    const caseRecord = await prisma.case.update({
      where: { id },
      data: parsed.data,
      include: {
        lead: { select: { id: true, name: true, role: true } },
        _count: { select: { evidence: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId!,
        action: "case.update",
        resourceType: "case",
        resourceId: id,
        detailJson: parsed.data as object,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    return res.json({ ...caseRecord, evidenceCount: caseRecord._count.evidence });
  } catch (error) {
    console.error("Case update error:", error);
    return res.status(500).json({ error: "Failed to update case" });
  }
}

router.patch(
  "/:id",
  requireAuth,
  requireRole("ADMINISTRATOR", "INVESTIGATOR"),
  handleUpdate,
);

router.put(
  "/:id",
  requireAuth,
  requireRole("ADMINISTRATOR", "INVESTIGATOR"),
  handleUpdate,
);

// ═══════════════════════════════════════════════════════════════════
// POST /cases/:caseId/evidence/:evidenceId  — link evidence to case
// ═══════════════════════════════════════════════════════════════════
router.post(
  "/:caseId/evidence/:evidenceId",
  requireAuth,
  requireRole("ADMINISTRATOR", "INVESTIGATOR"),
  async (req: AuthedRequest, res) => {
    try {
      const caseId = req.params["caseId"] as string;
      const evidenceId = req.params["evidenceId"] as string;

      const evidence = await prisma.evidence.update({
        where: { id: evidenceId },
        data: { caseId },
      });

      await prisma.auditLog.create({
        data: {
          actorUserId: req.userId!,
          action: "case.link_evidence",
          resourceType: "case",
          resourceId: caseId,
          detailJson: { evidenceId },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      return res.json(evidence);
    } catch (error) {
      console.error("Link evidence error:", error);
      return res.status(500).json({ error: "Failed to link evidence to case" });
    }
  },
);

// ── GET /cases/:id/comments ───────────────────────────────────────
router.get("/:id/comments", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const caseId = req.params["id"] as string;

    const comments = await prisma.caseComment.findMany({
      where: { caseId, parentId: null },
      include: {
        user:     { select: { id: true, name: true, email: true } },
        mentions: { include: { mentionedUser: { select: { id: true, name: true } } } },
        replies: {
          include: {
            user:     { select: { id: true, name: true, email: true } },
            mentions: { include: { mentionedUser: { select: { id: true, name: true } } } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Shape mentions into { userId, userName } for the frontend
    type RawMention = { mentionedUser: { id: string; name: string } };
    const shapeMentions = (ms: RawMention[]) =>
      ms.map((m) => ({ userId: m.mentionedUser.id, userName: m.mentionedUser.name }));

    const shaped = comments.map((c) => ({
      ...c,
      mentions: shapeMentions(c.mentions),
      replies:  c.replies.map((r) => ({
        ...r,
        mentions: shapeMentions(r.mentions),
        replies:  [],
      })),
    }));

    return res.json(shaped);
  } catch (error) {
    console.error("Comments list error:", error);
    return res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// ── POST /cases/:id/comments ──────────────────────────────────────
router.post("/:id/comments", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { content, mentions, parentId } = req.body as {
      content:  string;
      mentions: { userId: string; userName: string }[];
      parentId: string | null;
    };

    if (!content || typeof content !== "string") {
      return res.status(400).json({ error: "content is required" });
    }

    const comment = await prisma.caseComment.create({
      data: {
        caseId:   req.params["id"] as string,
        userId:   req.userId!,        content,
        parentId: parentId ?? null,
      },
      include: {
        user:     { select: { id: true, name: true, email: true } },
        mentions: true,
      },
    });

    // Create mention records
    if (Array.isArray(mentions)) {
      for (const m of mentions) {
        const mentioned = await prisma.user.findFirst({
          where: { name: { contains: m.userName, mode: "insensitive" } },
        });
        if (mentioned) {
          await prisma.commentMention.create({
            data: { commentId: comment.id, userId: mentioned.id },
          });
        }
      }
    }

    await prisma.auditLog.create({
      data: {
        actorUserId:  req.userId!,
        action:       "case.comment",
        resourceType: "case",
        resourceId:   req.params["id"] as string,
        detailJson:   { preview: content.slice(0, 80) },
        ipAddress:    req.ip,
        userAgent:    req.headers["user-agent"],
      },
    });

    return res.status(201).json({
      ...comment,
      mentions: [],
      replies:  [],
    });
  } catch (error) {
    console.error("Comment create error:", error);
    return res.status(500).json({ error: "Failed to create comment" });
  }
});

export default router;
