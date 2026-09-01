# EviChain — Hackathon Presentation Slides

**Event:** Smart India Hackathon 2026  
**Format:** 5–7 slides, 5-minute pitch  
**Use this file to build your PPT in PowerPoint / Google Slides / Canva**

---

## Slide 1 — Title Slide

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│         ██████  E V I C H A I N                             │
│                                                             │
│    Digital Evidence Chain of Custody Platform               │
│                                                             │
│    ─────────────────────────────────────────────────        │
│                                                             │
│    SHA-256 Verified · Court-Ready · Tamper-Proof            │
│                                                             │
│    Smart India Hackathon 2026                               │
│    Team: [Your Team Name]                                   │
│                                                             │
│    [Team member names]                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design notes:**
- Dark forensic-green background (`#0f2e22`)
- White text, brand-green accent for "EviChain" wordmark
- Subtle hexagonal grid texture overlay

---

## Slide 2 — Problem Statement

```
┌─────────────────────────────────────────────────────────────┐
│  THE PROBLEM                                                │
│  ───────────────────────────────────────────────────────   │
│                                                             │
│  "How do you prove that digital evidence was never         │
│   tampered with between collection and court?"             │
│                                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │  ❌ No tamper-  │  │  ❌ No standard │  │ ❌ Evidence  │ │
│  │  proof records │  │  custody trail │  │  disputes    │ │
│  │                │  │                │  │  in court    │ │
│  └────────────────┘  └────────────────┘  └──────────────┘ │
│                                                             │
│  Impact:                                                    │
│  • Cases lost on evidence admissibility grounds             │
│  • No accountability for who accessed what, when           │
│  • Manual logs can be forged or deleted                    │
│  • Public cannot independently verify integrity            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Talking points:**
- Digital evidence (CCTV footage, device images, logs) can be silently modified
- Traditional chain of custody is paper-based — no cryptographic guarantee
- In India, Section 65B of the Indian Evidence Act requires certified digital evidence
- No existing free/open solution provides cryptographic proof + public verification

---

## Slide 3 — Our Solution

```
┌─────────────────────────────────────────────────────────────┐
│  EVICHAIN — How It Works                                    │
│  ───────────────────────────────────────────────────────   │
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────┐ │
│  │  UPLOAD  │ →  │   HASH   │ →  │  CUSTODY │ →  │VERIFY│ │
│  │          │    │          │    │  CHAIN   │    │      │ │
│  │ Any file │    │ SHA-256  │    │ Immutable│    │Anyone│ │
│  │ ≤ 50 MB  │    │ server-  │    │ audit    │    │ can  │ │
│  │          │    │ side     │    │ log      │    │check │ │
│  └──────────┘    └──────────┘    └──────────┘    └──────┘ │
│                                                             │
│  Every file gets a cryptographic fingerprint.              │
│  Every access creates an immutable record.                 │
│  Anyone can verify integrity — no account needed.          │
│                                                             │
│  Stack: Next.js · Node.js · PostgreSQL · SHA-256            │
└─────────────────────────────────────────────────────────────┘
```

**Talking points:**
- SHA-256 is the same algorithm used by Bitcoin and TLS certificates
- Computed server-side from original bytes — client cannot fake it
- The hash is a mathematical fingerprint: change 1 bit → completely different hash
- Chain of custody: every access, transfer, download is permanently logged

---

## Slide 4 — Unique Selling Points

```
┌─────────────────────────────────────────────────────────────┐
│  WHY EVICHAIN IS DIFFERENT                                  │
│  ───────────────────────────────────────────────────────   │
│                                                             │
│  🔑 1. CRYPTOGRAPHIC GUARANTEE                              │
│     SHA-256 fingerprint computed server-side.              │
│     Mathematical proof — not just a timestamp.             │
│                                                             │
│  🌐 2. PUBLIC VERIFICATION PORTAL                           │
│     Anyone can verify a file's integrity.                  │
│     No account, no login, no fees.                         │
│     Courts, lawyers, journalists can self-verify.          │
│                                                             │
│  📋 3. COURT-READY AUDIT EXPORT                             │
│     Full chain-of-custody CSV/JSON export.                 │
│     Every action timestamped with IP address.              │
│     Compliant with Section 65B Indian Evidence Act.        │
│                                                             │
│  "The only platform that gives a public verification       │
│   portal — anyone can independently confirm evidence       │
│   integrity without needing an account."                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Slide 5 — Feasibility & Competitive Analysis

