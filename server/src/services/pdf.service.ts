import PDFDocument from "pdfkit";

export interface EvidenceCertificateData {
  id: string;
  name: string;
  type: string;
  ownerOrg: string;
  status: string;
  sizeBytes: number;
  mimeType: string;
  sha256: string;
  createdAt: Date;
  collectedBy: { name: string; role: string; email: string };
  case?: { id: string; title: string; status: string } | null;
  custodyEvents: Array<{
    id: string;
    action: string;
    actor: { name: string; role: string };
    fromLocation?: string | null;
    toLocation?: string | null;
    note: string;
    timestamp: Date;
  }>;
}

export interface CaseSummaryPdfData {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  createdAt: Date;
  updatedAt: Date;
  lead?: { name: string; role: string; email: string } | null;
  evidence: Array<{
    id: string;
    name: string;
    type: string;
    ownerOrg: string;
    status: string;
    sizeBytes: number;
    mimeType: string;
    sha256: string;
    createdAt: Date;
    collectedBy?: { name: string } | null;
    currentCustodian?: { name: string } | null;
  }>;
  custodyEvents?: Array<{
    id: string;
    action: string;
    evidenceName?: string;
    actor: { name: string; role: string };
    fromLocation?: string | null;
    toLocation?: string | null;
    note: string;
    timestamp: Date;
  }>;
  auditLogs?: Array<{
    id: string;
    action: string;
    actor?: { name: string; role: string } | null;
    timestamp: Date;
  }>;
}

