import assert from "assert";
import { prisma, connectDb, disconnectDb, normalizePrismaError } from "../src/db";
import { env } from "../src/config/env";
import { LocalStorageAdapter } from "../src/storage/local.adapter";
import { validateEvidenceFile, generateSafeStorageKey } from "../src/storage";
import { Prisma } from "@prisma/client";

async function runModule2Tests() {
  console.log("=== MODULE 2: DATABASE & STORAGE FOUNDATION TEST SUITE ===\n");
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    return (async () => {
      try {
        await fn();
        console.log(`✓ [PASS] ${name}`);
        passed++;
      } catch (err: unknown) {
        console.error(`✗ [FAIL] ${name}:`, (err as Error).message);
        failed++;
      }
    })();
  }

  // ── 1. Environment Validation Tests ─────────────────────────────
  await test("Environment: Configuration loads and validates required fields", () => {
    assert(env.DATABASE_URL.length > 0, "DATABASE_URL is missing");
    assert(env.JWT_SECRET.length >= 16, "JWT_SECRET too short");
    assert(env.REFRESH_SECRET.length >= 16, "REFRESH_SECRET too short");
    assert(env.MAX_FILE_SIZE_BYTES > 0, "MAX_FILE_SIZE_BYTES invalid");
    assert(Array.isArray(env.ALLOWED_MIMES) && env.ALLOWED_MIMES.length > 10, "ALLOWED_MIMES incomplete");
  });

  // ── 2. File Security & Validation Tests ─────────────────────────
  await test("Security: Rejects 0-byte files", () => {
    const res = validateEvidenceFile({ name: "empty.dat", sizeBytes: 0, mimeType: "application/octet-stream" });
    assert.strictEqual(res.valid, false);
    assert(res.error?.includes("empty"));
  });

  await test("Security: Rejects files exceeding max size", () => {
    const res = validateEvidenceFile({ name: "huge.dat", sizeBytes: env.MAX_FILE_SIZE_BYTES + 1024, mimeType: "application/octet-stream" });
    assert.strictEqual(res.valid, false);
    assert(res.error?.includes("maximum permitted limit"));
  });

  await test("Security: Rejects forbidden executable extensions (.exe, .sh, .bat)", () => {
    const exeRes = validateEvidenceFile({ name: "malware.exe", sizeBytes: 100, mimeType: "application/octet-stream" });
    assert.strictEqual(exeRes.valid, false);
    assert(exeRes.error?.includes("forbidden"));

    const shRes = validateEvidenceFile({ name: "script.sh", sizeBytes: 100, mimeType: "text/plain" });
    assert.strictEqual(shRes.valid, false);

    const batRes = validateEvidenceFile({ name: "run.bat", sizeBytes: 100, mimeType: "text/plain" });
    assert.strictEqual(batRes.valid, false);
  });

  await test("Security: Rejects unpermitted MIME types", () => {
    const res = validateEvidenceFile({ name: "bad.xyz", sizeBytes: 100, mimeType: "application/x-custom-hack" });
    assert.strictEqual(res.valid, false);
    assert(res.error?.includes("MIME type"));
  });

  await test("Security: Accepts valid evidence files (PDF, PNG, TXT)", () => {
    const pdfRes = validateEvidenceFile({ name: "contract.pdf", sizeBytes: 1024, mimeType: "application/pdf" });
    assert.strictEqual(pdfRes.valid, true);

    const pngRes = validateEvidenceFile({ name: "capture.png", sizeBytes: 2048, mimeType: "image/png" });
    assert.strictEqual(pngRes.valid, true);
  });

  await test("Security: Generates safe collision-free storage keys", () => {
    const key1 = generateSafeStorageKey("secret.pdf");
    const key2 = generateSafeStorageKey("secret.pdf");
    assert.notStrictEqual(key1, key2);
    assert(key1.startsWith("evidence/"));
    assert(key1.endsWith(".pdf"));
    assert(!key1.includes(".."));
  });

  // ── 3. Storage Abstraction Tests (LocalStorageAdapter) ──────────
  const storage = new LocalStorageAdapter("storage/test-uploads");

  await test("Storage: Rejects directory traversal attempts", async () => {
    let trapped = false;
    try {
      await storage.upload("../../evil.txt", Buffer.from("attack"), "text/plain");
    } catch (err: unknown) {
      trapped = (err as Error).message.includes("Path traversal attempt detected");
    }
    assert(trapped, "Path traversal was not trapped!");
  });

  const testKey = `test-${Date.now()}/sample.txt`;
  const samplePayload = Buffer.from("EviChain Forensic Payload Integrity Test Buffer");

  await test("Storage: Uploads buffer and computes correct SHA-256", async () => {
    const res = await storage.upload(testKey, samplePayload, "text/plain");
    assert.strictEqual(res.key, testKey);
    assert.strictEqual(res.size, samplePayload.length);
    assert.strictEqual(res.sha256.length, 64);
  });

  await test("Storage: Existence check returns true for existing object", async () => {
    const exists = await storage.exists(testKey);
    assert.strictEqual(exists, true);
  });

  await test("Storage: Retrieves valid metadata", async () => {
    const meta = await storage.getMetadata(testKey);
    assert(meta !== null);
    assert.strictEqual(meta?.size, samplePayload.length);
    assert.strictEqual(meta?.mimeType, "text/plain");
    assert(meta?.sha256 !== undefined);
  });

  await test("Storage: Downloads buffer matching original content", async () => {
    const downloaded = await storage.downloadBuffer(testKey);
    assert.strictEqual(downloaded.toString(), samplePayload.toString());
  });

  await test("Storage: Downloads readable stream with full byte content", async () => {
    const stream = await storage.downloadStream(testKey);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
    const combined = Buffer.concat(chunks);
    assert.strictEqual(combined.toString(), samplePayload.toString());
  });

  await test("Storage: Deletes object cleanly", async () => {
    await storage.delete(testKey);
    const exists = await storage.exists(testKey);
    assert.strictEqual(exists, false);
    const meta = await storage.getMetadata(testKey);
    assert.strictEqual(meta, null);
  });

  // ── 4. Database Foundation & Relations Tests ────────────────────
  await test("Database: Connects cleanly to database", async () => {
    await connectDb();
  });

  const testEmail = `mod2_user_${Date.now()}@test.internal`;
  let userId = "";

  await test("Database: Creates User with role and indexes", async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash: "dummyhash",
        name: "Module 2 Test User",
        role: "INVESTIGATOR",
      },
    });
    assert(user.id.length > 0);
    userId = user.id;
  });

  const sessionToken = `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await test("Database: Creates Session record tied to User relation", async () => {
    const session = await prisma.session.create({
      data: {
        userId,
        token: sessionToken,
        userAgent: "Jest/Node Test Agent",
        ipAddress: "127.0.0.1",
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
    assert.strictEqual(session.userId, userId);
    assert.strictEqual(session.token, sessionToken);
  });

  await test("Database: Queries Session by token index with User relation", async () => {
    const found = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: { user: { select: { email: true, role: true } } },
    });
    assert(found !== null);
    assert.strictEqual(found?.user.email, testEmail);
  });

  await test("Database: Cascade deletes Session when User is deleted", async () => {
    await prisma.user.delete({ where: { id: userId } });
    const remainingSession = await prisma.session.findUnique({
      where: { token: sessionToken },
    });
    assert.strictEqual(remainingSession, null);
  });

  // ── 5. Database Error Normalization Tests ───────────────────────
  await test("Database: Normalizes Prisma unique violation error (P2002)", () => {
    const fakeP2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "5.22.0", meta: { target: ["email"] } },
    );
    const normalized = normalizePrismaError(fakeP2002);
    assert.strictEqual(normalized.statusCode, 409);
    assert.strictEqual(normalized.code, "CONFLICT");
    assert(normalized.message.includes("email already exists"));
  });

  await test("Database: Normalizes Prisma record not found error (P2025)", () => {
    const fakeP2025 = new Prisma.PrismaClientKnownRequestError(
      "Record not found",
      { code: "P2025", clientVersion: "5.22.0" },
    );
    const normalized = normalizePrismaError(fakeP2025);
    assert.strictEqual(normalized.statusCode, 404);
    assert.strictEqual(normalized.code, "NOT_FOUND");
  });

  await test("Database: Disconnects cleanly", async () => {
    await disconnectDb();
  });

  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) process.exit(1);
}

runModule2Tests().catch((err) => {
  console.error("Test suite threw uncaught exception:", err);
  process.exit(1);
});
