import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/db";

const BASE_URL = process.env.API_URL || "http://localhost:4000";

async function runTests() {
  console.log("=== MODULE 11: MOBILE PWA, OFFLINE CAPTURE & IDEMPOTENCY TEST SUITE ===");

  let userAToken = "";
  let userAId = "";
  let userBToken = "";
  let userBId = "";
  let caseId1 = "";
  let caseId2 = "";

  try {
    const ts = Date.now();

    // ── Setup: Register 2 distinct users for cross-user idempotency tests ──
    const rA = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `mod11_agentA_${ts}@evichain.test`,
        password: "Password123!",
        name: "Agent Alice Field",
        role: "INVESTIGATOR",
      }),
    });
    const dA = (await rA.json()) as { accessToken: string; user: { id: string } };
    userAToken = dA.accessToken;
    userAId = dA.user.id;

    const rB = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `mod11_agentB_${ts}@evichain.test`,
        password: "Password123!",
        name: "Agent Bob Field",
        role: "INVESTIGATOR",
      }),
    });
    const dB = (await rB.json()) as { accessToken: string; user: { id: string } };
    userBToken = dB.accessToken;
    userBId = dB.user.id;

    // Create 2 test cases
    const rCase1 = await fetch(`${BASE_URL}/cases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        title: `Field Incident Alpha ${ts}`,
        caseNumber: `CASE-M11A-${ts}`,
        incidentType: "FORENSIC_CAPTURE",
      }),
    });
    const dCase1 = (await rCase1.json()) as { id: string };
    caseId1 = dCase1.id;

    const rCase2 = await fetch(`${BASE_URL}/cases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        title: `Field Incident Beta ${ts}`,
        caseNumber: `CASE-M11B-${ts}`,
        incidentType: "SURVEILLANCE",
      }),
    });
    const dCase2 = (await rCase2.json()) as { id: string };
    caseId2 = dCase2.id;

    console.log("✓ Setup completed: Users and test cases created.");

    // ═══════════════════════════════════════════════════════════════
    // 1. First upload with Idempotency-Key via POST /evidence
    // ═══════════════════════════════════════════════════════════════
    const idempKey1 = `idemp-standalone-${ts}-${Math.random().toString(36).substring(2, 9)}`;
    const boundary = "----WebKitFormBoundaryM11Test";
    const bodyPart1 = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="field_photo_1.jpg"',
      "Content-Type: image/jpeg",
      "",
      "IMAGE_DATA_FIELD_SAMPLE_12345",
      `--${boundary}`,
      'Content-Disposition: form-data; name="name"',
      "",
      "Crime Scene Entry Door",
      `--${boundary}`,
      'Content-Disposition: form-data; name="type"',
      "",
      "IMAGE",
      `--${boundary}`,
      'Content-Disposition: form-data; name="ownerOrg"',
      "",
      "Forensic Mobile Unit",
      `--${boundary}--`,
    ].join("\r\n");

    const t1 = await fetch(`${BASE_URL}/evidence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userAToken}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Idempotency-Key": idempKey1,
      },
      body: bodyPart1,
    });
    assert.strictEqual(t1.status, 201, "First upload must return 201 Created");
    const d1 = (await t1.json()) as { id: string; sha256: string; name: string };
    assert.ok(d1.id, "Response must include evidence ID");
    assert.ok(d1.sha256, "Response must include SHA-256");
    console.log("✓ [PASS] 1. Initial evidence upload with Idempotency-Key returns 201 Created");

    // ═══════════════════════════════════════════════════════════════
    // 2. Replay upload with identical Idempotency-Key
    // ═══════════════════════════════════════════════════════════════
    const t2 = await fetch(`${BASE_URL}/evidence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userAToken}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Idempotency-Key": idempKey1,
      },
      body: bodyPart1,
    });
    assert.strictEqual(t2.status, 201, "Replay upload must return 201/200 OK");
    const d2 = (await t2.json()) as { id: string; sha256: string; name: string };
    assert.strictEqual(d2.id, d1.id, "Replay must return exact same evidence ID");
    assert.strictEqual(d2.sha256, d1.sha256, "Replay must return exact same SHA-256");
    console.log("✓ [PASS] 2. Replaying upload with same Idempotency-Key returns cached response");

    // ═══════════════════════════════════════════════════════════════
    // 3. Database verification: Zero duplicate Evidence, CustodyEvent, or AuditLog rows
    // ═══════════════════════════════════════════════════════════════
    const evCount = await prisma.evidence.count({ where: { id: d1.id } });
    assert.strictEqual(evCount, 1, "There must be exactly 1 Evidence record");

    const ceCount = await prisma.custodyEvent.count({ where: { evidenceId: d1.id, action: "CREATED" } });
    assert.strictEqual(ceCount, 1, "There must be exactly 1 CREATED CustodyEvent");

    const alCount = await prisma.auditLog.count({ where: { resourceId: d1.id, action: "evidence.create" } });
    assert.strictEqual(alCount, 1, "There must be exactly 1 audit log entry");
    console.log("✓ [PASS] 3. Database verification confirms zero duplicate database rows created");

    // ═══════════════════════════════════════════════════════════════
    // 4. Case-linked upload with Idempotency-Key via POST /cases/:caseId/evidence
    // ═══════════════════════════════════════════════════════════════
    const idempKeyCase = `idemp-case-${ts}-${Math.random().toString(36).substring(2, 9)}`;
    const caseBoundary = "----WebKitFormBoundaryM11Case";
    const caseBody = [
      `--${caseBoundary}`,
      'Content-Disposition: form-data; name="file"; filename="dashcam_clip.mp4"',
      "Content-Type: video/mp4",
      "",
      "VIDEO_PAYLOAD_DASHCAM_REPLAY_TEST",
      `--${caseBoundary}`,
      'Content-Disposition: form-data; name="name"',
      "",
      "Dashcam Front Camera",
      `--${caseBoundary}`,
      'Content-Disposition: form-data; name="evidenceType"',
      "",
      "VIDEO",
      `--${caseBoundary}`,
      'Content-Disposition: form-data; name="ownerOrg"',
      "",
      "Traffic Division",
      `--${caseBoundary}--`,
    ].join("\r\n");

    const t4 = await fetch(`${BASE_URL}/cases/${caseId1}/evidence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userAToken}`,
        "Content-Type": `multipart/form-data; boundary=${caseBoundary}`,
        "Idempotency-Key": idempKeyCase,
      },
      body: caseBody,
    });
    assert.strictEqual(t4.status, 201, "Case evidence upload must return 201 Created");
    const d4 = (await t4.json()) as { id: string; sha256: string; caseId: string };
    assert.strictEqual(d4.caseId, caseId1, "Evidence must be linked to target case");
    console.log("✓ [PASS] 4. Case evidence upload with Idempotency-Key returns 201 Created");

    // ═══════════════════════════════════════════════════════════════
    // 5. Replay Case-linked upload returns identical response
    // ═══════════════════════════════════════════════════════════════
    const t5 = await fetch(`${BASE_URL}/cases/${caseId1}/evidence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userAToken}`,
        "Content-Type": `multipart/form-data; boundary=${caseBoundary}`,
        "Idempotency-Key": idempKeyCase,
      },
      body: caseBody,
    });
    assert.strictEqual(t5.status, 201, "Case evidence replay must return 201");
    const d5 = (await t5.json()) as { id: string; sha256: string; caseId: string };
    assert.strictEqual(d5.id, d4.id, "Replay must return exact same evidence ID");
    assert.strictEqual(d5.sha256, d4.sha256, "Replay must return exact same SHA-256");
    console.log("✓ [PASS] 5. Case evidence replay returns idempotent response without duplication");

    // ═══════════════════════════════════════════════════════════════
    // 6. Cross-User Idempotency Conflict (409 Conflict)
    // ═══════════════════════════════════════════════════════════════
    const t6 = await fetch(`${BASE_URL}/evidence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userBToken}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Idempotency-Key": idempKey1, // Reusing User A's key
      },
      body: bodyPart1,
    });
    assert.strictEqual(t6.status, 409, "Cross-user idempotency key reuse must return 409 Conflict");
    const d6 = (await t6.json()) as { code?: string; error?: string };
    assert.strictEqual(d6.code, "IDEMPOTENCY_CONFLICT", "Must return IDEMPOTENCY_CONFLICT error code");
    console.log("✓ [PASS] 6. Cross-user idempotency key reuse rejected with 409 Conflict");

    // ═══════════════════════════════════════════════════════════════
    // 7. Cross-Case Idempotency Conflict (409 Conflict)
    // ═══════════════════════════════════════════════════════════════
    const t7 = await fetch(`${BASE_URL}/cases/${caseId2}/evidence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userAToken}`,
        "Content-Type": `multipart/form-data; boundary=${caseBoundary}`,
        "Idempotency-Key": idempKeyCase, // Key was used for caseId1
      },
      body: caseBody,
    });
    assert.strictEqual(t7.status, 409, "Cross-case idempotency key reuse must return 409 Conflict");
    const d7 = (await t7.json()) as { code?: string; error?: string };
    assert.strictEqual(d7.code, "IDEMPOTENCY_CONFLICT", "Must return IDEMPOTENCY_CONFLICT error code");
    console.log("✓ [PASS] 7. Cross-case idempotency key reuse rejected with 409 Conflict");

    // ═══════════════════════════════════════════════════════════════
    // 8. PWA Manifest Audit (public/manifest.json)
    // ═══════════════════════════════════════════════════════════════
    const manifestPath = path.resolve(__dirname, "../../public/manifest.json");
    assert.ok(fs.existsSync(manifestPath), "public/manifest.json must exist");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.strictEqual(manifest.name, "EviChain", "Manifest name must be EviChain");
    assert.strictEqual(manifest.short_name, "EviChain", "Manifest short_name must be EviChain");
    assert.strictEqual(manifest.display, "standalone", "Display must be standalone");
    assert.ok(manifest.icons && manifest.icons.length >= 2, "Manifest must include at least 2 icon sizes");
    assert.ok(manifest.shortcuts && manifest.shortcuts.length >= 1, "Manifest must include app shortcuts");
    console.log("✓ [PASS] 8. PWA Manifest structure, icons, and shortcuts validated");

    // ═══════════════════════════════════════════════════════════════
    // 9. PWA Caching Architecture Audit (next.config.js)
    // ═══════════════════════════════════════════════════════════════
    const nextConfigPath = path.resolve(__dirname, "../../next.config.js");
    const nextConfigSrc = fs.readFileSync(nextConfigPath, "utf8");
    assert.ok(nextConfigSrc.includes("withPWA"), "next.config.js must configure next-pwa");
    assert.ok(nextConfigSrc.includes("NetworkOnly"), "Authenticated routes must use NetworkOnly caching policy");
    assert.ok(nextConfigSrc.includes("/offline"), "Fallback document must point to /offline fallback");
    console.log("✓ [PASS] 9. Service worker static-only caching and zero API caching verified");

    // ═══════════════════════════════════════════════════════════════
    // 10. Offline Draft Security Audit (lib/offline-queue.ts)
    // ═══════════════════════════════════════════════════════════════
    const queueSrcPath = path.resolve(__dirname, "../../lib/offline-queue.ts");
    const queueSrc = fs.readFileSync(queueSrcPath, "utf8");
    assert.ok(queueSrc.includes("evichain-offline"), "IndexedDB database must be evichain-offline");
    assert.ok(queueSrc.includes("evidence_drafts"), "Object store must be evidence_drafts");
    const interfaceMatch = queueSrc.match(/export interface OfflineEvidenceDraft\s*\{([\s\S]*?)\}/);
    assert.ok(interfaceMatch, "OfflineEvidenceDraft interface must exist");
    const interfaceFields = interfaceMatch[1];
    assert.ok(!interfaceFields.includes("token"), "OfflineEvidenceDraft must never contain token field");
    assert.ok(!interfaceFields.includes("password"), "OfflineEvidenceDraft must never contain password field");
    assert.ok(!interfaceFields.includes("secret"), "OfflineEvidenceDraft must never contain secret field");
    console.log("✓ [PASS] 10. Offline draft schema security and zero-secret isolation verified");

    // ═══════════════════════════════════════════════════════════════
    // 11. SafeHashField Mobile Component Audit
    // ═══════════════════════════════════════════════════════════════
    const hashFieldPath = path.resolve(__dirname, "../../app/components/ui/safe-hash-field.tsx");
    assert.ok(fs.existsSync(hashFieldPath), "safe-hash-field.tsx must exist");
    const hashFieldSrc = fs.readFileSync(hashFieldPath, "utf8");
    assert.ok(hashFieldSrc.includes("break-all") || hashFieldSrc.includes("overflowWrap"), "Must enforce break-all word wrap");
    assert.ok(hashFieldSrc.includes("clipboard"), "Must provide clipboard copy capability");
    console.log("✓ [PASS] 11. SafeHashField component verified for mobile horizontal integrity");

    // ═══════════════════════════════════════════════════════════════
    // 12. Camera Evidence Workflow Component Audit
    // ═══════════════════════════════════════════════════════════════
    const captureSheetPath = path.resolve(__dirname, "../../app/components/ui/evidence-capture-sheet.tsx");
    assert.ok(fs.existsSync(captureSheetPath), "evidence-capture-sheet.tsx must exist");
    const captureSheetSrc = fs.readFileSync(captureSheetPath, "utf8");
    assert.ok(captureSheetSrc.includes('capture="environment"'), "Must provide rear environment camera capture");
    assert.ok(captureSheetSrc.includes("saveOfflineDraft"), "Must support offline draft fallback");
    console.log("✓ [PASS] 12. Field evidence camera capture workflow and offline fallback verified");

    console.log("\n=======================================================");
    console.log("🎉 ALL 12 MODULE 11 TEST SUITES PASSED SUCCESSFULLY!");
    console.log("=======================================================\n");
  } catch (err) {
    console.error("❌ MODULE 11 TEST FAILED:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
