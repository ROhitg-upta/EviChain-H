import { Router } from "express";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { prisma } from "../db";
import { requireAuth, AuthedRequest, requireRole } from "../middleware";
import { notificationService } from "../services/notification.service";

const router = Router();

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
