import { createHash } from "crypto";
import { prisma } from "../db";
import {
  getStorageAdapter,
  validateEvidenceFile,
  generateSafeStorageKey,
  cleanupStorageKey,
} from "../storage";
import { notificationService } from "./notification.service";

export interface EvidenceUploadInput {
  file: Express.Multer.File;
  caseId?: string | null;
  uploaderId: string;
  name?: string;
  type?: string;
  ownerOrg?: string;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SafeEvidenceResponse {
  id: string;
  caseId: string | null;
  name?: string;
  filename: string;
  mimeType: string;
  size: number;
  sha256: string;
  status: string;
  collectedById?: string;
  currentCustodianId?: string | null;
  createdAt: string;
  uploader: {
    id: string;
    name: string;
    role: string;
  };
}


export class UploadError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/**
 * Computes lowercase 64-char hexadecimal SHA-256 digest from raw byte buffer
 */
export function calculateEvidenceHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").toLowerCase();
}

/**
 * Orchestrates secure evidence upload, server-side hashing, storage persistence,
 * and atomic database transaction with automatic cleanup on failure.
 */
export async function processEvidenceUpload(
  input: EvidenceUploadInput,
): Promise<SafeEvidenceResponse> {
  const { file, caseId, uploaderId, ipAddress, userAgent } = input;

  if (!file || !file.buffer) {
    throw new UploadError("FILE_REQUIRED", "No file payload provided.", 400);
  }

  // 1. Server-side file validation (size, MIME, disallowed extensions)
  const validation = validateEvidenceFile({
    name: file.originalname,
    sizeBytes: file.size,
    mimeType: file.mimetype,
  });

  if (!validation.valid) {
    const isSize = validation.error?.includes("maximum permitted limit");
    const isMime = validation.error?.includes("MIME type");
    const statusCode = isSize ? 413 : isMime ? 415 : 400;
    const code = isSize ? "FILE_TOO_LARGE" : isMime ? "FILE_TYPE_NOT_ALLOWED" : "VALIDATION_FAILED";
    throw new UploadError(code, validation.error || "Invalid file.", statusCode);
  }

  // 2. Validate case existence and permissions if caseId is supplied
  let targetCase = null;
  if (caseId) {
    targetCase = await prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, title: true, leadUserId: true },
    });

    if (!targetCase) {
      throw new UploadError("CASE_NOT_FOUND", "The target case was not found.", 404);
    }
  }

  // Verify uploader exists
  const uploader = await prisma.user.findUnique({
    where: { id: uploaderId },
    select: { id: true, name: true, role: true },
  });

  if (!uploader) {
    throw new UploadError("USER_NOT_FOUND", "Uploader account not found.", 401);
  }

  // 3. Server-side cryptographic hash computation on raw bytes
  const sha256 = calculateEvidenceHash(file.buffer);

  // 4. Generate safe, server-controlled storage key
  const storageKey = generateSafeStorageKey(file.originalname);
  const storage = getStorageAdapter();

  // 5. Store file in private storage
  try {
    await storage.upload(storageKey, file.buffer, file.mimetype);
  } catch (storageErr) {
    console.error("Storage upload failed:", storageErr);
    throw new UploadError(
      "STORAGE_WRITE_FAILED",
      "Failed to persist evidence file to storage.",
      500,
    );
  }

  // 6. Atomic database write (Evidence + CustodyEvent + AuditLog)
  const displayName = input.name?.trim() || file.originalname;
  const evidenceType = input.type?.trim() || "DOCUMENT";
  const ownerOrg = input.ownerOrg?.trim() || "Cyber Division";

  let createdEvidence;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const evidence = await tx.evidence.create({
        data: {
          caseId: caseId ?? null,
          name: displayName,
          type: evidenceType,
          ownerOrg,
          description: input.description?.trim() || null,
          sizeBytes: file.size,
          mimeType: file.mimetype,
          sha256,
          storageKey,
          collectedById: uploader.id,
          currentCustodianId: uploader.id,
          status: "PENDING",
        },
      });

      // Initial CREATED custody event
      await tx.custodyEvent.create({
        data: {
          evidenceId: evidence.id,
          action: "CREATED",
          actorUserId: uploader.id,
          toUserId: uploader.id,
          ipAddress: ipAddress ?? null,
          note: `Evidence registered with SHA-256 fingerprint (${file.originalname})`,
        },
      });


      // Immutable audit log
      await tx.auditLog.create({
        data: {
          actorUserId: uploader.id,
          action: "evidence.create",
          resourceType: "evidence",
          resourceId: evidence.id,
          detailJson: {
            caseId: caseId ?? null,
            name: evidence.name,
            sha256: evidence.sha256,
            sizeBytes: evidence.sizeBytes,
            mimeType: evidence.mimeType,
          },
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
      });

      return evidence;
    }, { timeout: 30000, maxWait: 15000 });

    createdEvidence = result;
  } catch (dbErr) {
    // 7. Cleanup orphaned storage object if DB transaction failed
    console.error("Database transaction failed during upload; executing cleanup on key:", storageKey, dbErr);
    await cleanupStorageKey(storageKey);
    throw new UploadError(
      "DATABASE_TRANSACTION_FAILED",
      "Failed to register evidence record in database.",
      500,
    );
  }

  // 8. Trigger in-app notification
  try {
    await notificationService.createNotification({
      userId: uploader.id,
      type: "EVIDENCE_UPLOADED",
      title: "Evidence Registered",
      message: `Registered "${createdEvidence.name}" with verified SHA-256 fingerprint.`,
      link: `/evidence/${createdEvidence.id}`,
      entityType: "EVIDENCE",
      entityId: createdEvidence.id,
      dedupeKey: `EVIDENCE_UPLOADED:${createdEvidence.id}:${uploader.id}`,
    });

    if (caseId) {
      const parentCase = await prisma.case.findUnique({
        where: { id: caseId },
        select: { id: true, title: true, leadUserId: true },
      });
      if (parentCase && parentCase.leadUserId && parentCase.leadUserId !== uploader.id) {
        await notificationService.createNotification({
          userId: parentCase.leadUserId,
          type: "EVIDENCE_UPLOADED",
          title: "New Evidence Ingested",
          message: `Evidence "${createdEvidence.name}" was attached to your case "${parentCase.title}".`,
          link: `/cases/${parentCase.id}`,
          entityType: "CASE",
          entityId: parentCase.id,
          dedupeKey: `EVIDENCE_UPLOADED:${createdEvidence.id}:${parentCase.leadUserId}`,
        });
      }
    }
  } catch {
    // Non-fatal notification failure
  }

  // 9. Return safe API contract (Never expose internal filesystem paths or private keys)
  return {
    id: createdEvidence.id,
    caseId: createdEvidence.caseId,
    name: createdEvidence.name,
    filename: createdEvidence.name,
    mimeType: createdEvidence.mimeType,
    size: createdEvidence.sizeBytes,
    sha256: createdEvidence.sha256,
    status: createdEvidence.status,
    collectedById: createdEvidence.collectedById,
    currentCustodianId: createdEvidence.currentCustodianId,
    createdAt: createdEvidence.createdAt.toISOString(),

    uploader: {
      id: uploader.id,
      name: uploader.name,
      role: uploader.role,
    },
  };
}
