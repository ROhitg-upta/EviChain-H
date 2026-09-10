# EviChain — Digital Evidence Chain of Custody Platform

> **Cryptographically verified, tamper-evident, court-ready digital evidence management.**  
> Built with Next.js 15, Node.js + Express 5, Prisma ORM, and Neon Serverless PostgreSQL. Built for Smart India Hackathon 2026.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24-green)](https://nodejs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5-teal)](https://prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-blue)](https://neon.tech/)

---

## 1. Executive Summary & Problem/Solution Overview

### The Problem
Digital evidence in criminal, corporate, and civil investigations is vulnerable to tampering, accidental corruption, chain-of-custody gaps, and forensic challenge in court. Traditional handling relies on manual sign-off sheets, disconnected file servers, and unverified attachments, rendering digital exhibits difficult to authenticate under legal standards (such as Section 65B of the Indian Evidence Act / Section 63 of Bharatiya Sakshya Adhiniyam).

### The EviChain Solution
**EviChain** establishes an immutable, cryptographic chain of custody for all digital exhibits:
1. **Server-Side SHA-256 Hashing**: Ingested files are cryptographically fingerprinted during streaming upload before disk commit.
2. **Atomic Custody Transfers**: Custody handoffs between officers are governed by database transactions with zero race conditions.
3. **Zero-Knowledge Public Verification**: Defense attorneys, magistrates, and independent auditors can verify any file's fingerprint without requiring an account or exposing confidential case notes.
4. **Section 65B Certified PDF Generation**: Court-admissible certificates detailing hardware, operating system, file hashes, and custody history are generated automatically.
5. **Zero-Mutation Visual Annotations**: Coordinate-anchored point, region, and page annotations are layered over evidence without altering a single byte of the original exhibit.
6. **Field-Ready Mobile PWA**: Field officers capture digital exhibits offline with automatic background sync and idempotency protection upon reconnecting.

---

## 2. System Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             CLIENT LAYER (BROWSER / PWA)                         │
│                                                                                  │
│   Next.js 15 (App Router) + React 19 + Tailwind CSS + PWA Service Worker        │
│   ├── Responsive Desktop Portal (Command Palette, Dashboard, Case Ledger)       │
│   ├── Mobile Bottom-Nav Viewport (Touch Capture, Camera, Offline Queue Panel)   │
│   └── Public Verification Portal (Zero-Knowledge Hash & File Lookup)            │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ HTTPS / JSON / Multipart
                                         │ Bearer JWT + Strict SameSite Cookies
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            BACKEND API SERVICE LAYER                             │
│                                                                                  │
│   Node.js v24 + Express 5.2 + TypeScript 7 (Port 4000)                           │
│   ├── Rate Limiters (Auth: 100/min, Public: 60/min, Collaboration: 60/min)       │
│   ├── Auth Engine (bcrypt-12, JWT 15m access tokens, 7d rotating refresh tokens) │
│   ├── RBAC Middleware (ADMINISTRATOR, INVESTIGATOR, AUDITOR, CUSTODIAN)          │
│   ├── Anti-Formula Injection Engine (CSV single-quote escaping for spreadsheet)  │
│   ├── Streaming SHA-256 Crypto Pipeline (Multi-gigabyte memory-safe hashing)     │
│   └── Diagnostic Probes (/health, /health/deep database & storage probes)        │
└───────────────────────┬──────────────────────────────────┬───────────────────────┘
                        │                                  │
         Prisma ORM     │                                  │ Local FS / S3 Adapter
         SSL Connection │                                  │ Clean Traversal-Guarded
                        ▼                                  ▼
┌──────────────────────────────────────┐   ┌───────────────────────────────────────┐
│     DATABASE LAYER (NEON CLOUD)      │   │      EVIDENCE STORAGE ADAPTER         │
│                                      │   │                                       │
│ Serverless PostgreSQL                │   │ Local Disk / AWS S3 / Cloudflare R2   │
│ ├── Users, Sessions, Presets         │   │ ├── Immutable Storage Keys (UUIDv4)   │
│ ├── Cases, Evidence, CustodyEvents   │   │ ├── Strict MIME & Extension Policy    │
│ ├── CaseComments, Mentions           │   │ └── Zero-Byte & Size Limit Rejections │
│ ├── EvidenceAnnotations, AuditLogs   │   └───────────────────────────────────────┘
│ └── Notifications, SystemSettings    │
└──────────────────────────────────────┘
```

---

## 3. All 13 Completed Modules

| Module | Title | Core Functional Delivery |
|---|---|---|
| **Module 1** | Identity & Session Architecture | JWT rotation, secure HTTP-only cookies, bcrypt hashing, reuse-detection. |
| **Module 2** | Database & Storage Foundation | Prisma schema, storage adapters, traversal prevention, error normalizer. |
| **Module 3** | Case Management & Dossiers | Case creation, multi-attribute lifecycle, lead assignment, cascade deletion. |
| **Module 4** | Evidence Upload & Integrity | Streaming SHA-256 hashing, MIME verification, memory-safe uploads. |
| **Module 5** | Custody Transfer & Secure Access | Atomic custody transitions, access throttling, authenticated binary streaming. |
| **Module 6** | Public Evidence Verification | Zero-knowledge public hash/file verification portal with zero data leaks. |
| **Module 7** | Reports, Audit Export & Compliance | Section 65B court PDF generator, anti-formula injection CSV exports. |
| **Module 8** | Notifications & User Preferences | Real-time event notifications, category subscription preferences. |
| **Module 9** | Global Discovery & Command Palette | Keyboard-driven command palette (`Ctrl+K`), multi-entity global search. |
| **Module 10** | Admin & Profile Management | Operator provisioning, role delegation, last-admin lockout defense. |
| **Module 11** | Mobile PWA & Offline Capture | PWA manifest, service worker, camera intake, offline idempotency queue. |
| **Module 12** | Collaboration & Visual Annotations | Threaded comments, case-scoped @mentions, zero-mutation point/region notes. |
| **Module 13** | Hardening, Audit & Release Readiness | Cross-module RBAC audit, deep health checks, data integrity audit, perf benchmarks. |
| **Module 14** | Alert Intelligence Center | Real-time security telemetry, forensic anomaly detection, and automated alerting. |
| **Module 15** | Evidence Integrity Intelligence Engine | Deep cryptographic tree validation, SHA-256 integrity health, and tamper alerts. |
| **Module 16** | National Forensics Operations Workspace | High-density enterprise command center, unified multi-agency telemetry, WCAG AAA. |

---

## 4. One-Command Quick Start & Setup Guide

### Prerequisites
- **Node.js**: v18+ (tested on v24.x)
- **npm**: v9+
- **PostgreSQL**: v14+ (or free [Neon Serverless PostgreSQL](https://neon.tech))

### 1. Clone Repository & Install Dependencies
```bash
git clone https://github.com/ROhitg-upta/EviChain-H.git
cd EviChain-H

# Install root & frontend dependencies
npm install

# Install server dependencies
cd server
npm install
cd ..
```

### 2. Configure Environment Variables

**Frontend (`.env.local` in project root):**
```bash
cp .env.example .env.local
```
- For local development: `NEXT_PUBLIC_API_URL=http://localhost:4000`
- For deployed production: `NEXT_PUBLIC_API_URL=https://api.yourdomain.gov`

**Backend API (`server/.env`):**
```bash
cp server/.env.example server/.env
```
- Set `DATABASE_URL` to your PostgreSQL / Neon connection string.
- Set `JWT_SECRET` and `REFRESH_SECRET` to secure keys (min 16 chars).
- Set `FRONTEND_URL=http://localhost:3000` and `CORS_ORIGIN=http://localhost:3000`.

### 3. Deploy Database Migrations
```bash
cd server
npx prisma migrate deploy
cd ..
```

### 4. Start the Application

#### One-Command Simultaneous Startup (Recommended):
```bash
# Concurrently launches Next.js frontend (port 3000) and Express API (port 4000)
npm run dev
```

#### Dedicated Terminals (Optional):
```bash
# Terminal 1: Backend API (port 4000)
npm run dev:server

# Terminal 2: Frontend Web & PWA (port 3000)
npm run dev:client
```

---

## 5. Production Deployment & Process Management

### Centralized API Architecture
EviChain frontend utilizes a centralized configuration module (`lib/api-config.ts`):
- Automatically resolves `NEXT_PUBLIC_API_URL` -> window location -> local fallback.
- Classifies network errors with non-blocking `AbortController` health probes.
- Supports Next.js reverse-proxy rewrites (`/api/proxy/:path*`).
- Never leaks rigid local port warnings in remote production environments.

### Render Web Service Deployment (Backend)
1. In [Render Dashboard](https://dashboard.render.com), click **New +** $\rightarrow$ **Web Service**.
2. Connect your GitHub repository `ROhitg-upta/EviChain-H`.
3. Configure the web service settings:
   - **Root Directory**: `server`
   - **Build Command**: `npm ci --include=dev && npx prisma generate && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
4. Add Environment Variables under the **Environment** tab:
   - `DATABASE_URL`: Your Neon PostgreSQL connection string (`postgresql://...`)
   - `JWT_SECRET`: Random 32+ character string
   - `REFRESH_SECRET`: Different random 32+ character string
   - `CORS_ORIGIN`: `https://evi-chain-h.vercel.app`
   - `NODE_ENV`: `production`
5. Once deployed, copy your assigned Render service URL (e.g. `https://<your-service-name>.onrender.com`).

### Vercel Frontend Configuration
1. In the [Vercel Dashboard](https://vercel.com) $\rightarrow$ Project `evi-chain-h` $\rightarrow$ **Settings** $\rightarrow$ **Environment Variables**.
2. Set `NEXT_PUBLIC_API_URL` to your actual live Render backend URL:
   - **Key**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://<your-service-name>.onrender.com`
3. Go to **Deployments** $\rightarrow$ Click **Redeploy** on the latest build to apply the variable.

### Process Supervision with PM2 (Self-Hosted / VPS)
For production deployment on Linux / Windows Server instances:

```bash
# 1. Compile backend & frontend
npm run build:all

# 2. Start PM2 process
npm run api:start

# 3. CRITICAL: Persist across system reboots
pm2 startup
pm2 save
```

### Production Health Checks
- **Liveness probe**: `GET http://localhost:4000/health` (returns `200` with `{"status":"ok","ok":true}`).
- **Deep readiness probe**: `GET http://localhost:4000/health/deep` (returns `200` when DB and Storage adapter are both healthy, `503` on degradation).

---

## 6. Security Hardening Guarantees

1. **Authentication & Session Lifecycle**:
   - Access tokens expire after 15 minutes.
   - Refresh tokens are rotated on each use with automatic reuse detection.
   - User active state (`isActive`) is validated on **every authenticated request**, rejecting deactivated operators mid-session.
2. **Strict RBAC**:
   - `AUDITOR`: Strictly read-only; every mutative `POST`, `PATCH`, `DELETE` route returns `403 Forbidden`.
   - `INVESTIGATOR`: Scoped strictly to cases they lead or hold evidence for; unrelated cases return `403 Forbidden`.
   - `ADMINISTRATOR`: Full administrative access with self-demotion / lockout protection.
3. **Spreadsheet Formula Injection Defense**:
   - All exported CSV cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r` are escaped with a leading single quote `'`.
4. **Data Integrity Baseline**:
   - 797 database checks verified: 0 foreign key anomalies, 0 orphaned custody events, 0 orphaned comments/annotations.

---

## 7. Automated Test Suite Execution

Run the complete regression suite covering all 16 modules:

```bash
cd server

# Run individual module suites:
npx tsx tests/module2.test.ts       # Infrastructure & Storage (22 tests)
npx tsx tests/module3.test.ts       # Case Management (17 tests)
npx tsx tests/module4.test.ts       # Evidence Upload & Integrity (15 tests)
npx tsx tests/module5.test.ts       # Custody Transfer & Access (17 tests)
npx tsx tests/module6.test.ts       # Public Verification (18 tests)
npx tsx tests/module7.test.ts       # Reports & Compliance (16 tests)
npx tsx tests/module8.test.ts       # Notifications & Preferences (16 tests)
npx tsx tests/module9.test.ts       # Search & Discovery (12 tests)
npx tsx tests/module10.test.ts      # Admin & User Lifecycle (14 tests)
npx tsx tests/module11.test.ts      # Mobile PWA & Offline (12 tests)
npx tsx tests/module12.test.ts      # Collaboration & Annotations (13 tests)
npx tsx tests/module13.test.ts      # Security Hardening & Audit Suite (8 tests)
npx tsx tests/module14.test.ts      # Alert Intelligence Telemetry (12 tests)
npx tsx tests/module15.test.ts      # Integrity Intelligence Engine (16 tests)
npx tsx tests/module16.test.ts      # Operations Workspace Suite (15 tests)
npx tsx tests/e2e-recovery-smoke.ts # E2E Recovery Smoke Suite (14 tests)
```

**Total Verified Automated Tests**: **224/224 Passed** (100% Success).

---

## 8. License
This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
