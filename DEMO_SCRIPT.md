# EviChain — Live Jury Demonstration Script (Timed Walkthrough)

**Total Duration**: ~5 to 7 minutes  
**Target Audience**: Smart India Hackathon / Technical Evaluation Jury  
**Key Value Proposition**: Cryptographic chain of custody, court-admissible Section 65B certificate generation, tamper detection, zero binary alteration for annotations, and mobile-first offline evidence collection.

---

## Pre-Demo Checklist (30 seconds before start)
- [ ] Backend running: `http://localhost:4000/health/deep` returns `200 OK` (Database + Storage healthy).
- [ ] Frontend running: `http://localhost:3000`.
- [ ] Sample digital evidence file prepared on desktop (e.g. `cctv_footage_mall_entrance.mp4` or `contract_scan.pdf`).
- [ ] Browser window open with Developer Tools (Network / Application tab) or mobile device emulator active.

---

## ⏱️ Step 1: Authentication & RBAC Enforcement (0:00 – 0:45)
1. **Navigate to**: `http://localhost:3000/login`
2. **Log In** as Lead Investigator:
   - Email: `lead.investigator@evichain.gov` (or provisioned investigator)
   - Password: `Password123!`
3. **Point out to Jury**:
   - JWT short-lived access tokens with HTTP-only, secure, same-site rotation cookies.
   - Immediate role-based dashboard layout tailored for **INVESTIGATOR** (auditors receive strictly read-only navigation).

---

## ⏱️ Step 2: Case Creation & Evidence Ingestion with SHA-256 Fingerprint (0:45 – 1:45)
1. **Navigate to**: **Cases** -> **Create New Case** (`/cases/new`).
2. **Fill Details**:
   - Title: `State vs Cyber Syndicate — FIR 104/2026`
   - Priority: `Critical`
   - Description: `Forensic seizure of compromised endpoints and surveillance assets.`
3. **Upload Evidence File**:
   - Select `cctv_footage_mall_entrance.mp4` or a PDF document.
   - Set Owner Organization: `Central Cyber Crime Cell`.
   - Click **Submit Evidence**.
4. **Point out to Jury**:
   - **Streaming cryptographic hashing**: The server calculated the SHA-256 hash byte-by-byte (`d2a...`) before disk commit.
   - The file is marked `VERIFIED` and stored under an immutable, collision-free storage key.
   - An initial `CREATED` custody event is recorded with the lead investigator as the initial custodian.

---

## ⏱️ Step 3: Chain of Custody Transfer & Zero-Trust Verification (1:45 – 2:45)
1. **Navigate to**: Evidence Detail page (`/evidence/[id]`).
2. Click **Transfer Custody**:
   - Select Recipient: `Forensic Lab Analyst (Custodian)`.
   - Transfer Reason / Notes: `Dispatched to Digital Forensics Laboratory for biometric analysis`.
   - Submit transfer.
3. **Inspect the Custody Timeline**:
   - Show the chronological chain of custody:
     1. `CREATED` by Lead Investigator
     2. `TRANSFERRED` to Forensic Lab Analyst
     3. `ACCESSED` records throttled to prevent log flooding
4. **Point out to Jury**:
   - If an unauthorized investigator or an Auditor tries to transfer this evidence, the API rejects it with `403 Forbidden`.
   - Atomic database transactions ensure only one custodian holds the evidence at any millisecond.

---

## ⏱️ Step 4: Public Verification Portal (Zero-Knowledge Audit) (2:45 – 3:45)
1. **Open an Incognito / Private Window** (no login required!).
2. **Navigate to**: `http://localhost:3000/verify`.
3. **Verify by Hash**:
   - Paste the SHA-256 hash copied from Step 2.
   - Click **Verify Fingerprint**.
4. **Observe the Result**:
   - Badge turns **GREEN / VERIFIED**.
   - Displays Registration Timestamp, File Size, File Type, and Owning Department.
   - **Crucial security guarantee**: Internal database IDs, file storage paths, case notes, and suspect names are **NEVER leaked** in public verification responses.
5. **Verify by Tampered File (Negative Proof)**:
   - Modify even 1 single byte of the original file and upload it to `/verify`.
   - Result: Badge displays **RED / NOT FOUND or UNVERIFIED**, mathematically proving tamper detection!

---

## ⏱️ Step 5: Court-Ready Section 65B Compliance & PDF Export (3:45 – 4:45)
1. Return to authenticated Investigator window.
2. Click **Export Case Intelligence PDF** or **Generate Evidence Certificate**.
3. **Show the generated PDF to the Jury**:
   - Indian Evidence Act Section 65B / Bharatiya Sakshya Adhiniyam compliance format.
   - Exact SHA-256 cryptographic digest.
   - Certified system hash timestamp, operating system, and hardware/software intake manifest.
   - Complete custody ledger from creation to present custody holder.
   - Automated digital signature verification block.

---

## ⏱️ Step 6: Immutable Forensic Audit Log (4:45 – 5:30)
1. **Navigate to**: **Audit Ledger** (`/audit`).
2. **Demonstrate Filtering**:
   - Filter by Resource Type: `evidence`
   - Filter by Action: `custody.transfer` or `evidence.upload`
3. **Show Compliance CSV / JSON Export**:
   - Click **Export CSV**.
   - Note the formula injection prevention: Any field beginning with `=`, `+`, `-`, or `@` is securely escaped with a single quote `'` to protect forensic analysts opening exports in Microsoft Excel.

---

## ⏱️ Step 7: Evidence Annotation & Collaboration with Zero Mutation (5:30 – 6:15)
1. Navigate to **Evidence Annotations** (`/evidence/[id]/annotate`).
2. Add a Point / Region note:
   - Click coordinates on image/document: `Suspect face detected in top-left frame`.
   - Color tag: Red / Cyan.
   - Save Annotation.
3. **Point out to Jury**:
   - The annotation is stored as normalized coordinates (0 to 1) in a separate auditable relation.
   - **The underlying binary file remains 100% untouched**, and the SHA-256 hash matches the exact byte-level fingerprint from day one!
4. Post a threaded Case Comment with `@ForensicsAnalyst` mention:
   - Show in-app notification delivered exclusively to authorized case members.

---

## ⏱️ Step 8: Mobile-First PWA & Offline Field Collection (6:15 – 7:00)
1. Switch browser to Mobile responsive mode (iPhone 14 / Pixel 7).
2. Show bottom navigation bar and mobile PWA layout.
3. Toggle browser to **Offline** mode (DevTools Network -> Offline).
4. Demonstrate field intake:
   - Capture evidence / draft notes into the offline queue (`IndexedDB`).
   - Connectivity banner alerts: *"Offline mode active — records queued locally"*.
5. Restore network connection:
   - Background queue automatically syncs with idempotency keys, avoiding duplicate records or race conditions.

---

## 🎯 Demo Summary & Jury Takeaway
- **Integrity**: 100% SHA-256 verified, tamper-evident forensic ledger.
- **Security**: Strict RBAC across 4 roles, zero-leak public verification, anti-formula injection, rate-limiting, and mid-session deactivation enforcement.
- **Legal Admissibility**: Automated Section 65B certified PDF exports.
- **Field Ready**: Offline PWA capture with automatic synchronization.
