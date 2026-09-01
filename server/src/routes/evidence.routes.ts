import { Router } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, AuthedRequest, requireRole } from "../middleware";

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
  caseId: z.string().uuid("caseId must be a valid UUID").optional(),
  name: z.string().min(2, "name must be at least 2 characters"),
  type: z.string().min(1),
  ownerOrg: z.string().min(2, "ownerOrg must be at least 2 characters"),
  description: z.string().max(2000).optional(),
  tags: z.string().max(500).optional(),
});

// ── Helper: safe JSON send ────────────────────────────────────────
function jsonErr(res: ReturnType<typeof router.use>, status: number, msg: string) {
  return (res as unknown as import("express").Response)
    .status(status)
    .json({ error: msg });
}

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

    // Log ACCESSED event
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
// GET /evidence/:id/download
// ═══════════════════════════════════════════════════════════════════
router.get("/:id/download", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = req.params["id"] as string;

    const evidence = await prisma.evidence.findUnique({ where: { id } });

    if (!evidence) {
      return res.status(404).json({ error: "Evidence not found" });
    }

    // In a production system the storageKey would be used to fetch from S3.
    // For this deployment files are not persisted after upload, so we return
    // a structured JSON response that tells the client the file metadata.
    // When S3 integration is added, replace the block below with a presigned
    // URL redirect or a stream pipe.

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

    // Return metadata + storage key so the caller knows what was "downloaded".
    // Swap this for a real stream when file storage is wired up.
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

    // Delete existing annotations and replace with new set
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
