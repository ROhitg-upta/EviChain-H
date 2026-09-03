import { Router } from "express";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { prisma, normalizePrismaError } from "../db";
import { requireAuth, AuthedRequest, requireRole } from "../middleware";
import { notificationService } from "../services/notification.service";
import { generateCaseSummaryPdf } from "../services/pdf.service";

import multer from "multer";
import { env } from "../config/env";
import { processEvidenceUpload, UploadError } from "../services/evidence-upload.service";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_BYTES },
});


// ── Schemas ───────────────────────────────────────────────────────
const createCaseSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters"),
  description: z.string().optional(),
  status: z.string().optional().default("Active"),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional().default("Medium"),
  leadUserId: z.string().uuid().optional(),
});

const updateCaseSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════
// GET /cases  — list with evidence count, lead user, and filters
// ═══════════════════════════════════════════════════════════════════
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const status = req.query["status"] as string | undefined;
    const priority = req.query["priority"] as string | undefined;
    const q = req.query["q"] as string | undefined;

    const where: import("@prisma/client").Prisma.CaseWhereInput = {};

    if (status && status !== "ALL") {
      where.status = { equals: status, mode: "insensitive" };
    }

    if (priority && priority !== "ALL") {
      where.priority = { equals: priority, mode: "insensitive" };
    }

    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { title: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
      ];
    }

    const cases = await prisma.case.findMany({
      where,
      include: {
        lead: { select: { id: true, name: true, role: true } },
        _count: { select: { evidence: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const payload = cases.map((c) => ({
      ...c,
      evidenceCount: c._count.evidence,
    }));

    return res.json(payload);
  } catch (error) {
    const norm = normalizePrismaError(error);
    return res.status(norm.statusCode).json({ error: norm.message });
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
      return res.status(404).json({ error: "Case not found", code: "CASE_NOT_FOUND" });
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

      await notificationService.createNotification({
        userId: req.userId!,
        type: "CASE_CREATED",
        title: "Case Created",
        message: `Created case "${caseRecord.title}".`,
        link: `/cases/${caseRecord.id}`,
        entityType: "CASE",
        entityId: caseRecord.id,
        dedupeKey: `CASE_CREATED:${caseRecord.id}:${req.userId!}`,
      });

      if (leadUserId !== req.userId!) {
        await notificationService.createNotification({
          userId: leadUserId,
          type: "CASE_CREATED",
          title: "Assigned as Case Lead",
          message: `You were assigned as lead investigator for "${caseRecord.title}".`,
          link: `/cases/${caseRecord.id}`,
          entityType: "CASE",
          entityId: caseRecord.id,
          dedupeKey: `CASE_CREATED:${caseRecord.id}:${leadUserId}`,
        });
      }

      return res.status(201).json({ ...caseRecord, evidenceCount: 0 });
    } catch (error) {
      console.error("Case creation error:", error);
      return res.status(500).json({ error: "Failed to create case" });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// PATCH /cases/:id  — partial update
// PUT   /cases/:id  — alias
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
// DELETE /cases/:id  — safe case removal (Admin only)
// ═══════════════════════════════════════════════════════════════════
router.delete(
  "/:id",
  requireAuth,
  requireRole("ADMINISTRATOR"),
  async (req: AuthedRequest, res) => {
    try {
      const id = req.params["id"] as string;

      const existing = await prisma.case.findUnique({
        where: { id },
        include: { _count: { select: { evidence: true } } },
      });

      if (!existing) {
        return res.status(404).json({ error: "Case not found" });
      }

      await prisma.$transaction([
        prisma.evidence.updateMany({
          where: { caseId: id },
          data: { caseId: null },
        }),
        prisma.commentMention.deleteMany({
          where: { comment: { caseId: id } },
        }),
        prisma.caseComment.deleteMany({
          where: { caseId: id },
        }),
        prisma.case.delete({
          where: { id },
        }),
        prisma.auditLog.create({
          data: {
            actorUserId: req.userId!,
            action: "case.delete",
            resourceType: "case",
            resourceId: id,
            detailJson: { title: existing.title, unlinkedEvidenceCount: existing._count.evidence },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
          },
        }),
      ]);

      return res.json({
        message: "Case deleted successfully",
        id,
      });
    } catch (error) {
      const norm = normalizePrismaError(error);
      return res.status(norm.statusCode).json({ error: norm.message });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// POST /cases/:caseId/evidence — Upload & register evidence for a case
// ═══════════════════════════════════════════════════════════════════
router.post(
  "/:caseId/evidence",
  requireAuth,
  requireRole("ADMINISTRATOR", "INVESTIGATOR"),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ code: "FILE_TOO_LARGE", error: "File size exceeds configured limit." });
        }
        return res.status(400).json({ code: "UPLOAD_ERROR", error: `Upload error: ${err.message}` });
      }
      if (err instanceof Error) {
        return res.status(400).json({ code: "UPLOAD_ERROR", error: err.message });
      }
      next();
    });
  },
  async (req: AuthedRequest, res) => {
    try {
      const caseId = req.params["caseId"] as string;

      if (!req.file) {
        return res.status(400).json({ code: "FILE_REQUIRED", error: "No file payload provided." });
      }

      const evidence = await processEvidenceUpload({
        file: req.file,
        caseId,
        uploaderId: req.userId!,
        name: typeof req.body.name === "string" ? req.body.name : undefined,
        type: typeof req.body.evidenceType === "string" ? req.body.evidenceType : typeof req.body.type === "string" ? req.body.type : undefined,
        ownerOrg: typeof req.body.ownerOrg === "string" ? req.body.ownerOrg : undefined,
        description: typeof req.body.description === "string" ? req.body.description : undefined,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      return res.status(201).json(evidence);
    } catch (err: unknown) {
      if (err instanceof UploadError) {
        return res.status(err.statusCode).json({ code: err.code, error: err.message });
      }
      const norm = normalizePrismaError(err);
      return res.status(norm.statusCode).json({ code: norm.code || "INTERNAL_ERROR", error: norm.message });
    }
  },
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
        userId:   req.userId!,
        content,
        parentId: parentId ?? null,
      },
      include: {
        user:     { select: { id: true, name: true, email: true } },
        mentions: true,
      },
    });

    if (Array.isArray(mentions)) {
      for (const m of mentions) {
        const mentioned = await prisma.user.findFirst({
          where: { name: { contains: m.userName, mode: "insensitive" } },
        });
        if (mentioned) {
          await prisma.commentMention.create({
            data: { commentId: comment.id, userId: mentioned.id },
          });

          await notificationService.emitNotification(mentioned.id, {
            type: "mention",
            title: "Mentioned in Case",
            message: `${comment.user.name} mentioned you in a case comment: "${content.slice(0, 50)}${content.length > 50 ? "…" : ""}"`,
            link: `/cases/${req.params["id"]}`,
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

// ═══════════════════════════════════════════════════════════════════
// GET /cases/:id/summary.pdf, /:id/export/pdf, /:id/pdf — PDF Report
// ═══════════════════════════════════════════════════════════════════
router.get(["/:id/summary.pdf", "/:id/export/pdf", "/:id/pdf"], requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = req.params["id"] as string;

    const caseRecord = await prisma.case.findUnique({
      where: { id },
      include: {
        lead: { select: { id: true, name: true, email: true, role: true } },
        evidence: {
          orderBy: { createdAt: "desc" },
          include: {
            collectedBy: { select: { name: true } },
            currentCustodian: { select: { name: true } },
          },
        },
      },
    });

    if (!caseRecord) {
      return res.status(404).json({
        error: { code: "CASE_NOT_FOUND", message: "Case not found", status: 404 },
      });
    }

    // Role check for Investigators
    if (req.userRole === "INVESTIGATOR" && caseRecord.leadUserId !== req.userId) {
      const holdsEvidence = caseRecord.evidence.some(
        (e) => e.collectedById === req.userId || e.currentCustodianId === req.userId,
      );
      if (!holdsEvidence) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "You are not authorized to export reports for this case", status: 403 },
        });
      }
    }

    const evidenceIds = caseRecord.evidence.map((e) => e.id);
    const custodyEvents = await prisma.custodyEvent.findMany({
      where: { evidenceId: { in: evidenceIds } },
      include: {
        actor: { select: { name: true, role: true } },
      },
      orderBy: { timestamp: "desc" },
      take: 20,
    });

    const pdfBuffer = await generateCaseSummaryPdf({
      id: caseRecord.id,
      title: caseRecord.title,
      description: caseRecord.description,
      status: caseRecord.status,
      priority: caseRecord.priority,
      createdAt: caseRecord.createdAt,
      updatedAt: caseRecord.updatedAt,
      lead: caseRecord.lead,
      evidence: caseRecord.evidence,
      custodyEvents,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Case-Summary-${caseRecord.id.slice(0, 8)}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Case PDF error:", error);
    return res.status(500).json({
      error: { code: "PDF_ERROR", message: "Failed to generate case PDF summary", status: 500 },
    });
  }
});

export default router;
