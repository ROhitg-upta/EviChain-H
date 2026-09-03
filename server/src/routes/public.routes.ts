import { Router } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { prisma } from "../db";
import { createRateLimiter } from "../middleware";

const router = Router();

// Rate limiter for public verification: 60 attempts / minute per IP
const publicLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many verification requests. Please try again in one minute.",
});

router.use(publicLimiter);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

/** Safe public-facing evidence shape — strict privacy guarantee */
function safeEvidence(e: {
  id: string;
  name: string;
  type: string;
  ownerOrg: string;
  status: string;
  sha256: string;
  sizeBytes: number;
  createdAt: Date;
} | null) {
  if (!e) return null;
  return {
    id: e.id,
    name: e.name,
    filename: e.name,
    type: e.type,
    fileType: e.type,
    ownerOrg: e.ownerOrg,
    status: e.status,
    sha256: e.sha256,
    fileSize: e.sizeBytes,
    sizeBytes: e.sizeBytes,
    registeredAt: e.createdAt.toISOString(),
  };
}

const SHA256_REGEX = /^[a-f0-9]{64}$/i;

async function performHashLookup(rawHash: string, method: "HASH" | "FILE", reqIp?: string, userAgent?: string) {
  const normalized = rawHash.trim().toLowerCase();

  const evidence = await prisma.evidence.findFirst({
    where: { sha256: normalized },
    select: {
      id: true,
      name: true,
      type: true,
      ownerOrg: true,
      status: true,
      sha256: true,
      sizeBytes: true,
      createdAt: true,
    },
  });

  // Record privacy-safe public verification audit event
  try {
    await prisma.auditLog.create({
      data: {
        action: "public.verify",
        resourceType: "evidence",
        resourceId: evidence ? evidence.id : "unmatched",
        detailJson: {
          method,
          sha256: normalized,
          matched: Boolean(evidence),
        },
        ipAddress: reqIp,
        userAgent,
      },
    });
  } catch (auditErr) {
    console.error("Public verification audit error:", auditErr);
  }

  const isMatched = evidence !== null;
  const safeData = safeEvidence(evidence);

  return {
    verified: isMatched,
    matched: isMatched,
    sha256: normalized,
    result: isMatched ? "VERIFIED" : "NOT_FOUND",
    evidence: safeData,
  };
}

