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

      const idempotencyKey =
        (req.headers["idempotency-key"] as string) ||
        (typeof req.body.idempotencyKey === "string" ? req.body.idempotencyKey : undefined);

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
        idempotencyKey,
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

// ── Case Access & Mention Validation Helpers ──────────────────────
async function getAuthorizedCase(caseId: string, userId?: string, userRole?: string) {
  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      lead: { select: { id: true, name: true, role: true, email: true } },
      evidence: { select: { id: true, name: true, collectedById: true, currentCustodianId: true } },
    },
  });

  if (!caseRecord) {
    return { errorStatus: 404, errorMessage: "Case not found", caseRecord: null };
  }

  if (!userId || !userRole) {
    return { errorStatus: 401, errorMessage: "Unauthorized", caseRecord: null };
  }

  if (userRole === "ADMINISTRATOR" || userRole === "AUDITOR") {
    return { errorStatus: 0, errorMessage: "", caseRecord };
  }

  if (userRole === "INVESTIGATOR") {
    if (caseRecord.leadUserId === userId) {
      return { errorStatus: 0, errorMessage: "", caseRecord };
    }
    const holdsEvidence = caseRecord.evidence.some(
      (e) => e.collectedById === userId || e.currentCustodianId === userId,
    );
    if (holdsEvidence) {
      return { errorStatus: 0, errorMessage: "", caseRecord };
    }
    return { errorStatus: 403, errorMessage: "You are not authorized to access this case", caseRecord: null };
  }

  if (userRole === "CUSTODIAN") {
    const holdsEvidence = caseRecord.evidence.some(
      (e) => e.collectedById === userId || e.currentCustodianId === userId,
    );
    if (holdsEvidence) {
      return { errorStatus: 0, errorMessage: "", caseRecord };
    }
  }

  return { errorStatus: 403, errorMessage: "Insufficient permissions for this case", caseRecord: null };
}

function userHasCaseAccess(
  user: { id: string; role: string; isActive?: boolean },
  caseRecord: { leadUserId: string; evidence: { collectedById: string; currentCustodianId: string | null }[] },
): boolean {
  if (user.isActive === false) return false;
  if (user.role === "ADMINISTRATOR" || user.role === "AUDITOR") return true;
  if (user.role === "INVESTIGATOR") {
    if (caseRecord.leadUserId === user.id) return true;
    return caseRecord.evidence.some(
      (e) => e.collectedById === user.id || e.currentCustodianId === user.id,
    );
  }
  if (user.role === "CUSTODIAN") {
    return caseRecord.evidence.some(
      (e) => e.collectedById === user.id || e.currentCustodianId === user.id,
    );
  }
  return false;
}

// ── GET /cases/:id/mention-candidates ─────────────────────────────
router.get("/:id/mention-candidates", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const caseId = req.params["id"] as string;
    const authCheck = await getAuthorizedCase(caseId, req.userId, req.userRole);
    if (authCheck.errorStatus > 0 || !authCheck.caseRecord) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const caseRecord = authCheck.caseRecord;

    // Fetch active users in system
    const activeUsers = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true, email: true, isActive: true },
      orderBy: { name: "asc" },
    });

    // Filter to only those with case access
    const candidates = activeUsers.filter((u) => userHasCaseAccess(u, caseRecord));

    return res.json(candidates.map((c) => ({ id: c.id, name: c.name, role: c.role, email: c.email })));
  } catch (error) {
    console.error("Mention candidates error:", error);
    return res.status(500).json({ error: "Failed to fetch mention candidates" });
  }
});

