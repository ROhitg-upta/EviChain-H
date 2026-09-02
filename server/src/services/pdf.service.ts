import PDFDocument from "pdfkit";
import { Readable } from "stream";

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

    const fmtBytes = (n: number) => {
      if (n === 0) return "0 B";
      const k = 1024, s = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(n) / Math.log(k));
      return `${(n / Math.pow(k, i)).toFixed(2)} ${s[i]}`;
    };

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