// ═══════════════════════════════════════════════════════════════════
// POST /public/verify  — Dual endpoint: file upload OR json hash
// ═══════════════════════════════════════════════════════════════════
router.post(
  "/verify",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            error: {
              code: "FILE_TOO_LARGE",
              message: "File exceeds 50MB verification limit.",
              status: 413,
            },
            code: "FILE_TOO_LARGE",
            message: "File exceeds 50MB verification limit.",
          });
        }
        return res.status(400).json({
          error: {
            code: "UPLOAD_ERROR",
            message: `Upload error: ${err.message}`,
            status: 400,
          },
          code: "UPLOAD_ERROR",
        });
      }
      if (err instanceof Error) {
        return res.status(400).json({
          error: { code: "UPLOAD_ERROR", message: err.message, status: 400 },
          code: "UPLOAD_ERROR",
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      // 1. File verification mode
      if (req.file) {
        if (req.file.size === 0) {
          return res.status(400).json({
            error: { code: "FILE_EMPTY", message: "Uploaded file is 0 bytes.", status: 400 },
            code: "FILE_EMPTY",
          });
        }
        const sha256 = createHash("sha256").update(req.file.buffer).digest("hex");
        const result = await performHashLookup(sha256, "FILE", req.ip, req.headers["user-agent"]);
        return res.json(result);
      }

      // 2. JSON hash verification mode
      const rawHash = typeof req.body?.sha256 === "string" ? req.body.sha256 : undefined;
      if (!rawHash || typeof rawHash !== "string") {
        return res.status(400).json({
          error: {
            code: "HASH_OR_FILE_REQUIRED",
            message: "Either a file or a valid 64-character sha256 hash must be provided.",
            status: 400,
          },
          code: "HASH_OR_FILE_REQUIRED",
        });
      }

      const trimmed = rawHash.trim();
      if (!SHA256_REGEX.test(trimmed)) {
        return res.status(400).json({
          error: {
            code: "INVALID_SHA256",
            message: "Invalid SHA-256 format — must be exactly 64 hexadecimal characters (0-9, a-f).",
            status: 400,
          },
          code: "INVALID_SHA256",
        });
      }

      const result = await performHashLookup(trimmed, "HASH", req.ip, req.headers["user-agent"]);
      return res.json(result);
    } catch (error) {
      console.error("Public verify error:", error);
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Verification failed.", status: 500 },
        code: "INTERNAL_ERROR",
      });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// POST /public/verify/hash  — Dedicated JSON hash verification
// ═══════════════════════════════════════════════════════════════════
router.post("/verify/hash", async (req, res) => {
  try {
    const rawHash = req.body?.sha256;
    if (!rawHash || typeof rawHash !== "string") {
      return res.status(400).json({
        error: {
          code: "INVALID_SHA256",
          message: "A 64-character hexadecimal sha256 string is required in the request body.",
          status: 400,
        },
        code: "INVALID_SHA256",
      });
    }

    const trimmed = rawHash.trim();
    if (!SHA256_REGEX.test(trimmed)) {
      return res.status(400).json({
        error: {
          code: "INVALID_SHA256",
          message: "Invalid SHA-256 format — must be exactly 64 hexadecimal characters (0-9, a-f).",
          status: 400,
        },
        code: "INVALID_SHA256",
      });
    }

    const result = await performHashLookup(trimmed, "HASH", req.ip, req.headers["user-agent"]);
    return res.json(result);
  } catch (error) {
    console.error("Public hash verify error:", error);
    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Hash verification failed.", status: 500 },
      code: "INTERNAL_ERROR",
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /public/verify/file  — Dedicated file verification
// ═══════════════════════════════════════════════════════════════════
router.post(
  "/verify/file",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            error: {
              code: "FILE_TOO_LARGE",
              message: "File exceeds 50MB verification limit.",
              status: 413,
            },
            code: "FILE_TOO_LARGE",
          });
        }
        return res.status(400).json({
          error: {
            code: "UPLOAD_ERROR",
            message: `Upload error: ${err.message}`,
            status: 400,
          },
          code: "UPLOAD_ERROR",
        });
      }
      if (err instanceof Error) {
        return res.status(400).json({
          error: { code: "UPLOAD_ERROR", message: err.message, status: 400 },
          code: "UPLOAD_ERROR",
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: { code: "FILE_REQUIRED", message: "A file payload is required.", status: 400 },
          code: "FILE_REQUIRED",
        });
      }

      if (req.file.size === 0) {
        return res.status(400).json({
          error: { code: "FILE_EMPTY", message: "Uploaded file is 0 bytes.", status: 400 },
          code: "FILE_EMPTY",
        });
      }

      const sha256 = createHash("sha256").update(req.file.buffer).digest("hex");
      const result = await performHashLookup(sha256, "FILE", req.ip, req.headers["user-agent"]);
      return res.json(result);
    } catch (error) {
      console.error("Public file verify error:", error);
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "File verification failed.", status: 500 },
        code: "INTERNAL_ERROR",
      });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /public/verify/:sha256 or /public/verify/hash/:sha256  — Read-only lookup
// ═══════════════════════════════════════════════════════════════════
router.get(["/verify/:sha256", "/verify/hash/:sha256"], async (req, res) => {
  try {
    const raw = req.params["sha256"] as string;
    const trimmed = raw ? raw.trim() : "";

    if (!SHA256_REGEX.test(trimmed)) {
      return res.status(400).json({
        error: {
          code: "INVALID_SHA256",
          message: "Invalid SHA-256 format — must be exactly 64 hexadecimal characters",
          status: 400,
        },
        code: "INVALID_SHA256",
      });
    }

    const result = await performHashLookup(trimmed, "HASH", req.ip, req.headers["user-agent"]);
    return res.json(result);
  } catch (error) {
    console.error("Public hash lookup error:", error);
    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Lookup failed", status: 500 },
      code: "INTERNAL_ERROR",
    });
  }
});

export default router;
