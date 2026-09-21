import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const prisma = new PrismaClient();

async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

async function main() {
  console.log("🌱 [EviChain] Starting comprehensive database seed...");

  const defaultPassword = "Password123!";
  const passwordHash = await hashPassword(defaultPassword);

  // 1. Seed Core Role Users
  console.log("👤 Seeding authenticated role accounts...");

  const admin = await prisma.user.upsert({
    where: { email: "admin@evichain.gov" },
    update: { passwordHash, isActive: true },
    create: {
      email: "admin@evichain.gov",
      name: "Chief Inspector Sarah Jenkins",
      role: "ADMINISTRATOR",
      passwordHash,
      isActive: true,
    },
  });

  const investigator = await prisma.user.upsert({
    where: { email: "investigator@evichain.gov" },
    update: { passwordHash, isActive: true },
    create: {
      email: "investigator@evichain.gov",
      name: "Special Agent Marcus Vance",
      role: "INVESTIGATOR",
      passwordHash,
      isActive: true,
    },
  });

  const examiner = await prisma.user.upsert({
    where: { email: "examiner@evichain.gov" },
    update: { passwordHash, isActive: true },
    create: {
      email: "examiner@evichain.gov",
      name: "Forensic Analyst Elena Rostova",
      role: "INVESTIGATOR",
      passwordHash,
      isActive: true,
    },
  });

  const custodian = await prisma.user.upsert({
    where: { email: "custodian@evichain.gov" },
    update: { passwordHash, isActive: true },
    create: {
      email: "custodian@evichain.gov",
      name: "Evidence Vault Officer David Kim",
      role: "CUSTODIAN",
      passwordHash,
      isActive: true,
    },
  });

  const auditor = await prisma.user.upsert({
    where: { email: "court@evichain.gov" },
    update: { passwordHash, isActive: true },
    create: {
      email: "court@evichain.gov",
      name: "Judicial Clerk Patricia Moore",
      role: "AUDITOR",
      passwordHash,
      isActive: true,
    },
  });

  console.log("✓ Authenticated accounts ready:");
  console.log("  - Administrator: admin@evichain.gov");
  console.log("  - Investigator:  investigator@evichain.gov");
  console.log("  - Examiner:      examiner@evichain.gov");
  console.log("  - Custodian:     custodian@evichain.gov");
  console.log("  - Court/Auditor: court@evichain.gov");
  console.log("  - Password:     Password123!");

  // 2. Seed System Settings & Agency Identity
  console.log("⚙️  Configuring agency operational parameters...");
  await prisma.systemSetting.upsert({
    where: { key: "SYSTEM_CONFIG" },
    update: {},
    create: {
      key: "SYSTEM_CONFIG",
      value: {
        organizationName: "National Digital Forensics & Cybercrime Bureau",
        unitName: "Major Case Cryptographic Evidence Division",
        jurisdictionLabel: "Federal Judicial District 7",
        classificationLabel: "RESTRICTED / LAW ENFORCEMENT SENSITIVE",
        retentionPolicyDays: 730,
        requireMfa: false,
        allowPublicVerification: true,
        sessionTimeoutMinutes: 60,
      },
    },
  });

  // 3. Seed Realistic Cases
  console.log("📁 Seeding realistic investigative case files...");

  const case1 = await prisma.case.create({
    data: {
      title: "Operation Dark Cipher (Ransomware Syndicate)",
      description:
        "Multi-jurisdictional investigation into advanced persistent threat (APT) actor group exfiltrating proprietary cryptographic keys and executing corporate ransomware attacks.",
      status: "Active",
      priority: "Critical",
      leadUserId: investigator.id,
    },
  });

  const case2 = await prisma.case.create({
    data: {
      title: "State v. Sterling Asset Management (Securities Fraud)",
      description:
        "Forensic audit of manipulated ledger databases, altered financial transactions, and off-ledger cryptocurrency transfers in suspected securities fraud.",
      status: "Active",
      priority: "High",
      leadUserId: examiner.id,
    },
  });

  const case3 = await prisma.case.create({
    data: {
      title: "Apex Logistics Terminal Security Breach",
      description:
        "Unauthorized physical and digital access to secured port logistics terminal; extraction of access badge clone logs and server CCTV records.",
      status: "Closed",
      priority: "Medium",
      leadUserId: investigator.id,
    },
  });

  // Ensure storage upload directory exists
  const storageDir = path.resolve(__dirname, "../storage/uploads");
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  // Helper to create real file artifact with known SHA-256
  function createArtifactFile(filename: string, content: Buffer | string): { storageKey: string; sha256: string; sizeBytes: number } {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf-8");
    const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
    const storageKey = `seed-${Date.now()}-${filename}`;
    fs.writeFileSync(path.join(storageDir, storageKey), buf);
    return { storageKey, sha256, sizeBytes: buf.length };
  }

  // 4. Seed Evidence Items & Authentic Files
  console.log("🛡️  Ingesting cryptographic evidence exhibits...");

  const art1 = createArtifactFile("memory-dump-ransomware.raw", "EVICHAIN_FORENSIC_RAW_RAM_CAPTURE_PAYLOAD_0x7FFA89B001");
  const ev1 = await prisma.evidence.create({
    data: {
      caseId: case1.id,
      name: "RAM Memory Dump (Server Node-04)",
      type: "MEMORY_CAPTURE",
      ownerOrg: "Federal Cyber Defense Agency",
      description: "Live volatile memory acquisition captured during active ransomware detonation. Contains decrypted C2 beacon strings.",
      status: "VERIFIED",
      sizeBytes: art1.sizeBytes,
      mimeType: "application/octet-stream",
      sha256: art1.sha256,
      storageKey: art1.storageKey,
      collectedById: investigator.id,
      currentCustodianId: examiner.id,
    },
  });

  const art2 = createArtifactFile("financial-audit-ledger.pdf", "%PDF-1.4 EviChain Forensic Audit Report Sample Certificate Content");
  const ev2 = await prisma.evidence.create({
    data: {
      caseId: case2.id,
      name: "Sterling Manipulated Transaction Ledger",
      type: "FINANCIAL_RECORD",
      ownerOrg: "Financial Crimes Enforcement Network",
      description: "Exported SQL transaction log showing retroactive backdating of investment ledger entries totaling $14.2M.",
      status: "VERIFIED",
      sizeBytes: art2.sizeBytes,
      mimeType: "application/pdf",
      sha256: art2.sha256,
      storageKey: art2.storageKey,
      collectedById: examiner.id,
      currentCustodianId: custodian.id,
    },
  });

  const art3 = createArtifactFile("cctv-vault-access.mp4", "MP4_HEADER_VIDEO_STREAM_FORENSIC_EVIDENCE_CLIP_001");
  const ev3 = await prisma.evidence.create({
    data: {
      caseId: case3.id,
      name: "CCTV Video Footage - Vault Gate Cam-04",
      type: "SURVEILLANCE_VIDEO",
      ownerOrg: "Apex Port Security Authority",
      description: "High-definition security camera feed recording unauthorized badge swipe at physical server vault door.",
      status: "SEALED",
      sizeBytes: art3.sizeBytes,
      mimeType: "video/mp4",
      sha256: art3.sha256,
      storageKey: art3.storageKey,
      collectedById: investigator.id,
      currentCustodianId: custodian.id,
    },
  });

  const art4 = createArtifactFile("malicious-c2-script.py", "#!/usr/bin/env python3\n# Intercepted Command & Control Reverse Shell\nimport socket, subprocess, os\n");
  const ev4 = await prisma.evidence.create({
    data: {
      caseId: case1.id,
      name: "Intercepted Python C2 Backdoor Script",
      type: "MALWARE_SOURCE",
      ownerOrg: "Incident Response Team",
      description: "Python-based persistence script recovered from compromised domain controller scheduled tasks.",
      status: "VERIFIED",
      sizeBytes: art4.sizeBytes,
      mimeType: "text/plain",
      sha256: art4.sha256,
      storageKey: art4.storageKey,
      collectedById: investigator.id,
      currentCustodianId: examiner.id,
    },
  });

  // 5. Seed Chronological Chain of Custody Ledgers
  console.log("⛓️  Constructing immutable Chain of Custody ledger...");

  // Custody events for Exhibit 1
  await prisma.custodyEvent.createMany({
    data: [
      {
        evidenceId: ev1.id,
        action: "CREATED",
        actorUserId: investigator.id,
        fromLocation: "Crime Scene / Target Server Room",
        toLocation: "Field Acquisition Kit",
        note: "Initial bit-stream volatile memory capture using certified hardware write blocker.",
        timestamp: new Date(Date.now() - 5 * 86_400_000),
      },
      {
        evidenceId: ev1.id,
        action: "TRANSFERRED",
        actorUserId: investigator.id,
        fromUserId: investigator.id,
        toUserId: examiner.id,
        fromLocation: "Field Acquisition Kit",
        toLocation: "Cyber Forensics Clean Lab (Room 302)",
        note: "Transferred for memory reverse-engineering and malware string extraction.",
        timestamp: new Date(Date.now() - 3 * 86_400_000),
      },
      {
        evidenceId: ev1.id,
        action: "VERIFIED",
        actorUserId: examiner.id,
        fromLocation: "Cyber Forensics Clean Lab (Room 302)",
        toLocation: "Cyber Forensics Clean Lab (Room 302)",
        note: "Cryptographic SHA-256 verified 100% bit-identical against initial capture genesis hash.",
        timestamp: new Date(Date.now() - 1 * 86_400_000),
      },
    ],
  });

  // Custody events for Exhibit 2
  await prisma.custodyEvent.createMany({
    data: [
      {
        evidenceId: ev2.id,
        action: "CREATED",
        actorUserId: examiner.id,
        fromLocation: "Sterling Headquarters Server Room",
        toLocation: "Forensic Transport Bag",
        note: "Forensic image extraction of PostgreSQL database server volume.",
        timestamp: new Date(Date.now() - 8 * 86_400_000),
      },
      {
        evidenceId: ev2.id,
        action: "TRANSFERRED",
        actorUserId: examiner.id,
        fromUserId: examiner.id,
        toUserId: custodian.id,
        fromLocation: "Forensic Transport Bag",
        toLocation: "Secure Central Evidence Vault Locker #418",
        note: "Placed into biometric-restricted evidence vault pending grand jury subpoena.",
        timestamp: new Date(Date.now() - 4 * 86_400_000),
      },
    ],
  });

  // Custody events for Exhibit 3
  await prisma.custodyEvent.createMany({
    data: [
      {
        evidenceId: ev3.id,
        action: "CREATED",
        actorUserId: investigator.id,
        fromLocation: "Apex Security Control Room",
        toLocation: "Evidence Drive A",
        note: "CCTV digital export exported directly to write-once optical media.",
        timestamp: new Date(Date.now() - 12 * 86_400_000),
      },
      {
        evidenceId: ev3.id,
        action: "SEALED",
        actorUserId: custodian.id,
        fromLocation: "Evidence Drive A",
        toLocation: "Court Evidence Locker Alpha",
        note: "Exhibit sealed with tamper-evident serial sticker #EVI-88902.",
        timestamp: new Date(Date.now() - 2 * 86_400_000),
      },
    ],
  });

  // 6. Seed Audit Logs
  console.log("📝 Generating initial audit trails & system alerts...");

  await prisma.auditLog.createMany({
    data: [
      {
        actorUserId: admin.id,
        action: "system.init",
        resourceType: "system",
        resourceId: "SYSTEM_CONFIG",
        detailJson: { message: "EviChain Production Cryptographic System Initialized" },
        ipAddress: "127.0.0.1",
        userAgent: "EviChain-Platform/2.0",
      },
      {
        actorUserId: investigator.id,
        action: "case.create",
        resourceType: "case",
        resourceId: case1.id,
        detailJson: { title: case1.title, priority: case1.priority },
        ipAddress: "192.168.1.102",
        userAgent: "Mozilla/5.0 Forensic Workstation",
      },
      {
        actorUserId: investigator.id,
        action: "evidence.upload",
        resourceType: "evidence",
        resourceId: ev1.id,
        detailJson: { name: ev1.name, sha256: ev1.sha256 },
        ipAddress: "192.168.1.102",
        userAgent: "Mozilla/5.0 Forensic Workstation",
      },
      {
        actorUserId: null,
        action: "public.verify",
        resourceType: "evidence",
        resourceId: ev1.id,
        detailJson: { method: "HASH", sha256: ev1.sha256, matched: true },
        ipAddress: "203.0.113.42",
        userAgent: "Judicial Portal Verification Client",
      },
    ],
  });

  // 7. Seed Notifications
  await prisma.notification.createMany({
    data: [
      {
        userId: examiner.id,
        type: "CUSTODY_TRANSFER_RECEIVED",
        severity: "INFO",
        title: "Custody Transfer Inbound",
        message: "Special Agent Marcus Vance transferred custody of RAM Memory Dump (Server Node-04) to your custody.",
        link: `/evidence/${ev1.id}`,
        entityType: "EVIDENCE",
        entityId: ev1.id,
        actionRequired: true,
        actionType: "OPEN_CUSTODY_TIMELINE",
        read: false,
      },
      {
        userId: investigator.id,
        type: "SECURITY_EVENT",
        severity: "SUCCESS",
        title: "Cryptographic Verification Passed",
        message: "Evidence exhibit RAM Memory Dump (Server Node-04) verified 100% authentic against Genesis Hash.",
        link: `/evidence/${ev1.id}`,
        entityType: "EVIDENCE",
        entityId: ev1.id,
        read: true,
      },
      {
        userId: admin.id,
        type: "SYSTEM_ALERT",
        severity: "INFO",
        title: "System Ready",
        message: "EviChain tamper-evident evidence registry is online and operational.",
        link: "/dashboard",
        entityType: "SYSTEM",
        read: false,
      },
    ],
  });

  console.log("\n==================================================");
  console.log("🎉 EVICHAIN SEED COMPLETED SUCCESSFULLY!");
  console.log("==================================================");
  console.log(`Cases Ingested:    3`);
  console.log(`Evidence Exhibits: 4 (with real SHA-256 hashes & storage artifacts)`);
  console.log(`Custody Events:    7`);
  console.log(`Audit Logs:        4`);
  console.log("==================================================\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed execution failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
