import { Router } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { prisma } from "../db";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

/** Safe public-facing evidence shape — never expose private fields */
function safeEvidence(e: {
  id: string;
  name: string;
  type: string;
  ownerOrg: string;
  status: string;
  sha256: string;
  createdAt: Date;
} | null) {
  if (!e) return null;
  return {
    id: e.id,
    name: e.name,
    type: e.type,
    ownerOrg: e.ownerOrg,
    status: e.status,
    sha256: e.sha256,
    registeredAt: e.createdAt,
  };
}

// ═══════════════════════════════════════════════════════════════════
// POST /public/verify  — Upload file, compute hash, check registry
// ═══════════════════════════════════════════════════════════════════
router.post("/verify", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "A file is required" });
    }

    const sha256 = createHash("sha256").update(file.buffer).digest("hex");

    const evidence = await prisma.evidence.findFirst({
      where: { sha256 },
      select: {
        id: true,
        name: true,
        type: true,
        ownerOrg: true,
        status: true,
        sha256: true,
        createdAt: true,
      },
    });

    return res.json({
      sha256,
      matched: evidence !== null,
      evidence: safeEvidence(evidence),
    });
  } catch (error) {
    console.error("Public verify error:", error);
    return res.status(500).json({ error: "Verification failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /public/verify/:sha256 or /public/verify/hash/:sha256  — Hash lookup
// ═══════════════════════════════════════════════════════════════════
router.get(["/verify/:sha256", "/verify/hash/:sha256"], async (req, res) => {
  try {
    const raw = req.params["sha256"] as string;

    if (!/^[a-f0-9]{64}$/i.test(raw)) {
      return res.status(400).json({
        error: "Invalid SHA-256 format — must be exactly 64 hexadecimal characters",
      });
    }

    const sha256 = raw.toLowerCase();

    const evidence = await prisma.evidence.findFirst({
      where: { sha256 },
      select: {
        id: true,
        name: true,
        type: true,
        ownerOrg: true,
        status: true,
        sha256: true,
        createdAt: true,
      },
    });

    return res.json({
      sha256,
      matched: evidence !== null,
      evidence: safeEvidence(evidence),
    });
  } catch (error) {
    console.error("Public hash lookup error:", error);
    return res.status(500).json({ error: "Lookup failed" });
  }
});

export default router;
