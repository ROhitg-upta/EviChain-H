import { Router } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { z } from "zod";
import * as archiver from "archiver";
import { prisma } from "../db";
import { requireAuth, AuthedRequest, requireRole } from "../middleware";



import { generateEvidenceCertificate } from "../services/pdf.service";
import { notificationService } from "../services/notification.service";

const router = Router();

// ── Allowed file types ────────────────────────────────────────────
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/tiff",
  "video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip", "application/x-tar", "application/gzip",
  "text/plain", "text/csv",
  "application/octet-stream", // disk images / forensic captures
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB hard limit
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

// ── Zod schemas ───────────────────────────────────────────────────
const createEvidenceSchema = z.object({
  caseId: z.preprocess((val) => (typeof val === "string" && val.trim() === "" ? undefined : val), z.string().uuid("caseId must be a valid UUID").optional()),
  name: z.string().min(2, "name must be at least 2 characters"),
  type: z.string().min(1),
  ownerOrg: z.string().min(2, "ownerOrg must be at least 2 characters"),
  description: z.string().max(2000).optional(),
  tags: z.string().max(500).optional(),
});

// ═══════════════════════════════════════════════════════════════════
// POST /evidence  — Upload & register a new evidence file
// ═══════════════════════════════════════════════════════════════════
router.post(
  "/",
  requireAuth,
  requireRole("ADMINISTRATOR", "INVESTIGATOR", "CUSTODIAN"),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      if (err instanceof Error) {
        return res.status(415).json({ error: err.message });
      }
      next();
    });
  },
  async (req: AuthedRequest, res) => {
    try {
      const parsed = createEvidenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "File is required" });
      }

      const sha256 = createHash("sha256").update(file.buffer).digest("hex");
      const storageKey = `evidence/${Date.now()}-${file.originalname}`;

      const evidence = await prisma.evidence.create({
        data: {
          caseId: parsed.data.caseId ?? null,
          name: parsed.data.name,
          type: parsed.data.type,
          ownerOrg: parsed.data.ownerOrg,
          sizeBytes: file.size,
          mimeType: file.mimetype,
          sha256,
          storageKey,
          collectedById: req.userId!,
          status: "PENDING",
        },
      });

      await prisma.custodyEvent.create({
        data: {
          evidenceId: evidence.id,
          action: "CREATED",
          actorUserId: req.userId!,
          note: "Evidence registered and SHA-256 fingerprint computed",
        },
      });

      await prisma.auditLog.create({
        data: {
          actorUserId: req.userId!,
          action: "evidence.upload",
          resourceType: "evidence",
          resourceId: evidence.id,
          detailJson: {
            name: evidence.name,
            sha256: evidence.sha256,
            sizeBytes: evidence.sizeBytes,
            mimeType: evidence.mimeType,
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      await notificationService.emitNotification(req.userId!, {
        type: "success",
        title: "Evidence Registered",
        message: `Registered "${evidence.name}" with SHA-256 fingerprint.`,
        link: `/evidence/${evidence.id}`,
      });

      return res.status(201).json({
        id: evidence.id,
        name: evidence.name,
        type: evidence.type,
        ownerOrg: evidence.ownerOrg,
        sha256: evidence.sha256,
        sizeBytes: evidence.sizeBytes,
        mimeType: evidence.mimeType,
        status: evidence.status,
        createdAt: evidence.createdAt,
      });
    } catch (error) {
      console.error("Evidence creation error:", error);
      return res.status(500).json({ error: "Failed to register evidence" });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// POST /evidence/bulk-upload — Register multiple evidence items
// ═══════════════════════════════════════════════════════════════════
router.post(
  "/bulk-upload",
  requireAuth,
  requireRole("ADMINISTRATOR", "INVESTIGATOR", "CUSTODIAN"),
  (req, res, next) => {
    upload.array("files", 20)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      if (err instanceof Error) {
        return res.status(415).json({ error: err.message });
      }
      next();
    });
  },
  async (req: AuthedRequest, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "At least one file is required" });
      }

      const caseId = (req.body.caseId as string) || null;
      const ownerOrg = (req.body.ownerOrg as string) || "General Intake";
      const type = (req.body.type as string) || "Digital Evidence";

      const results = await prisma.$transaction(async (tx) => {
        const createdItems = [];
        for (const file of files) {
          const sha256 = createHash("sha256").update(file.buffer).digest("hex");
          const storageKey = `evidence/${Date.now()}-${file.originalname}`;

          const ev = await tx.evidence.create({
            data: {
              caseId: caseId || null,
              name: file.originalname,
              type,
              ownerOrg,
              sizeBytes: file.size,
              mimeType: file.mimetype,
              sha256,
              storageKey,
              collectedById: req.userId!,
              status: "PENDING",
            },
          });

          await tx.custodyEvent.create({
            data: {
              evidenceId: ev.id,
              action: "CREATED",
              actorUserId: req.userId!,
              note: "Evidence registered via bulk ingestion with SHA-256 fingerprint",
            },
          });

          createdItems.push(ev);
        }
        return createdItems;
      });

      await prisma.auditLog.create({
        data: {
          actorUserId: req.userId!,
          action: "evidence.bulk_upload",
          resourceType: "evidence",
          resourceId: results[0]?.id || "batch",
          detailJson: {
            count: results.length,
            fileNames: results.map((r) => r.name),
            hashes: results.map((r) => r.sha256),
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      await notificationService.emitNotification(req.userId!, {
        type: "success",
        title: "Bulk Upload Complete",
        message: `Successfully ingested ${results.length} evidence file(s).`,
        link: "/evidence",
      });

      return res.status(201).json({
        message: `Successfully uploaded ${results.length} files`,
        count: results.length,
        items: results,
      });
    } catch (error) {
      console.error("Bulk upload error:", error);
      return res.status(500).json({ error: "Failed to process bulk upload" });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// POST /evidence/bulk-download — Generate and stream ZIP archive
// ═══════════════════════════════════════════════════════════════════
router.post("/bulk-download", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { evidenceIds } = req.body as { evidenceIds: string[] };

    if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
      return res.status(400).json({ error: "evidenceIds array is required" });
    }

    const items = await prisma.evidence.findMany({
      where: { id: { in: evidenceIds } },
      include: {
        case: { select: { title: true } },
        collectedBy: { select: { name: true, role: true } },
      },
    });

    if (items.length === 0) {
      return res.status(404).json({ error: "No matching evidence items found" });
    }

    const archive = (archiver as unknown as (format: string, opt: object) => archiver.Archiver)("zip", { zlib: { level: 6 } });
    const dateStamp = new Date().toISOString().slice(0, 10);


    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="evidence-bundle-${dateStamp}.zip"`,
    );

    archive.pipe(res);

    const manifest = {
      bundleId: `BUNDLE-${Date.now()}`,
      exportedAt: new Date().toISOString(),
      exportedBy: req.userId,
      itemCount: items.length,
      evidence: items.map((i) => ({
        id: i.id,
        name: i.name,
        type: i.type,
        ownerOrg: i.ownerOrg,
        status: i.status,
        sizeBytes: i.sizeBytes,
        mimeType: i.mimeType,
        sha256: i.sha256,
        case: i.case?.title ?? "None",
        collectedBy: i.collectedBy.name,
        registeredAt: i.createdAt,
      })),
    };

    archive.append(JSON.stringify(manifest, null, 2), { name: "FORENSIC_MANIFEST.json" });

    for (const item of items) {
      await prisma.custodyEvent.create({
        data: {
          evidenceId: item.id,
          action: "DOWNLOADED",
          actorUserId: req.userId!,
          note: `Downloaded as part of bulk ZIP bundle (${items.length} items)`,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId!,
        action: "evidence.bulk_download",
        resourceType: "evidence",
        resourceId: "batch",
        detailJson: { count: items.length, evidenceIds },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    await archive.finalize();
  } catch (error) {
    console.error("Bulk download error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Failed to generate bulk archive" });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /evidence  — List evidence (with case + collector)
// ═══════════════════════════════════════════════════════════════════
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const caseId = req.query.caseId as string | undefined;
    const status = req.query.status as string | undefined;

    const where: Record<string, unknown> = {};
    if (caseId) where.caseId = caseId;
    if (status) where.status = status;

    const evidence = await prisma.evidence.findMany({
      where,
      include: {
        case: { select: { id: true, title: true, status: true } },
        collectedBy: { select: { id: true, name: true, role: true } },
        custodyEvents: { orderBy: { timestamp: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return res.json(evidence);
  } catch (error) {
    console.error("Evidence list error:", error);
    return res.status(500).json({ error: "Failed to list evidence" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /evidence/export/csv — Filtered CSV export of evidence items
// ═══════════════════════════════════════════════════════════════════
router.get(
  "/export/csv",
  requireAuth,
  requireRole("ADMINISTRATOR", "AUDITOR", "INVESTIGATOR"),
  async (req: AuthedRequest, res) => {
    try {
      const status = req.query.status as string | undefined;
      const caseId = req.query.caseId as string | undefined;
      const type = req.query.type as string | undefined;

      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (caseId) where.caseId = caseId;
      if (type) where.type = type;

      const items = await prisma.evidence.findMany({
        where,
        include: {
          case: { select: { title: true } },
          collectedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const header = [
        "id", "name", "type", "ownerOrg", "status", "sizeBytes",
        "mimeType", "sha256", "caseTitle", "collectorName", "registeredAt",
      ];

      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

      const rows = items.map((i) => [
        esc(i.id),
        esc(i.name),
        esc(i.type),
        esc(i.ownerOrg),
        esc(i.status),
        esc(i.sizeBytes),
        esc(i.mimeType),
        esc(i.sha256),
        esc(i.case?.title ?? ""),
        esc(i.collectedBy.name),
        esc(i.createdAt.toISOString()),
      ].join(","));

      const csv = [header.join(","), ...rows].join("\n");
      const dateStamp = new Date().toISOString().slice(0, 10);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="evidence-export-${dateStamp}.csv"`,
      );

      return res.send(csv);
    } catch (error) {
      console.error("Evidence CSV export error:", error);
      return res.status(500).json({ error: "Failed to export evidence CSV" });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /evidence/:id  — Full detail with all custody events
// ═══════════════════════════════════════════════════════════════════
router.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = req.params["id"] as string;

    const evidence = await prisma.evidence.findUnique({
      where: { id },
      include: {
        case: { select: { id: true, title: true, status: true } },
        collectedBy: { select: { id: true, name: true, role: true } },
        custodyEvents: {
          orderBy: { timestamp: "desc" },
          include: {
            actor: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });

    if (!evidence) {
      return res.status(404).json({ error: "Evidence not found" });
    }

    await prisma.custodyEvent.create({
      data: {
        evidenceId: id,
        action: "ACCESSED",
        actorUserId: req.userId!,
        note: "Evidence record viewed",
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId!,
        action: "evidence.view",
        resourceType: "evidence",
        resourceId: id,
        detailJson: { name: evidence.name },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    return res.json(evidence);
  } catch (error) {
    console.error("Evidence detail error:", error);
    return res.status(500).json({ error: "Failed to get evidence" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /evidence/:id/transfer — Transfer custody of evidence
// ═══════════════════════════════════════════════════════════════════
router.post(
  "/:id/transfer",
  requireAuth,
  requireRole("ADMINISTRATOR", "INVESTIGATOR", "CUSTODIAN"),
  async (req: AuthedRequest, res) => {
    try {
      const id = req.params["id"] as string;
      const { toUserId, toLocation, fromLocation, note } = req.body as {
        toUserId: string;
        toLocation?: string;
        fromLocation?: string;
        note?: string;
      };

      if (!toUserId) {
        return res.status(400).json({ error: "toUserId is required" });
      }

      const [evidence, toUser] = await Promise.all([
        prisma.evidence.findUnique({ where: { id } }),
        prisma.user.findUnique({ where: { id: toUserId }, select: { id: true, name: true } }),
      ]);

      if (!evidence) {
        return res.status(404).json({ error: "Evidence not found" });
      }
      if (!toUser) {
        return res.status(404).json({ error: "Recipient user not found" });
      }

      const custodyEvent = await prisma.custodyEvent.create({
        data: {
          evidenceId: id,
          action: "TRANSFERRED",
          actorUserId: req.userId!,
          fromLocation: fromLocation ?? null,
          toLocation: toLocation ?? null,
          note: note || `Custody transferred to ${toUser.name}`,
        },
        include: {
          actor: { select: { id: true, name: true, role: true } },
        },
      });

      await prisma.auditLog.create({
        data: {
          actorUserId: req.userId!,
          action: "evidence.transfer",
          resourceType: "evidence",
          resourceId: id,
          detailJson: {
            toUserId,
            toUserName: toUser.name,
            fromLocation,
            toLocation,
            note,
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      await notificationService.emitNotification(toUserId, {
        type: "transfer",
        title: "Evidence Custody Transferred",
        message: `You have been assigned custody of evidence: "${evidence.name}".`,
        link: `/evidence/${id}`,
      });

      return res.json({
        message: "Custody transfer logged successfully",
        custodyEvent,
      });
    } catch (error) {
      console.error("Custody transfer error:", error);
      return res.status(500).json({ error: "Failed to transfer custody" });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /evidence/:id/certificate — Forensic PDF Hash Certificate
// ═══════════════════════════════════════════════════════════════════
router.get("/:id/certificate", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = req.params["id"] as string;

    const evidence = await prisma.evidence.findUnique({
      where: { id },
      include: {
        case: { select: { id: true, title: true, status: true } },
        collectedBy: { select: { name: true, role: true, email: true } },
        custodyEvents: {
          orderBy: { timestamp: "asc" },
          include: { actor: { select: { name: true, role: true } } },
        },
      },
    });

    if (!evidence) {
      return res.status(404).json({ error: "Evidence not found" });
    }

    const pdfBuffer = await generateEvidenceCertificate(evidence);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="EviChain-Certificate-${evidence.id.slice(0, 8)}.pdf"`,
    );

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Certificate generation error:", error);
    return res.status(500).json({ error: "Failed to generate certificate" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /evidence/:id/download
// ═══════════════════════════════════════════════════════════════════
router.get("/:id/download", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = req.params["id"] as string;

    const evidence = await prisma.evidence.findUnique({ where: { id } });

    if (!evidence) {
      return res.status(404).json({ error: "Evidence not found" });
    }

    await prisma.custodyEvent.create({
      data: {
        evidenceId: id,
        action: "DOWNLOADED",
        actorUserId: req.userId!,
        note: "Evidence download initiated",
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId!,
        action: "evidence.download",
        resourceType: "evidence",
        resourceId: id,
        detailJson: { name: evidence.name, sha256: evidence.sha256 },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    return res.json({
      id: evidence.id,
      name: evidence.name,
      storageKey: evidence.storageKey,
      sha256: evidence.sha256,
      sizeBytes: evidence.sizeBytes,
      mimeType: evidence.mimeType,
      note: "File storage not yet configured. Download logged in chain of custody.",
    });
  } catch (error) {
    console.error("Evidence download error:", error);
    return res.status(500).json({ error: "Failed to process download" });
  }
});

// ── GET /evidence/:id/annotations ────────────────────────────────
router.get("/:id/annotations", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const evidenceId = req.params["id"] as string;
    const annotations = await prisma.evidenceAnnotation.findMany({
      where: { evidenceId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return res.json(annotations);
  } catch (error) {
    console.error("Annotations get error:", error);
    return res.status(500).json({ error: "Failed to fetch annotations" });
  }
});

// ── POST /evidence/:id/annotations ───────────────────────────────
router.post("/:id/annotations", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const evidenceId = req.params["id"] as string;
    const { annotations } = req.body as {
      annotations: Array<{ type: string; points: { x: number; y: number }[]; text?: string; color: string }>;
    };

    if (!Array.isArray(annotations)) {
      return res.status(400).json({ error: "Annotations array required" });
    }

    await prisma.evidenceAnnotation.deleteMany({ where: { evidenceId, userId: req.userId! } });

    const created = await prisma.evidenceAnnotation.createMany({
      data: annotations.map((a) => ({
        evidenceId,
        userId: req.userId!,
        type:   a.type,
        points: a.points,
        text:   a.text ?? null,
        color:  a.color,
      })),
    });

    await prisma.auditLog.create({
      data: {
        actorUserId:  req.userId!,
        action:       "evidence.annotate",
        resourceType: "evidence",
        resourceId:   evidenceId,
        detailJson:   { count: created.count },
        ipAddress:    req.ip,
        userAgent:    req.headers["user-agent"],
      },
    });

    return res.json({ count: created.count });
  } catch (error) {
    console.error("Annotations save error:", error);
    return res.status(500).json({ error: "Failed to save annotations" });
  }
});

export default router;