```
┌─────────────────────────────────────────────────────────────┐
│  FEASIBILITY & COMPETITION                                  │
│  ───────────────────────────────────────────────────────   │
│                                                             │
│  Technical Feasibility    ████████████  HIGH               │
│  Deployed on Neon (PostgreSQL) + Railway (Node.js)         │
│  Zero new hardware required                                │
│                                                             │
│  Operational Feasibility  ████████░░░░  MEDIUM-HIGH        │
│  4 roles, intuitive UI, mobile PWA                         │
│  Requires training for custody events                      │
│                                                             │
│  Economic Feasibility     ████████████  HIGH               │
│  ~₹0/month (Neon free + Railway hobby tier)                │
│  vs ₹50,000+/month commercial alternatives                 │
│                                                             │
│  ─────────────────────────────────────────────────────     │
│                                                             │
│  vs Traditional Paper System  — Forgeable, no hash        │
│  vs Commercial (Cellebrite)   — Expensive, closed source   │
│  vs Custom internal tools     — No public portal, no audit │
│                                                             │
│  ✅ EviChain: Free, open, cryptographically verifiable     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Competitive table:**

| Feature | Paper Log | Cellebrite | Custom Tools | EviChain |
|---|:---:|:---:|:---:|:---:|
| SHA-256 fingerprinting | ❌ | ✅ | ⚠️ | ✅ |
| Immutable audit log | ❌ | ✅ | ⚠️ | ✅ |
| Public verification portal | ❌ | ❌ | ❌ | ✅ |
| Role-based access | ❌ | ✅ | ⚠️ | ✅ |
| Free / open source | ✅ | ❌ | ❌ | ✅ |
| Mobile PWA | ❌ | ✅ | ❌ | ✅ |
| Court-ready CSV export | ❌ | ✅ | ⚠️ | ✅ |

---

## Slide 6 — Architecture & Tech Stack

```
┌─────────────────────────────────────────────────────────────┐
│  SYSTEM ARCHITECTURE                                        │
│  ───────────────────────────────────────────────────────   │
│                                                             │
│     👤 Users                                                │
│      │                                                      │
│      ▼                                                      │
│  ┌──────────────────────────────────────────┐              │
│  │   Next.js 15 (React 19)                  │              │
│  │   Mobile PWA · Role-based UI · JWT auth  │              │
│  └──────────────────┬───────────────────────┘              │
│                     │ HTTPS + Bearer Token                  │
│                     ▼                                       │
│  ┌──────────────────────────────────────────┐              │
│  │   Express 5 + Node.js 24                 │              │
│  │   requireAuth · requireRole · SHA-256    │              │
│  │   Multer (50MB) · Zod validation        │              │
│  └──────────────────┬───────────────────────┘              │
│                     │ Prisma ORM (SSL)                      │
│                     ▼                                       │
│  ┌──────────────────────────────────────────┐              │
│  │   PostgreSQL — Neon Serverless           │              │
│  │   User · Case · Evidence                 │              │
│  │   CustodyEvent · AuditLog                │              │
│  └──────────────────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Tech Stack:
Frontend: Next.js 15, React 19, TypeScript, PWA (next-pwa)
Backend:  Node.js 24, Express 5, TypeScript, Prisma 5
Database: PostgreSQL (Neon serverless, free tier)
Auth:     JWT (bcrypt 12 rounds), RBAC middleware
Hashing:  Node.js crypto — SHA-256
```

---

## Slide 7 — Live Demo Talking Points

```
┌─────────────────────────────────────────────────────────────┐
│  LIVE DEMO FLOW                                             │
│  ───────────────────────────────────────────────────────   │
│                                                             │
│  1. Register & Login (30 sec)                              │
│     → Show role selection, JWT stored                      │
│                                                             │
│  2. Create a Case (30 sec)                                 │
│     → "Operation Midnight", priority High                   │
│                                                             │
│  3. Upload Evidence (60 sec)                               │
│     → Drag-drop a file                                      │
│     → Show SHA-256 hash on success screen                   │
│     → Copy hash — open sha256sum in terminal               │
│     → They match ✅                                         │
│                                                             │
│  4. View Chain of Custody (30 sec)                         │
│     → Show CREATED custody event timeline                   │
│     → Navigate page to create ACCESSED event                │
│                                                             │
│  5. Public Verification (60 sec)                           │
│     → Open /verify in incognito (no login)                  │
│     → Upload same file → "Integrity Confirmed ✓"           │
│     → Modify 1 byte of the file                            │
│     → Upload modified file → "No matching record ✗"        │
│                                                             │
│  6. Audit Export (30 sec)                                  │
│     → Download CSV — show real data                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## PPT Design Guidelines

### Colors
| Name | Hex | Use |
|---|---|---|
| Brand Green | `#0f845a` | Buttons, headings, accents |
| Dark Green | `#083d2b` | Dark backgrounds, slide bg |
| Light Green | `#edfaf3` | Success states, callouts |
| Neutral Dark | `#141f1c` | Body text |
| Neutral Mid | `#526057` | Secondary text |
| White | `#ffffff` | Card backgrounds |

### Typography
- **Headings:** Inter Tight or Manrope, Bold, -0.04em tracking
- **Body:** Inter or Manrope, Regular/Medium
- **Code/Hashes:** DM Mono, Regular

### Layout
- Widescreen 16:9 format
- Left-aligned text (not centred body copy)
- High contrast — dark slide with light text OR white slide with dark text
- No clipart — use geometric icons or text-based visuals
- Animate entry: fade-up per bullet point (300ms, ease-out)

### Slide structure pattern
```
[EYEBROW LABEL in small caps, brand green]
BIG HEADLINE
---
Content in 2-3 column grid or single flow
```
