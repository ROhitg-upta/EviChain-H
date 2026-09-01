# EviChain — Digital Evidence Chain of Custody Platform

> SHA-256 verified, court-ready evidence management for investigative teams. Built for Smart India Hackathon 2026.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24-green)](https://nodejs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5-teal)](https://prisma.io/)

---

## What is EviChain?

EviChain is a chain-of-custody platform that ensures digital evidence cannot be tampered with. Every file uploaded gets a server-side SHA-256 fingerprint. Every access, transfer, and download is logged in an immutable audit trail. Anyone — lawyers, courts, external auditors — can verify a file's integrity without an account.

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/ROhitg-upta/EviChain-H.git
cd EviChain-H

# 2. Frontend deps
npm install

# 3. Backend deps
cd server && npm install

# 4. Configure environment (see below)
# 5. Run migrations
npx prisma migrate dev --name init

# 6. Start backend (terminal 1)
npm run dev

# 7. Start frontend (terminal 2, from repo root)
cd .. && npm run dev
```

Frontend: http://localhost:3000  
Backend: http://localhost:4000

---

## Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| Node.js | 18.x (tested on 24.14.0) | https://nodejs.org |
| npm | 9.x | Bundled with Node |
| Git | Any recent | https://git-scm.com |
| PostgreSQL | 14+ (or Neon free tier) | https://neon.tech |

---

## Project Structure

```
EviChain-H/
├── app/                    # Next.js 15 App Router pages
│   ├── auth-context.tsx    # JWT auth state + localStorage session
│   ├── notification-context.tsx
│   ├── components/         # CommandPalette, NotificationBell, ToastContainer
│   ├── evidence/           # Evidence list, upload, detail, annotate
│   ├── cases/              # Cases list, new, detail
│   ├── audit/              # Audit dashboard, export, detail
│   ├── reports/            # Analytics charts
│   ├── admin/              # Admin panel, users, settings
│   ├── verify/             # Public verification portal
│   ├── profile/            # User profile & preferences
│   └── mobile/             # PWA mobile layout + camera
├── lib/
│   └── api.ts              # Typed fetch wrappers for all backend endpoints
├── public/
│   └── manifest.json       # PWA manifest
├── server/
│   ├── src/
│   │   ├── index.ts        # Express app entry + route mounting
│   │   ├── auth.ts         # bcrypt + JWT utilities
│   │   ├── middleware.ts   # requireAuth, requireRole
│   │   ├── db.ts           # Prisma client singleton
│   │   └── routes/         # auth, evidence, cases, audit, public, reports, search, users
│   └── prisma/
│       └── schema.prisma   # Full database schema
├── docs/
│   ├── API.md              # Complete API reference
│   ├── DEPLOYMENT.md       # Cloud deployment guide
│   └── TEST_CASES.md       # Manual test cases + security checklist
├── WORKFLOW.md             # End-to-end workflow documentation
├── VERIFICATION_REPORT.md  # QA audit report
└── next.config.js          # Next.js + PWA configuration
```

---

## Environment Variables

### Backend — `server/.env`

```env
# PostgreSQL connection string (get from Neon dashboard)
DATABASE_URL="postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require"

# JWT secrets — use at least 32 random characters each
JWT_SECRET="replace-with-32-plus-random-chars"
JWT_EXPIRES_IN="15m"

# Refresh token
REFRESH_SECRET="replace-with-different-32-plus-random-chars"
REFRESH_EXPIRES_IN="7d"

# Server port
PORT=4000
```

**Generate strong secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Frontend — `.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

In production, change this to your deployed backend URL.

---

## Database Setup

### Using Neon (recommended — free tier)

1. Sign up at [neon.tech](https://neon.tech)
2. Create a new project → name it `evichain`
3. Copy the connection string from **Connection Details → psql string**
4. Paste into `DATABASE_URL` in `server/.env`
5. Run migration:

```bash
cd server
npx prisma migrate dev --name init
```

### Using local PostgreSQL

```bash
createdb evichain
# Then set DATABASE_URL="postgresql://localhost:5432/evichain"
cd server && npx prisma migrate dev --name init
```

---

## Running Locally

### Backend

```bash
cd server
npm run dev
# → EviChain API running on http://localhost:4000
```

Verify:
```bash
curl http://localhost:4000/health
# → {"status":"ok","timestamp":"..."}
```

### Frontend

```bash
# From repo root
npm run dev
# → http://localhost:3000
```

### First user

Go to `http://localhost:3000/login` → **Register** tab → create an `ADMINISTRATOR` account.

---

## Available Scripts

### Backend (`server/`)

| Script | Command | Description |
|---|---|---|
| Dev server | `npm run dev` | `tsx watch` — auto-restarts on save |
| Type check | `npx tsc --noEmit` | Zero-error check |
| Build | `npm run build` | Compile to `dist/` |
| Start | `npm start` | Run compiled `dist/index.js` |
| Generate client | `npx prisma generate` | Regenerate Prisma client after schema changes |
| Run migration | `npx prisma migrate dev --name <desc>` | Apply schema changes |
| DB browser | `npx prisma studio` | Visual database GUI |
| Reset DB | `npx prisma migrate reset` | **Destructive** — dev only |

### Frontend (root)

| Script | Command | Description |
|---|---|---|
| Dev server | `npm run dev` | Next.js dev server with HMR |
| Type check | `npx tsc --noEmit` | Zero-error check |
| Build | `npm run build` | Production build |
| Start | `npm start` | Serve production build |

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| Next.js | 15.3 | App Router, SSR, PWA |
| React | 19 | UI components |
| TypeScript | 5 | Type safety |
| next-pwa | latest | Service worker, offline support |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Node.js | 24.14 | Runtime |
| Express | 5.2 | HTTP framework |
| TypeScript | 7 | Type safety |
| tsx | 4.19 | Dev runner (Node v24 compatible) |
| Prisma | 5.22 | ORM + migrations |
| bcryptjs | 3 | Password hashing (12 rounds) |
| jsonwebtoken | 9 | JWT access + refresh tokens |
| multer | 2.2 | File upload (memory storage) |
| zod | 4 | Request validation |

### Database & Infrastructure
| Technology | Purpose |
|---|---|
| PostgreSQL on Neon | Primary database (serverless, free tier) |
| AWS S3 (planned) | Evidence file storage |

---

## API Documentation

Full API reference with all endpoints, request/response examples, and curl commands: **[docs/API.md](docs/API.md)**

---

## Architecture

```
Browser / Mobile PWA
       │
       │ HTTPS + Bearer JWT
       ▼
Next.js 15 (localhost:3000)
  auth-context.tsx ── localStorage session
  lib/api.ts ──────── typed fetch wrappers
       │
       │ HTTP REST
       ▼
Express API (localhost:4000)
  requireAuth ──── JWT verification
  requireRole ──── RBAC enforcement
  multer ──────────  50MB file upload
  SHA-256 ─────────  Node crypto
  Prisma ORM ──────  type-safe queries
       │
       │ SSL connection
       ▼
PostgreSQL — Neon
  User · Case · Evidence
  CustodyEvent · AuditLog
  CaseComment · EvidenceAnnotation
  NotificationPreference
```

---

## Security

- **Passwords:** bcrypt with 12 salt rounds
- **JWTs:** HS256, 15-minute access tokens, 7-day refresh tokens
- **Role enforcement:** Both frontend (UI gates) and backend (middleware) — independently enforced
- **Input validation:** Zod schemas on all mutation endpoints
- **File safety:** MIME type allowlist enforced server-side by Multer
- **SQL injection:** Prisma parameterised queries — no raw SQL
- **Audit trail:** Every action creates an immutable `AuditLog` record
- **SHA-256:** Computed server-side from original bytes — never trusts client-provided values

---

## Deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for step-by-step guides for Railway, Render, and Fly.io.

---

## Documentation Index

| File | Contents |
|---|---|
| `README.md` | This file — setup + overview |
| `WORKFLOW.md` | End-to-end user journey documentation |
| `VERIFICATION_REPORT.md` | QA audit: what was verified, fixed, and deferred |
| `docs/API.md` | Complete REST API reference |
| `docs/DEPLOYMENT.md` | Cloud deployment guide |
| `docs/TEST_CASES.md` | Manual test cases + security checklist |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make changes and run `npx tsc --noEmit` in both `server/` and root
4. Commit: `git commit -m "feat: description"`
5. Push and open a pull request

---

## License

MIT — see `LICENSE` for details.

---

*Built for Smart India Hackathon 2026 · EviChain Team*