// ── GET /cases/:id/comments ───────────────────────────────────────
router.get("/:id/comments", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const caseId = req.params["id"] as string;
    const authCheck = await getAuthorizedCase(caseId, req.userId, req.userRole);
    if (authCheck.errorStatus > 0 || !authCheck.caseRecord) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const comments = await prisma.caseComment.findMany({
      where: { caseId, parentId: null, deletedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        mentions: { include: { mentionedUser: { select: { id: true, name: true, role: true } } } },
        replies: {
          where: { deletedAt: null },
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
            mentions: { include: { mentionedUser: { select: { id: true, name: true, role: true } } } },
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
      replies: c.replies.map((r) => ({
        ...r,
        mentions: shapeMentions(r.mentions),
        replies: [],
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
    const caseId = req.params["id"] as string;

    if (req.userRole === "AUDITOR") {
      return res.status(403).json({ error: "Auditors have read-only access and cannot post comments" });
    }

    const authCheck = await getAuthorizedCase(caseId, req.userId, req.userRole);
    if (authCheck.errorStatus > 0 || !authCheck.caseRecord) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const caseRecord = authCheck.caseRecord;

    const bodyContent = req.body.content ?? req.body.body;
    const parentId = (req.body.parentId ?? req.body.parentCommentId ?? null) as string | null;
    const clientMentions = req.body.mentions;

    if (!bodyContent || typeof bodyContent !== "string" || !bodyContent.trim()) {
      return res.status(400).json({ error: "content is required" });
    }

    const trimmedContent = bodyContent.trim();

    // Verify parent comment exists if replying
    if (parentId) {
      const parentComment = await prisma.caseComment.findFirst({
        where: { id: parentId, caseId, deletedAt: null },
      });
      if (!parentComment) {
        return res.status(404).json({ error: "Parent comment not found" });
      }
    }

    // Extract potential mentions from text (@name or @[name](id)) or client-supplied mentions
    const mentionedUserIdsToNotify = new Set<string>();

    // 1. Process client supplied mentions if any
    if (Array.isArray(clientMentions)) {
      for (const m of clientMentions) {
        const uId = typeof m === "string" ? m : m?.userId;
        const uName = typeof m === "object" ? m?.userName : undefined;
        if (uId) {
          const user = await prisma.user.findUnique({
            where: { id: uId },
            select: { id: true, role: true, isActive: true },
          });
          if (user && userHasCaseAccess(user, caseRecord) && user.id !== req.userId) {
            mentionedUserIdsToNotify.add(user.id);
          }
        } else if (uName) {
          const user = await prisma.user.findFirst({
            where: { name: { contains: uName, mode: "insensitive" }, isActive: true },
            select: { id: true, role: true, isActive: true },
          });
          if (user && userHasCaseAccess(user, caseRecord) && user.id !== req.userId) {
            mentionedUserIdsToNotify.add(user.id);
          }
        }
      }
    }

    // 2. Parse @[Name](UUID) or @Name patterns from comment text
    const bracketMatches = [...trimmedContent.matchAll(/@\[([^\]]+)\]\(([^)]+)\)/g)];
    for (const match of bracketMatches) {
      const candidateId = match[2];
      const user = await prisma.user.findUnique({
        where: { id: candidateId },
        select: { id: true, role: true, isActive: true },
      });
      if (user && userHasCaseAccess(user, caseRecord) && user.id !== req.userId) {
        mentionedUserIdsToNotify.add(user.id);
      }
    }

    const rawNameMatches = [...trimmedContent.matchAll(/@([a-zA-Z0-9_\-.\s]{2,30})/g)];
    for (const match of rawNameMatches) {
      const nameCandidate = match[1]?.trim();
      if (nameCandidate && nameCandidate.length >= 2) {
        const user = await prisma.user.findFirst({
          where: { name: { equals: nameCandidate, mode: "insensitive" }, isActive: true },
          select: { id: true, role: true, isActive: true },
        });
        if (user && userHasCaseAccess(user, caseRecord) && user.id !== req.userId) {
          mentionedUserIdsToNotify.add(user.id);
        }
      }
    }

    // Execute atomic creation of comment, mentions, notifications, and audit log
    const comment = await prisma.$transaction(async (tx) => {
      const newComment = await tx.caseComment.create({
        data: {
          caseId,
          userId: req.userId!,
          content: trimmedContent,
          parentId,
        },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      for (const targetUserId of mentionedUserIdsToNotify) {
        await tx.commentMention.create({
          data: {
            commentId: newComment.id,
            userId: targetUserId,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: req.userId!,
          action: "case.comment.create",
          resourceType: "case",
          resourceId: caseId,
          detailJson: {
            commentId: newComment.id,
            parentId,
            preview: trimmedContent.slice(0, 100),
            mentionCount: mentionedUserIdsToNotify.size,
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      return newComment;
    });

    // Dispatch notifications to verified mentioned users
    for (const targetUserId of mentionedUserIdsToNotify) {
      await notificationService.createNotification({
        userId: targetUserId,
        type: "mention",
        title: "Mentioned in Case",
        message: `${comment.user.name} mentioned you in case "${caseRecord.title}": "${trimmedContent.slice(0, 60)}${trimmedContent.length > 60 ? "…" : ""}"`,
        link: `/cases/${caseId}`,
        entityType: "CASE",
        entityId: caseId,
        metadataJson: { caseId, commentId: comment.id },
        dedupeKey: `MENTION:${comment.id}:${targetUserId}`,
      });
    }

    return res.status(201).json({
      ...comment,
      mentions: Array.from(mentionedUserIdsToNotify).map((uId) => ({ userId: uId, userName: "" })),
      replies: [],
    });
  } catch (error) {
    console.error("Comment create error:", error);
    return res.status(500).json({ error: "Failed to create comment" });
  }
});

// ── PATCH /cases/:id/comments/:commentId ──────────────────────────
router.patch("/:id/comments/:commentId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const caseId = req.params["id"] as string;
    const commentId = req.params["commentId"] as string;

    if (req.userRole === "AUDITOR") {
      return res.status(403).json({ error: "Auditors have read-only access and cannot edit comments" });
    }

    const authCheck = await getAuthorizedCase(caseId, req.userId, req.userRole);
    if (authCheck.errorStatus > 0 || !authCheck.caseRecord) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const existing = await prisma.caseComment.findFirst({
      where: { id: commentId, caseId, deletedAt: null },
      include: { user: { select: { id: true, name: true, role: true } } },
    });

    if (!existing) {
      return res.status(404).json({ error: "Comment not found" });
    }

    const bodyContent = req.body.content ?? req.body.body;
    if (!bodyContent || typeof bodyContent !== "string" || !bodyContent.trim()) {
      return res.status(400).json({ error: "content is required" });
    }

    const isAuthor = existing.userId === req.userId;
    const isAdmin = req.userRole === "ADMINISTRATOR";

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: "You can only edit your own comments" });
    }

    const updatedComment = await prisma.caseComment.update({
      where: { id: commentId },
      data: {
        content: bodyContent.trim(),
        editedAt: new Date(),
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId!,
        action: isAdmin && !isAuthor ? "case.comment.moderate" : "case.comment.edit",
        resourceType: "case",
        resourceId: caseId,
        detailJson: {
          commentId,
          originalAuthorId: existing.userId,
          moderated: isAdmin && !isAuthor,
          reason: typeof req.body.reason === "string" ? req.body.reason : undefined,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    return res.json(updatedComment);
  } catch (error) {
    console.error("Comment edit error:", error);
    return res.status(500).json({ error: "Failed to update comment" });
  }
});

// ── DELETE /cases/:id/comments/:commentId ─────────────────────────
router.delete("/:id/comments/:commentId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const caseId = req.params["id"] as string;
    const commentId = req.params["commentId"] as string;

    if (req.userRole === "AUDITOR") {
      return res.status(403).json({ error: "Auditors have read-only access and cannot delete comments" });
    }

    const authCheck = await getAuthorizedCase(caseId, req.userId, req.userRole);
    if (authCheck.errorStatus > 0 || !authCheck.caseRecord) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const existing = await prisma.caseComment.findFirst({
      where: { id: commentId, caseId, deletedAt: null },
      include: { user: { select: { id: true, name: true, role: true } } },
    });

    if (!existing) {
      return res.status(404).json({ error: "Comment not found" });
    }

    const isAuthor = existing.userId === req.userId;
    const isAdmin = req.userRole === "ADMINISTRATOR";

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: "You can only delete your own comments" });
    }

    await prisma.caseComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId!,
        action: isAdmin && !isAuthor ? "case.comment.moderate" : "case.comment.delete",
        resourceType: "case",
        resourceId: caseId,
        detailJson: {
          commentId,
          originalAuthorId: existing.userId,
          action: "soft_delete",
          moderated: isAdmin && !isAuthor,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    return res.json({ success: true, message: "Comment deleted successfully", id: commentId });
  } catch (error) {
    console.error("Comment delete error:", error);
    return res.status(500).json({ error: "Failed to delete comment" });
  }
});

// ── GET /cases/:id/activity ───────────────────────────────────────
router.get("/:id/activity", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const caseId = req.params["id"] as string;
    const authCheck = await getAuthorizedCase(caseId, req.userId, req.userRole);
    if (authCheck.errorStatus > 0 || !authCheck.caseRecord) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const typeFilter = req.query.type as string | undefined;
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || "20"), 10) || 20));

    interface ActivityItem {
      id: string;
      type: "comment" | "annotation" | "custody" | "upload" | "audit";
      eventType?: "comment" | "annotation" | "custody" | "upload" | "audit";
      title: string;
      description: string;
      timestamp: Date;
      actor: { id?: string; name: string; role?: string } | null;
      entityId: string;
      entityType: string;
      metadata?: Record<string, unknown>;
    }

    const activityItems: ActivityItem[] = [];

    // 1. Comments
    if (!typeFilter || typeFilter === "comment" || typeFilter === "all") {
      const comments = await prisma.caseComment.findMany({
        where: { caseId, deletedAt: null },
        include: { user: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      for (const c of comments) {
        activityItems.push({
          id: c.id,
          type: "comment",
          eventType: "comment",
          title: c.parentId ? "Reply added to discussion" : "Comment added to case",
          description: c.content.slice(0, 140),
          timestamp: c.createdAt,
          actor: c.user,
          entityId: c.id,
          entityType: "COMMENT",
          metadata: { parentId: c.parentId, editedAt: c.editedAt },
        });
      }
    }

    // 2. Annotations on evidence in this case
    if (!typeFilter || typeFilter === "annotation" || typeFilter === "all") {
      const annotations = await prisma.evidenceAnnotation.findMany({
        where: { evidence: { caseId }, deletedAt: null },
        include: {
          user: { select: { id: true, name: true, role: true } },
          evidence: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      for (const a of annotations) {
        activityItems.push({
          id: a.id,
          type: "annotation",
          eventType: "annotation",
          title: `Annotation on ${a.evidence.name}`,
          description: a.note || a.text || `Visual markup (${a.type})`,
          timestamp: a.createdAt,
          actor: a.user,
          entityId: a.id,
          entityType: "ANNOTATION",
          metadata: { evidenceId: a.evidenceId, evidenceName: a.evidence.name, type: a.type, pageNumber: a.pageNumber },
        });
      }
    }

    // 3. Custody Events
    if (!typeFilter || typeFilter === "custody" || typeFilter === "all") {
      const custodyEvents = await prisma.custodyEvent.findMany({
        where: { evidence: { caseId } },
        include: {
          actor: { select: { id: true, name: true, role: true } },
          evidence: { select: { id: true, name: true } },
          fromUser: { select: { name: true } },
          toUser: { select: { name: true } },
        },
        orderBy: { timestamp: "desc" },
        take: 100,
      });
      for (const ce of custodyEvents) {
        activityItems.push({
          id: ce.id,
          type: "custody",
          eventType: "custody",
          title: `Custody ${ce.action}: ${ce.evidence.name}`,
          description: ce.note || `Chain of custody event by ${ce.actor.name}`,
          timestamp: ce.timestamp,
          actor: ce.actor,
          entityId: ce.evidenceId,
          entityType: "CUSTODY_EVENT",
          metadata: {
            action: ce.action,
            from: ce.fromUser?.name,
            to: ce.toUser?.name,
            location: ce.toLocation,
          },
        });
      }
    }

    // 4. Evidence Uploads
    if (!typeFilter || typeFilter === "upload" || typeFilter === "all") {
      const evidenceList = await prisma.evidence.findMany({
        where: { caseId },
        include: { collectedBy: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      for (const e of evidenceList) {
        activityItems.push({
          id: e.id,
          type: "upload",
          eventType: "upload",
          title: `Evidence registered: ${e.name}`,
          description: `Format: ${e.type} · SHA-256: ${e.sha256.slice(0, 16)}…`,
          timestamp: e.createdAt,
          actor: e.collectedBy,
          entityId: e.id,
          entityType: "EVIDENCE",
          metadata: { sha256: e.sha256, sizeBytes: e.sizeBytes, status: e.status },
        });
      }
    }

    // 5. Case Audit Events
    if (!typeFilter || typeFilter === "audit" || typeFilter === "all") {
      const audits = await prisma.auditLog.findMany({
        where: { resourceType: "case", resourceId: caseId },
        include: { actor: { select: { id: true, name: true, role: true } } },
        orderBy: { timestamp: "desc" },
        take: 100,
      });
      for (const al of audits) {
        activityItems.push({
          id: al.id,
          type: "audit",
          eventType: "audit",
          title: `Case Log: ${al.action}`,
          description: typeof al.detailJson === "object" ? JSON.stringify(al.detailJson) : "",
          timestamp: al.timestamp,
          actor: al.actor,
          entityId: al.resourceId,
          entityType: "AUDIT_LOG",
          metadata: { action: al.action },
        });
      }
    }

    // Sort all merged activity items chronologically (latest first)
    activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = activityItems.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = activityItems.slice(startIndex, startIndex + pageSize);
    const totalPages = Math.ceil(total / pageSize) || 1;

    return res.json({
      items: paginatedItems,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (error) {
    console.error("Case activity feed error:", error);
    return res.status(500).json({ error: "Failed to fetch case activity feed" });
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
