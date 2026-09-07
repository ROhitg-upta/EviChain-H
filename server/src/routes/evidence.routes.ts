import { Router } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { z } from "zod";
import * as archiver from "archiver";
import { prisma, normalizePrismaError } from "../db";
import { getStorageAdapter } from "../storage";
import { requireAuth, AuthedRequest, requireRole } from "../middleware";




import { generateEvidenceCertificate } from "../services/pdf.service";
import { notificationService } from "../services/notification.service";
import { processEvidenceUpload, UploadError } from "../services/evidence-upload.service";

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

      const idempotencyKey =
        (req.headers["idempotency-key"] as string) ||
        (typeof req.body.idempotencyKey === "string" ? req.body.idempotencyKey : undefined);

      const evidence = await processEvidenceUpload({
        file,
        caseId: parsed.data.caseId ?? null,
        uploaderId: req.userId!,
        name: parsed.data.name,
        type: parsed.data.type,
        ownerOrg: parsed.data.ownerOrg,
        description: parsed.data.description,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        idempotencyKey,
      });

      return res.status(201).json({
        id: evidence.id,
        name: evidence.filename,
        type: parsed.data.type,
        ownerOrg: parsed.data.ownerOrg,
        sha256: evidence.sha256,
        sizeBytes: evidence.size,
        mimeType: evidence.mimeType,
        status: evidence.status,
        createdAt: evidence.createdAt,
      });
    } catch (error: unknown) {
      if (error instanceof UploadError) {
        return res.status(error.statusCode).json({ code: error.code, error: error.message });
      }
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
      }, { timeout: 30000, maxWait: 15000 });

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

    const ZipConstructor = (archiver as any).ZipArchive || (archiver as any).default || archiver;
    const archive = typeof ZipConstructor === "function" && ZipConstructor.prototype?.pipe
      ? new ZipConstructor({ zlib: { level: 6 } })
      : (archiver as any)("zip", { zlib: { level: 6 } });
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
// ═══════════════════════════════════════════════════════════════════
// GET /evidence/:id  — Full detail with current custodian and throttled access log
// ═══════════════════════════════════════════════════════════════════
router.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = req.params["id"] as string;

    const evidence = await prisma.evidence.findUnique({
      where: { id },
      include: {
        case: { select: { id: true, title: true, status: true } },
        collectedBy: { select: { id: true, name: true, role: true } },
        currentCustodian: { select: { id: true, name: true, role: true } },
        custodyEvents: {
          orderBy: { timestamp: "desc" },
          include: {
            actor: { select: { id: true, name: true, role: true } },
            fromUser: { select: { id: true, name: true, role: true } },
            toUser: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });

    if (!evidence) {
      return res.status(404).json({ code: "EVIDENCE_NOT_FOUND", error: "Evidence not found" });
    }

    // 5-minute throttling for ACCESSED custody events to prevent timeline spam
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentAccess = await prisma.custodyEvent.findFirst({
      where: {
        evidenceId: id,
        actorUserId: req.userId!,
        action: "ACCESSED",
        timestamp: { gte: fiveMinutesAgo },
      },
    });

    if (!recentAccess) {
      await prisma.custodyEvent.create({
        data: {
          evidenceId: id,
          action: "ACCESSED",
          actorUserId: req.userId!,
          ipAddress: req.ip,
          note: "Evidence record viewed",
        },
      });
    }

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
    const norm = normalizePrismaError(error);
    return res.status(norm.statusCode).json({ code: norm.code || "INTERNAL_ERROR", error: norm.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /evidence/:id/custody — Complete chronological chain of custody
// ═══════════════════════════════════════════════════════════════════
router.get("/:id/custody", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = req.params["id"] as string;

    const evidence = await prisma.evidence.findUnique({
      where: { id },
      select: { id: true, name: true, currentCustodianId: true },
    });

    if (!evidence) {
      return res.status(404).json({ code: "EVIDENCE_NOT_FOUND", error: "Evidence not found" });
    }

    const events = await prisma.custodyEvent.findMany({
      where: { evidenceId: id },
      orderBy: { timestamp: "asc" },
      include: {
        actor: { select: { id: true, name: true, role: true } },
        fromUser: { select: { id: true, name: true, role: true } },
        toUser: { select: { id: true, name: true, role: true } },
      },
    });

    return res.json(events);
  } catch (error) {
    const norm = normalizePrismaError(error);
    return res.status(norm.statusCode).json({ code: norm.code || "INTERNAL_ERROR", error: norm.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /evidence/:id/transfer — Transfer custody of evidence (Atomic & Role-Gated)
// ═══════════════════════════════════════════════════════════════════
router.post(
  "/:id/transfer",
  requireAuth,
  requireRole("ADMINISTRATOR", "INVESTIGATOR"),
  async (req: AuthedRequest, res) => {
    try {
      const id = req.params["id"] as string;
      const { toUserId, toLocation, fromLocation, note } = req.body as {
        toUserId?: string;
        toLocation?: string;
        fromLocation?: string;
        note?: string;
      };

      if (!toUserId || typeof toUserId !== "string") {
        return res.status(400).json({ code: "RECIPIENT_REQUIRED", error: "toUserId is required" });
      }

      if (toUserId === req.userId) {
        return res.status(400).json({ code: "TRANSFER_TO_SELF", error: "Cannot transfer custody of evidence to yourself." });
      }

      const result = await prisma.$transaction(async (tx) => {
        const evidence = await tx.evidence.findUnique({
          where: { id },
          include: {
            currentCustodian: { select: { id: true, name: true, role: true } },
          },
        });

        if (!evidence) {
          return { status: 404, data: { code: "EVIDENCE_NOT_FOUND", error: "Evidence not found" } };
        }

        if (evidence.status === "SEALED") {
          return { status: 400, data: { code: "EVIDENCE_SEALED", error: "Cannot transfer sealed evidence." } };
        }

        // Ownership rule: caller must currently hold custody, or be an ADMINISTRATOR overriding
        const isCurrentHolder = (evidence.currentCustodianId || evidence.collectedById) === req.userId;
        const isAdmin = req.userRole === "ADMINISTRATOR";

        if (!isCurrentHolder && !isAdmin) {
          return {
            status: 403,
            data: {
              code: "NOT_CURRENT_CUSTODIAN",
              error: "Only the current custodian or an administrator can transfer custody of this evidence.",
            },
          };
        }

        // Recipient validation
        const toUser = await tx.user.findUnique({
          where: { id: toUserId },
          select: { id: true, name: true, role: true },
        });

        if (!toUser) {
          return { status: 404, data: { code: "RECIPIENT_NOT_FOUND", error: "Recipient user not found" } };
        }

        if (toUser.role === "AUDITOR") {
          return {
            status: 400,
            data: {
              code: "INVALID_CUSTODIAN_ROLE",
              error: "Auditors are independent observers and cannot hold chain of custody.",
            },
          };
        }

        // Atomic custody transfer update
        await tx.evidence.update({
          where: { id },
          data: { currentCustodianId: toUserId },
        });

        const fromHolderId = evidence.currentCustodianId || evidence.collectedById;
        const defaultNote = `Custody transferred from ${evidence.currentCustodian?.name || "previous custodian"} to ${toUser.name}`;

        const custodyEvent = await tx.custodyEvent.create({
          data: {
            evidenceId: id,
            action: "TRANSFERRED",
            actorUserId: req.userId!,
            fromUserId: fromHolderId,
            toUserId,
            fromLocation: fromLocation ?? null,
            toLocation: toLocation ?? null,
            ipAddress: req.ip,
            note: note?.trim() || defaultNote,
          },
          include: {
            actor: { select: { id: true, name: true, role: true } },
            fromUser: { select: { id: true, name: true, role: true } },
            toUser: { select: { id: true, name: true, role: true } },
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: req.userId!,
            action: "evidence.transfer",
            resourceType: "evidence",
            resourceId: id,
            detailJson: {
              fromUserId: fromHolderId,
              toUserId,
              toUserName: toUser.name,
              reason: note?.trim() || defaultNote,
            },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
          },
        });

        return {
          status: 200,
          data: {
            message: "Custody transfer logged successfully",
            evidenceId: id,
            currentCustodian: toUser,
            custodyEvent,
          },
          notifyUserId: toUserId,
          evidenceName: evidence.name,
        };
      }, { timeout: 30000, maxWait: 15000 });

      if (result.status !== 200) {
        return res.status(result.status).json(result.data);
      }

      if ("notifyUserId" in result && result.notifyUserId) {
        await notificationService.createNotification({
          userId: result.notifyUserId,
          type: "CUSTODY_TRANSFER_RECEIVED",
          title: "Evidence Custody Transferred",
          message: `You have been assigned custody of evidence: "${result.evidenceName}".`,
          link: `/evidence/${id}`,
          entityType: "EVIDENCE",
          entityId: id,
          dedupeKey: `CUSTODY_TRANSFER_RECEIVED:${id}:${result.notifyUserId}:${Date.now()}`,
        });
      }

      return res.json(result.data);
    } catch (error) {
      const norm = normalizePrismaError(error);
      return res.status(norm.statusCode).json({ code: norm.code || "INTERNAL_ERROR", error: norm.message });
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
// GET /evidence/:id/download — Authenticated, auditable file streaming
// ═══════════════════════════════════════════════════════════════════
router.get("/:id/download", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = req.params["id"] as string;

    // Explicit Auditor Download Policy Decision
    if (req.userRole === "AUDITOR") {
      return res.status(403).json({
        code: "AUDITOR_DOWNLOAD_RESTRICTED",
        error: "Auditors have read-only inspection rights and are restricted from downloading raw evidence binaries.",
      });
    }

    const evidence = await prisma.evidence.findUnique({ where: { id } });

    if (!evidence) {
      return res.status(404).json({ code: "EVIDENCE_NOT_FOUND", error: "Evidence not found" });
    }

    const storage = getStorageAdapter();
    const exists = await storage.exists(evidence.storageKey);

    if (!exists) {
      return res.status(404).json({
        code: "STORAGE_OBJECT_NOT_FOUND",
        error: "The physical evidence file was not found in storage.",
      });
    }

    await prisma.custodyEvent.create({
      data: {
        evidenceId: id,
        action: "DOWNLOADED",
        actorUserId: req.userId!,
        ipAddress: req.ip,
        note: `Evidence binary downloaded by ${req.userRole}`,
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

    res.setHeader("Content-Type", evidence.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(evidence.name)}"`);
    res.setHeader("Content-Length", evidence.sizeBytes);

    const stream = await storage.downloadStream(evidence.storageKey);
    stream.pipe(res);
  } catch (error) {
    const norm = normalizePrismaError(error);
    return res.status(norm.statusCode).json({ code: norm.code || "INTERNAL_ERROR", error: norm.message });
  }
});


// ── Helper: Evidence Access Verification ─────────────────────────
async function getAuthorizedEvidence(evidenceId: string, userId?: string, userRole?: string) {
  const evidence = await prisma.evidence.findUnique({
    where: { id: evidenceId },
    include: {
      case: { select: { id: true, leadUserId: true, title: true } },
    },
  });

  if (!evidence) {
    return { errorStatus: 404, errorMessage: "Evidence not found", evidence: null };
  }

  if (!userId || !userRole) {
    return { errorStatus: 401, errorMessage: "Unauthorized", evidence: null };
  }

  if (userRole === "ADMINISTRATOR" || userRole === "AUDITOR") {
    return { errorStatus: 0, errorMessage: "", evidence };
  }

  if (evidence.collectedById === userId || evidence.currentCustodianId === userId) {
    return { errorStatus: 0, errorMessage: "", evidence };
  }

  if (evidence.case && evidence.case.leadUserId === userId) {
    return { errorStatus: 0, errorMessage: "", evidence };
  }

  return { errorStatus: 403, errorMessage: "You do not have access to this evidence record", evidence: null };
}

function validateNormalizedCoords(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === "number") {
    return val >= 0 && val <= 1;
  }
  if (Array.isArray(val)) {
    return val.every((item) => validateNormalizedCoords(item));
  }
  if (typeof val === "object") {
    for (const key of Object.keys(val as object)) {
      const prop = (val as Record<string, unknown>)[key];
      if (typeof prop === "number") {
        if (prop < 0 || prop > 1) return false;
      } else if (typeof prop === "object") {
        if (!validateNormalizedCoords(prop)) return false;
      }
    }
    return true;
  }
  return true;
}

// ── GET /evidence/:id/annotations ─────────────────────────────────
router.get("/:id/annotations", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const evidenceId = req.params["id"] as string;
    const authCheck = await getAuthorizedEvidence(evidenceId, req.userId, req.userRole);
    if (authCheck.errorStatus > 0 || !authCheck.evidence) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const annotations = await prisma.evidenceAnnotation.findMany({
      where: { evidenceId, deletedAt: null },
      include: {
        user: { select: { id: true, name: true, role: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const shaped = annotations.map((ann) => ({
      id: ann.id,
      evidenceId: ann.evidenceId,
      userId: ann.userId,
      type: ann.type,
      points: ann.points ?? ann.coordinates ?? [],
      coordinates: ann.coordinates ?? ann.points ?? null,
      pageNumber: ann.pageNumber,
      text: ann.text ?? ann.note ?? null,
      note: ann.note ?? ann.text ?? null,
      color: ann.color,
      createdAt: ann.createdAt.toISOString(),
      editedAt: ann.editedAt?.toISOString() ?? null,
      user: {
        id: ann.user.id,
        name: ann.user.name,
        role: ann.user.role,
        email: ann.user.email,
      },
    }));

    return res.json(shaped);
  } catch (error) {
    console.error("Annotations get error:", error);
    return res.status(500).json({ error: "Failed to fetch annotations" });
  }
});

// ── POST /evidence/:id/annotations ────────────────────────────────
router.post("/:id/annotations", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const evidenceId = req.params["id"] as string;

    if (req.userRole === "AUDITOR") {
      return res.status(403).json({ error: "Auditors have read-only access and cannot create annotations" });
    }

    const authCheck = await getAuthorizedEvidence(evidenceId, req.userId, req.userRole);
    if (authCheck.errorStatus > 0 || !authCheck.evidence) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const body = req.body;

    // Handle bulk save compatibility mode
    if (Array.isArray(body.annotations)) {
      const items = body.annotations as Array<{
        type: string;
        points?: unknown;
        coordinates?: unknown;
        pageNumber?: number;
        text?: string;
        note?: string;
        color?: string;
      }>;

      // Validate coordinates for all items
      for (const it of items) {
        if (!validateNormalizedCoords(it.points) || !validateNormalizedCoords(it.coordinates)) {
          return res.status(400).json({ error: "Annotation coordinates must be normalized between 0 and 1" });
        }
      }

      // Soft delete previous annotations by this user on this evidence
      await prisma.evidenceAnnotation.updateMany({
        where: { evidenceId, userId: req.userId!, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      const created = await prisma.$transaction(
        items.map((a) =>
          prisma.evidenceAnnotation.create({
            data: {
              evidenceId,
              userId: req.userId!,
              type: a.type || "POINT",
              points: (a.points as object) ?? (a.coordinates as object) ?? [],
              coordinates: (a.coordinates as object) ?? (a.points as object) ?? null,
              pageNumber: typeof a.pageNumber === "number" ? a.pageNumber : null,
              text: a.text ?? a.note ?? null,
              note: a.note ?? a.text ?? null,
              color: a.color || "#22d3ee",
            },
          }),
        ),
      );

      await prisma.auditLog.create({
        data: {
          actorUserId: req.userId!,
          action: "evidence.annotation.create",
          resourceType: "evidence",
          resourceId: evidenceId,
          detailJson: { count: created.length, bulk: true },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      return res.status(201).json({ count: created.length, annotations: created });
    }

    // Single annotation creation
    const { type, points, coordinates, pageNumber, text, note, color } = body;
    const effectiveCoords = coordinates ?? points;
    const effectiveNote = note ?? text;

    if (!type || typeof type !== "string") {
      return res.status(400).json({ error: "type is required" });
    }

    if (!validateNormalizedCoords(effectiveCoords)) {
      return res.status(400).json({ error: "Annotation coordinates must be normalized between 0 and 1" });
    }

    const created = await prisma.evidenceAnnotation.create({
      data: {
        evidenceId,
        userId: req.userId!,
        type,
        points: (effectiveCoords as object) ?? [],
        coordinates: (effectiveCoords as object) ?? null,
        pageNumber: typeof pageNumber === "number" ? pageNumber : null,
        text: effectiveNote ?? null,
        note: effectiveNote ?? null,
        color: typeof color === "string" ? color : "#22d3ee",
      },
      include: {
        user: { select: { id: true, name: true, role: true, email: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId!,
        action: "evidence.annotation.create",
        resourceType: "evidence",
        resourceId: evidenceId,
        detailJson: {
          annotationId: created.id,
          type: created.type,
          pageNumber: created.pageNumber,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    return res.status(201).json({
      id: created.id,
      evidenceId: created.evidenceId,
      userId: created.userId,
      type: created.type,
      points: created.points ?? created.coordinates ?? [],
      coordinates: created.coordinates ?? created.points ?? null,
      pageNumber: created.pageNumber,
      text: created.text ?? created.note ?? null,
      note: created.note ?? created.text ?? null,
      color: created.color,
      createdAt: created.createdAt.toISOString(),
      editedAt: created.editedAt?.toISOString() ?? null,
      user: created.user,
    });
  } catch (error) {
    console.error("Annotations save error:", error);
    return res.status(500).json({ error: "Failed to save annotations" });
  }
});

// ── PATCH /evidence/:id/annotations/:annId ────────────────────────
router.patch("/:id/annotations/:annId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const evidenceId = req.params["id"] as string;
    const annId = req.params["annId"] as string;

    if (req.userRole === "AUDITOR") {
      return res.status(403).json({ error: "Auditors have read-only access and cannot edit annotations" });
    }

    const authCheck = await getAuthorizedEvidence(evidenceId, req.userId, req.userRole);
    if (authCheck.errorStatus > 0 || !authCheck.evidence) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const existing = await prisma.evidenceAnnotation.findFirst({
      where: { id: annId, evidenceId, deletedAt: null },
      include: { user: { select: { id: true, name: true, role: true } } },
    });

    if (!existing) {
      return res.status(404).json({ error: "Annotation not found" });
    }

    const isAuthor = existing.userId === req.userId;
    const isAdmin = req.userRole === "ADMINISTRATOR";

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: "You can only edit your own annotations" });
    }

    const { type, points, coordinates, pageNumber, text, note, color, reason } = req.body;
    const effectiveCoords = coordinates !== undefined ? coordinates : points;
    const effectiveNote = note !== undefined ? note : text;

    if (effectiveCoords !== undefined && !validateNormalizedCoords(effectiveCoords)) {
      return res.status(400).json({ error: "Annotation coordinates must be normalized between 0 and 1" });
    }

    const updated = await prisma.evidenceAnnotation.update({
      where: { id: annId },
      data: {
        type: typeof type === "string" ? type : undefined,
        points: effectiveCoords !== undefined ? (effectiveCoords as object) : undefined,
        coordinates: effectiveCoords !== undefined ? (effectiveCoords as object) : undefined,
        pageNumber: typeof pageNumber === "number" ? pageNumber : undefined,
        text: effectiveNote !== undefined ? (effectiveNote as string) : undefined,
        note: effectiveNote !== undefined ? (effectiveNote as string) : undefined,
        color: typeof color === "string" ? color : undefined,
        editedAt: new Date(),
      },
      include: {
        user: { select: { id: true, name: true, role: true, email: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId!,
        action: isAdmin && !isAuthor ? "evidence.annotation.moderate" : "evidence.annotation.edit",
        resourceType: "evidence",
        resourceId: evidenceId,
        detailJson: {
          annotationId: annId,
          originalAuthorId: existing.userId,
          moderated: isAdmin && !isAuthor,
          reason: typeof reason === "string" ? reason : undefined,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    return res.json({
      id: updated.id,
      evidenceId: updated.evidenceId,
      userId: updated.userId,
      type: updated.type,
      points: updated.points ?? updated.coordinates ?? [],
      coordinates: updated.coordinates ?? updated.points ?? null,
      pageNumber: updated.pageNumber,
      text: updated.text ?? updated.note ?? null,
      note: updated.note ?? updated.text ?? null,
      color: updated.color,
      createdAt: updated.createdAt.toISOString(),
      editedAt: updated.editedAt?.toISOString() ?? null,
      user: updated.user,
    });
  } catch (error) {
    console.error("Annotation edit error:", error);
    return res.status(500).json({ error: "Failed to update annotation" });
  }
});

// ── DELETE /evidence/:id/annotations/:annId ───────────────────────
router.delete("/:id/annotations/:annId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const evidenceId = req.params["id"] as string;
    const annId = req.params["annId"] as string;

    if (req.userRole === "AUDITOR") {
      return res.status(403).json({ error: "Auditors have read-only access and cannot delete annotations" });
    }

    const authCheck = await getAuthorizedEvidence(evidenceId, req.userId, req.userRole);
    if (authCheck.errorStatus > 0 || !authCheck.evidence) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const existing = await prisma.evidenceAnnotation.findFirst({
      where: { id: annId, evidenceId, deletedAt: null },
      include: { user: { select: { id: true, name: true, role: true } } },
    });

    if (!existing) {
      return res.status(404).json({ error: "Annotation not found" });
    }

    const isAuthor = existing.userId === req.userId;
    const isAdmin = req.userRole === "ADMINISTRATOR";

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: "You can only delete your own annotations" });
    }

    await prisma.evidenceAnnotation.update({
      where: { id: annId },
      data: { deletedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId!,
        action: isAdmin && !isAuthor ? "evidence.annotation.moderate" : "evidence.annotation.delete",
        resourceType: "evidence",
        resourceId: evidenceId,
        detailJson: {
          annotationId: annId,
          originalAuthorId: existing.userId,
          action: "soft_delete",
          moderated: isAdmin && !isAuthor,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    return res.json({ success: true, message: "Annotation deleted successfully", id: annId });
  } catch (error) {
    console.error("Annotation delete error:", error);
    return res.status(500).json({ error: "Failed to delete annotation" });
  }
});

export default router;
