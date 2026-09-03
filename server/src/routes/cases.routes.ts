import { Router } from "express";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { prisma, normalizePrismaError } from "../db";
import { requireAuth, AuthedRequest, requireRole } from "../middleware";
import { notificationService } from "../services/notification.service";

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

      await notificationService.emitNotification(req.userId!, {
        type: "success",
        title: "Case Created",
        message: `Created case "${caseRecord.title}".`,
        link: `/cases/${caseRecord.id}`,
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
// GET /cases/:id/export/pdf — Case Intelligence Summary PDF
// ═══════════════════════════════════════════════════════════════════
router.get("/:id/export/pdf", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = req.params["id"] as string;

    const caseRecord = await prisma.case.findUnique({
      where: { id },
      include: {
        lead: { select: { name: true, email: true, role: true } },
        evidence: {
          orderBy: { createdAt: "desc" },
          include: { collectedBy: { select: { name: true } } },
        },
      },
    });

    if (!caseRecord) {
      return res.status(404).json({ error: "Case not found" });
    }

    const doc = new PDFDocument({ size: "A4", margins: { top: 40, bottom: 40, left: 45, right: 45 } });
    const buffers: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Case-Summary-${caseRecord.id.slice(0, 8)}.pdf"`,
      );
      res.send(pdfData);
    });

    // Header
    doc.rect(45, 40, 505, 50).fill("#0f845a");
    doc.fillColor("#ffffff").fontSize(15).font("Helvetica-Bold")
       .text("EVICHAIN CASE INTELLIGENCE REPORT", 55, 50, { align: "center" });
    doc.fontSize(8.5).font("Helvetica")
       .text(`Case ID: ${caseRecord.id} · Generated ${new Date().toUTCString()}`, 55, 70, { align: "center" });

    let y = 105;
    doc.fillColor("#0f845a").fontSize(11).font("Helvetica-Bold").text("CASE OVERVIEW", 45, y);
    doc.strokeColor("#0f845a").lineWidth(1).moveTo(45, y + 14).lineTo(550, y + 14).stroke();

    y += 22;
    doc.rect(45, y, 505, 60).fillAndStroke("#f4f7f5", "#d1dcd3");
    doc.fillColor("#141f1c").fontSize(9).font("Helvetica");
    doc.text(`Title: `, 55, y + 8, { continued: true }).font("Helvetica-Bold").text(caseRecord.title);
    doc.font("Helvetica").text(`Status: `, 55, y + 22, { continued: true }).font("Helvetica-Bold").text(caseRecord.status);
    doc.font("Helvetica").text(`Priority: `, 55, y + 36, { continued: true }).font("Helvetica-Bold").text(caseRecord.priority);

    doc.font("Helvetica").text(`Lead Investigator: `, 300, y + 8, { continued: true }).font("Helvetica-Bold").text(`${caseRecord.lead.name} (${caseRecord.lead.role})`);
    doc.font("Helvetica").text(`Created: `, 300, y + 22, { continued: true }).font("Helvetica-Bold").text(new Date(caseRecord.createdAt).toUTCString());
    doc.font("Helvetica").text(`Total Evidence: `, 300, y + 36, { continued: true }).font("Helvetica-Bold").text(`${caseRecord.evidence.length} item(s)`);

    y += 75;
    doc.fillColor("#0f845a").fontSize(11).font("Helvetica-Bold").text("LINKED EVIDENCE REGISTRY", 45, y);
    doc.strokeColor("#0f845a").lineWidth(1).moveTo(45, y + 14).lineTo(550, y + 14).stroke();

    y += 22;
    doc.rect(45, y, 505, 18).fillAndStroke("#e8ede9", "#d1dcd3");
    doc.fillColor("#141f1c").fontSize(8).font("Helvetica-Bold");
    doc.text("NAME", 52, y + 5);
    doc.text("TYPE / MIME", 210, y + 5);
    doc.text("STATUS", 340, y + 5);
    doc.text("SHA-256 (PREFIX)", 420, y + 5);

    y += 18;
    for (const ev of caseRecord.evidence) {
      if (y > 720) { doc.addPage(); y = 45; }
      doc.rect(45, y, 505, 20).fillAndStroke("#ffffff", "#e8ede9");
      doc.fillColor("#141f1c").fontSize(7.5).font("Helvetica");
      doc.text(ev.name.length > 25 ? `${ev.name.slice(0, 25)}…` : ev.name, 52, y + 6);
      doc.text(ev.mimeType, 210, y + 6);
      doc.font("Helvetica-Bold").text(ev.status, 340, y + 6);
      doc.font("Courier").text(ev.sha256.slice(0, 14) + "…", 420, y + 6);
      y += 20;
    }

    doc.end();
  } catch (error) {
    console.error("Case PDF export error:", error);
    return res.status(500).json({ error: "Failed to generate case PDF report" });
  }
});

export default router;