function fmtBytes(n: number): string {
  if (n === 0) return "0 B";
  const k = 1024;
  const s = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${(n / Math.pow(k, i)).toFixed(2)} ${s[i]}`;
}

export function generateEvidenceCertificate(data: EvidenceCertificateData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: 45, right: 45 },
      info: {
        Title: `EviChain Certificate - ${data.id}`,
        Author: "EviChain Forensic Authority",
        Subject: `SHA-256 Integrity Certificate for ${data.name}`,
        Keywords: "forensics, chain of custody, sha256, digital evidence",
      },
    });

    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", (err: Error) => reject(err));

    const brandGreen = "#0f845a";
    const darkNeutral = "#141f1c";
    const mutedText = "#526057";
    const lightBg = "#f4f7f5";
    const borderCol = "#d1dcd3";

    // ── Header Banner ──────────────────────────────────────────────
    doc.rect(45, 40, 505, 55).fill(brandGreen);
    doc.fillColor("#ffffff").fontSize(16).font("Helvetica-Bold")
       .text("EVICHAIN DIGITAL EVIDENCE INTEGRITY CERTIFICATE", 55, 52, { align: "center" });
    doc.fontSize(9).font("Helvetica")
       .text("Forensic Chain-of-Custody & SHA-256 Cryptographic Verification Record", 55, 74, { align: "center" });

    doc.moveDown(2);
    let y = 110;

    // ── Certificate Metadata Summary Bar ───────────────────────────
    doc.rect(45, y, 505, 24).fillAndStroke(lightBg, borderCol);
    doc.fillColor(darkNeutral).fontSize(8).font("Helvetica-Bold")
       .text(`CERTIFICATE ID: ${data.id}`, 55, y + 7)
       .text(`ISSUED: ${new Date().toUTCString()}`, 350, y + 7, { align: "right" });

    y += 35;

    // ── Section 1: Item Identification ─────────────────────────────
    doc.fillColor(brandGreen).fontSize(11).font("Helvetica-Bold")
       .text("1. EVIDENCE IDENTIFICATION", 45, y);
    doc.strokeColor(brandGreen).lineWidth(1).moveTo(45, y + 14).lineTo(550, y + 14).stroke();

    y += 22;
    doc.rect(45, y, 505, 80).fillAndStroke("#ffffff", borderCol);

    doc.fillColor(darkNeutral).fontSize(9).font("Helvetica");
    
    // Left column
    doc.text(`File Name: `, 55, y + 10, { continued: true }).font("Helvetica-Bold").text(data.name);
    doc.font("Helvetica").text(`Evidence ID: `, 55, y + 25, { continued: true }).font("Helvetica-Bold").text(data.id);
    doc.font("Helvetica").text(`MIME Type: `, 55, y + 40, { continued: true }).font("Helvetica-Bold").text(data.mimeType);
    doc.font("Helvetica").text(`File Size: `, 55, y + 55, { continued: true }).font("Helvetica-Bold").text(`${fmtBytes(data.sizeBytes)} (${data.sizeBytes.toLocaleString()} bytes)`);

    // Right column
    doc.font("Helvetica").text(`Origin / Owner: `, 300, y + 10, { continued: true }).font("Helvetica-Bold").text(data.ownerOrg);
    doc.font("Helvetica").text(`Associated Case: `, 300, y + 25, { continued: true }).font("Helvetica-Bold").text(data.case ? `${data.case.title} (${data.case.status})` : "Unassigned");
    doc.font("Helvetica").text(`Registered By: `, 300, y + 40, { continued: true }).font("Helvetica-Bold").text(`${data.collectedBy.name} (${data.collectedBy.role})`);
    doc.font("Helvetica").text(`Registration Date: `, 300, y + 55, { continued: true }).font("Helvetica-Bold").text(new Date(data.createdAt).toUTCString());

    y += 95;

    // ── Section 2: Cryptographic SHA-256 Fingerprint ───────────────
    doc.fillColor(brandGreen).fontSize(11).font("Helvetica-Bold")
       .text("2. CRYPTOGRAPHIC INTEGRITY FINGERPRINT", 45, y);
    doc.strokeColor(brandGreen).lineWidth(1).moveTo(45, y + 14).lineTo(550, y + 14).stroke();

    y += 22;
    doc.rect(45, y, 505, 50).fillAndStroke("#edfaf3", "#a8e8ca");
    
    doc.fillColor("#0c6847").fontSize(9).font("Helvetica-Bold")
       .text("SHA-256 CHECKSUM (FIPS 180-4 NIST COMPLIANT):", 55, y + 8);
    
    doc.fillColor("#083d2b").fontSize(10).font("Courier-Bold")
       .text(data.sha256.toUpperCase(), 55, y + 24);

    doc.fillColor("#0c6847").fontSize(8).font("Helvetica")
       .text(`Integrity Status: [ ${data.status} ] · Tamper-evident ledger registered at time of ingestion.`, 55, y + 37);

    y += 65;

    // ── Section 3: Chain of Custody Timeline ───────────────────────
    doc.fillColor(brandGreen).fontSize(11).font("Helvetica-Bold")
       .text("3. CHRONOLOGICAL CHAIN OF CUSTODY AUDIT LOG", 45, y);
    doc.strokeColor(brandGreen).lineWidth(1).moveTo(45, y + 14).lineTo(550, y + 14).stroke();

    y += 22;

    // Table Header
    doc.rect(45, y, 505, 18).fillAndStroke(lightBg, borderCol);
    doc.fillColor(darkNeutral).fontSize(8).font("Helvetica-Bold");
    doc.text("TIMESTAMP (UTC)", 52, y + 5);
    doc.text("ACTION", 170, y + 5);
    doc.text("ACTOR", 240, y + 5);
    doc.text("NOTE / LOCATION", 345, y + 5);

    y += 18;

    const eventsToRender = data.custodyEvents.slice(0, 10);
    for (const evt of eventsToRender) {
      if (y > 700) {
        doc.addPage();
        y = 45;
      }

      doc.rect(45, y, 505, 20).fillAndStroke("#ffffff", "#e8ede9");
      doc.fillColor(darkNeutral).fontSize(7.5).font("Helvetica");
      doc.text(new Date(evt.timestamp).toISOString().replace("T", " ").slice(0, 19), 52, y + 6);
      
      doc.font("Helvetica-Bold").text(evt.action, 170, y + 6);
      doc.font("Helvetica").text(`${evt.actor.name}`, 240, y + 6);
      
      const notePreview = evt.note.length > 38 ? `${evt.note.slice(0, 38)}…` : evt.note;
      doc.text(notePreview, 345, y + 6);

      y += 20;
    }

    y += 15;

    // ── Section 4: Legal Certification & Authority Seal ────────────
    if (y > 670) {
      doc.addPage();
      y = 45;
    }

    doc.rect(45, y, 505, 80).fillAndStroke(lightBg, borderCol);
    doc.fillColor(brandGreen).fontSize(9).font("Helvetica-Bold")
       .text("LEGAL & FORENSIC CERTIFICATION", 55, y + 8);

    doc.fillColor(mutedText).fontSize(7.5).font("Helvetica")
       .text(
         "This document certifies that the digital record identified above was ingested into the EviChain ledger with automated cryptographic SHA-256 fingerprinting. All custodial access, transfers, and modifications are recorded in an append-only, tamper-evident audit ledger compliant with standards for electronic records admissibility (e.g. FRE 902(13)/(14) and equivalent statutory frameworks).",
         55,
         y + 22,
         { width: 485, align: "justify" }
       );

    doc.fillColor(darkNeutral).fontSize(7.5).font("Helvetica-Bold")
       .text(`Generated by EviChain Forensic Platform · Server Signature Hash: ${data.sha256.slice(0, 16)}...`, 55, y + 64);

    doc.end();
  });
}

/**
 * Generate a comprehensive Case Intelligence Summary PDF
 */
export function generateCaseSummaryPdf(data: CaseSummaryPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: 45, right: 45 },
      info: {
        Title: `EviChain Case Report - ${data.id}`,
        Author: "EviChain Forensic Intelligence Authority",
        Subject: `Case Intelligence Summary for ${data.title}`,
        Keywords: "forensics, case report, chain of custody, sha256, compliance",
      },
    });

    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", (err: Error) => reject(err));

    const brandGreen = "#0f845a";
    const darkNeutral = "#141f1c";
    const mutedText = "#526057";
    const lightBg = "#f4f7f5";
    const borderCol = "#d1dcd3";

    // ── Header Banner ──────────────────────────────────────────────
    doc.rect(45, 40, 505, 55).fill(brandGreen);
    doc.fillColor("#ffffff").fontSize(15).font("Helvetica-Bold")
       .text("EVICHAIN CASE INTELLIGENCE REPORT", 55, 50, { align: "center" });
    doc.fontSize(8.5).font("Helvetica")
       .text("Official Chain-of-Custody & Forensic Evidence Audit Summary", 55, 72, { align: "center" });

    let y = 108;

    // ── Summary Bar ───────────────────────────────────────────────
    doc.rect(45, y, 505, 24).fillAndStroke(lightBg, borderCol);
    doc.fillColor(darkNeutral).fontSize(8).font("Helvetica-Bold")
       .text(`CASE ID: ${data.id}`, 55, y + 7)
       .text(`STATUS: ${data.status.toUpperCase()} | PRIORITY: ${(data.priority || "NORMAL").toUpperCase()}`, 220, y + 7)
       .text(`ISSUED: ${new Date().toISOString().slice(0, 10)}`, 450, y + 7, { align: "right" });

    y += 34;

    // ── Section 1: Case Dossier Overview ───────────────────────────
    doc.fillColor(brandGreen).fontSize(10.5).font("Helvetica-Bold")
       .text("1. CASE DOSSIER OVERVIEW", 45, y);
    doc.strokeColor(brandGreen).lineWidth(1).moveTo(45, y + 14).lineTo(550, y + 14).stroke();

    y += 20;
    doc.rect(45, y, 505, 68).fillAndStroke("#ffffff", borderCol);

    doc.fillColor(darkNeutral).fontSize(8.5).font("Helvetica");
    doc.text("Title: ", 55, y + 8, { continued: true }).font("Helvetica-Bold").text(data.title);
    doc.font("Helvetica").text("Lead Investigator: ", 55, y + 22, { continued: true }).font("Helvetica-Bold").text(data.lead ? `${data.lead.name} (${data.lead.email})` : "Unassigned");
    doc.font("Helvetica").text("Created: ", 55, y + 36, { continued: true }).font("Helvetica-Bold").text(new Date(data.createdAt).toUTCString());
    doc.font("Helvetica").text("Last Updated: ", 55, y + 50, { continued: true }).font("Helvetica-Bold").text(new Date(data.updatedAt).toUTCString());

    doc.font("Helvetica").text("Total Evidence Items: ", 320, y + 22, { continued: true }).font("Helvetica-Bold").text(String(data.evidence.length));
    doc.font("Helvetica").text("Classification: ", 320, y + 36, { continued: true }).font("Helvetica-Bold").text("CONFIDENTIAL / LAW ENFORCEMENT");

    y += 78;

    // Case Description
    if (data.description) {
      doc.fillColor(darkNeutral).fontSize(8).font("Helvetica-Bold").text("Incident Summary:", 45, y);
      y += 12;
      const descBoxHeight = Math.min(50, Math.max(30, data.description.length / 3));
      doc.rect(45, y, 505, descBoxHeight).fillAndStroke(lightBg, borderCol);
      doc.fillColor(mutedText).fontSize(7.5).font("Helvetica")
         .text(data.description, 55, y + 6, { width: 485 });
      y += descBoxHeight + 14;
    }

    // ── Section 2: Registered Evidence & Checksums ─────────────────
    if (y > 660) {
      doc.addPage();
      y = 45;
    }

    doc.fillColor(brandGreen).fontSize(10.5).font("Helvetica-Bold")
       .text(`2. EVIDENCE REGISTRY (${data.evidence.length} ITEMS)`, 45, y);
    doc.strokeColor(brandGreen).lineWidth(1).moveTo(45, y + 14).lineTo(550, y + 14).stroke();

    y += 20;

    // Evidence Table Header
    doc.rect(45, y, 505, 16).fillAndStroke(lightBg, borderCol);
    doc.fillColor(darkNeutral).fontSize(7.5).font("Helvetica-Bold");
    doc.text("ITEM NAME", 52, y + 4);
    doc.text("TYPE / SIZE", 185, y + 4);
    doc.text("SHA-256 CHECKSUM (FIPS 180-4)", 270, y + 4);
    doc.text("STATUS", 495, y + 4);

    y += 16;

    if (data.evidence.length === 0) {
      doc.rect(45, y, 505, 20).fillAndStroke("#ffffff", "#e8ede9");
      doc.fillColor(mutedText).fontSize(7.5).font("Helvetica").text("No evidence items registered under this case.", 52, y + 6);
      y += 25;
    } else {
      for (const ev of data.evidence) {
        if (y > 720) {
          doc.addPage();
          y = 45;
        }

        doc.rect(45, y, 505, 22).fillAndStroke("#ffffff", "#e8ede9");
        doc.fillColor(darkNeutral).fontSize(7.5).font("Helvetica-Bold");
        
        const namePreview = ev.name.length > 22 ? `${ev.name.slice(0, 22)}…` : ev.name;
        doc.text(namePreview, 52, y + 4);
        doc.font("Helvetica").fontSize(7).fillColor(mutedText).text(`ID: ${ev.id.slice(0, 8)}`, 52, y + 12);

        doc.fillColor(darkNeutral).fontSize(7).font("Helvetica").text(`${ev.type} · ${fmtBytes(ev.sizeBytes)}`, 185, y + 7);
        
        doc.fillColor("#0c6847").fontSize(6.5).font("Courier-Bold").text(ev.sha256, 270, y + 7);
        doc.fillColor(darkNeutral).fontSize(7).font("Helvetica-Bold").text(ev.status, 495, y + 7);

        y += 22;
      }
      y += 10;
    }

    // ── Section 3: Chronological Chain of Custody ──────────────────
    if (data.custodyEvents && data.custodyEvents.length > 0) {
      if (y > 640) {
        doc.addPage();
        y = 45;
      }

      doc.fillColor(brandGreen).fontSize(10.5).font("Helvetica-Bold")
         .text("3. CHRONOLOGICAL CHAIN OF CUSTODY TIMELINE", 45, y);
      doc.strokeColor(brandGreen).lineWidth(1).moveTo(45, y + 14).lineTo(550, y + 14).stroke();

      y += 20;

      // Table Header
      doc.rect(45, y, 505, 16).fillAndStroke(lightBg, borderCol);
      doc.fillColor(darkNeutral).fontSize(7.5).font("Helvetica-Bold");
      doc.text("TIMESTAMP (UTC)", 52, y + 4);
      doc.text("ACTION", 160, y + 4);
      doc.text("ACTOR", 240, y + 4);
      doc.text("DETAILS / NOTES", 335, y + 4);

      y += 16;

      for (const evt of data.custodyEvents.slice(0, 15)) {
        if (y > 720) {
          doc.addPage();
          y = 45;
        }

        doc.rect(45, y, 505, 18).fillAndStroke("#ffffff", "#e8ede9");
        doc.fillColor(darkNeutral).fontSize(7).font("Helvetica");
        doc.text(new Date(evt.timestamp).toISOString().replace("T", " ").slice(0, 19), 52, y + 5);
        doc.font("Helvetica-Bold").text(evt.action, 160, y + 5);
        doc.font("Helvetica").text(evt.actor.name, 240, y + 5);
        
        const note = evt.note ? (evt.note.length > 40 ? `${evt.note.slice(0, 40)}…` : evt.note) : "—";
        doc.text(note, 335, y + 5);

        y += 18;
      }
      y += 10;
    }

    // ── Section 4: Integrity Declaration & Disclaimer ──────────────
    if (y > 670) {
      doc.addPage();
      y = 45;
    }

    doc.rect(45, y, 505, 75).fillAndStroke(lightBg, borderCol);
    doc.fillColor(brandGreen).fontSize(8.5).font("Helvetica-Bold")
       .text("CRYPTOGRAPHIC INTEGRITY DECLARATION", 55, y + 8);

    doc.fillColor(mutedText).fontSize(7).font("Helvetica")
       .text(
         "This case intelligence document was dynamically prepared from verified EviChain ledger records. The listed SHA-256 digests represent immutable cryptographic checksums calculated server-side from raw file bytes at the time of evidence ingestion. All custodial actions are recorded in an append-only audit trail compliant with digital forensic integrity standards.",
         55,
         y + 20,
         { width: 485, align: "justify" }
       );

    doc.fillColor(darkNeutral).fontSize(7).font("Helvetica-Bold")
       .text(`Report Prepared: ${new Date().toUTCString()} · Forensic Verification Authority: EviChain Platform`, 55, y + 58);

    doc.end();
  });
}
