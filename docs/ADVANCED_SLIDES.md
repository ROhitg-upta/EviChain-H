# EviChain — Advanced Features PPT Additions

**These slides extend the base presentation (SLIDES.md) for a 10-minute pitch.**  
Format: paste each slide into PowerPoint / Google Slides / Canva using the design guidelines from SLIDES.md.

---

## Slide 8 — What Makes EviChain Unique (Advanced Features)

```
┌─────────────────────────────────────────────────────────────┐
│  BEYOND THE BASICS                                          │
│  ───────────────────────────────────────────────────────   │
│  What no competing platform offers in one package           │
│                                                             │
│  ┌────────────────────┐  ┌────────────────────┐            │
│  │  🎨 ANNOTATIONS    │  │  🔍 GLOBAL SEARCH  │            │
│  │                    │  │                    │            │
│  │  Draw arrows,      │  │  Cmd+K palette     │            │
│  │  highlights, and   │  │  searches cases,   │            │
│  │  text directly on  │  │  evidence, users   │            │
│  │  image evidence    │  │  in < 250ms        │            │
│  │  Server-persisted  │  │  Keyboard nav      │            │
│  └────────────────────┘  └────────────────────┘            │
│                                                             │
│  ┌────────────────────┐  ┌────────────────────┐            │
│  │  📱 MOBILE PWA     │  │  📊 ANALYTICS      │            │
│  │                    │  │                    │            │
│  │  Install on phone  │  │  Case trends,      │            │
│  │  Camera capture    │  │  evidence volume,  │            │
│  │  Works offline     │  │  top contributors  │            │
│  │  Auto-uploads      │  │  Pure SVG charts   │            │
│  └────────────────────┘  └────────────────────┘            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Talking points:**
- Annotations: investigators can mark up image evidence directly in the browser — arrows, highlights, text labels. All stored server-side as normalised coordinates.
- Global search: press Cmd+K from any page to instantly search across all cases, evidence files, and users
- Mobile PWA: install directly on a phone, capture field photos with the camera, works offline
- Analytics: built-in charts show case resolution trends and top uploaders — no separate BI tool needed

---

## Slide 9 — Evidence Annotation Demo

```
┌─────────────────────────────────────────────────────────────┐
│  ANNOTATION TOOL                                            │
│  ───────────────────────────────────────────────────────   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [SCREENSHOT PLACEHOLDER: /evidence/:id/annotate]   │   │
│  │                                                     │   │
│  │  Left sidebar:           Canvas:                    │   │
│  │  Tools: → ✏ ▬ T ↖       [Image with red arrow      │   │
│  │                           pointing to evidence area │   │
│  │  Colors: ● ● ● ● ● ●     and yellow highlight box] │   │
│  │                                                     │   │
│  │  [Save] [Clear] [PNG↓]   Right panel:              │   │
│  │                           Annotations (3)          │   │
│  │                           • arrow — R.Gupta         │   │
│  │                           • highlight — A.Sharma    │   │
│  │                           • text: "Check this"     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  How it works:                                             │
│  Points stored as normalised coords (0-1) → scale-safe    │
│  Save → POST /evidence/:id/annotations → PostgreSQL        │
│  All team members see each other's annotations             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design notes:** Take a real screenshot of the annotation page with a sample image and drawn annotations. Replace the placeholder box.

**Talking points:**
- Unlike basic evidence management systems, investigators can visually mark what matters
- Red arrow pointing to a specific face in CCTV footage, for example
- All annotations tied to the evidence record, visible to the whole team
- Download as PNG exports the annotated image for reports

---

## Slide 10 — Analytics Dashboard Demo

```
┌─────────────────────────────────────────────────────────────┐
│  ANALYTICS DASHBOARD                                        │
│  ───────────────────────────────────────────────────────   │
│                                                             │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐  │
│  │ 12 Cases  │ │34 Evidence│ │ 5.2 days  │ │ R. Gupta  │  │
│  │ In period │ │ Uploaded  │ │ Avg Res.  │ │ Top Upload│  │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘  │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐       │
│  │  Case Volume Trend   │  │  Cases by Status     │       │
│  │  [Line SVG chart]    │  │  [Donut SVG chart]   │       │
│  │  Aug ▁▃▅▇█▇          │  │  ● Active 67%        │       │
│  └──────────────────────┘  │  ● Closed 25%        │       │
│                             │  ● Archived 8%       │       │
│  ┌──────────────────────┐  └──────────────────────┘       │
│  │  Top Contributors    │                                   │
│  │  R.Gupta   ████ 15  │                                   │
│  │  A.Sharma  ███  11  │                                   │
│  │  N.Verma   ██   8   │                                   │
│  └──────────────────────┘                                   │
│                                                             │
│  Pure SVG — no external charting library                   │
└─────────────────────────────────────────────────────────────┘
```

**Talking points:**
- Built entirely with SVG — no Chart.js, no Recharts, keeping the bundle lean
- Selectable time ranges: 30 days, 90 days, 12 months
- Data computed server-side using Prisma aggregations
- Export as CSV for spreadsheet analysis or court reports
- Shows case resolution time — useful for departmental performance reviews

---

## Slide 11 — Mobile PWA Demo

```
┌─────────────────────────────────────────────────────────────┐
│  FIELD EVIDENCE CAPTURE                                     │
│  Mobile-first, works without an app store                   │
│  ───────────────────────────────────────────────────────   │
│                                                             │
│   📱 Phone Screen:                                          │
│   ┌─────────────────┐                                      │
│   │  [CAMERA VIEW]  │  ← Full-screen viewfinder            │
│   │                 │                                      │
│   │  ○ (capture)    │  ← White circle button               │
│   │  ⇄        ↑    │  ← Flip camera / Upload from gallery │
│   └─────────────────┘                                      │
│                                                             │
│  Capture → SHA-256 → Chain of Custody                      │
│  All in one tap. No app store. No login friction.          │
│                                                             │
│  ─────────────────────────────────────────────────────     │
│  ✅ Install from browser (no app store)                    │
│  ✅ Works offline (service worker caches data)              │
│  ✅ Camera auto-uploads when reconnected                    │
│  ✅ Bottom navigation optimised for thumb reach             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Talking points:**
- Field investigators don't need to install from an app store — just visit the URL
- The service worker caches the app shell for offline use
- Camera capture auto-uploads to the backend with SHA-256 fingerprinting
- Install prompt appears automatically after 3 seconds on first visit

---

## Slide 12 — Future Roadmap

```
┌─────────────────────────────────────────────────────────────┐
│  ROADMAP                                                    │
│  What comes next for EviChain                              │
│  ───────────────────────────────────────────────────────   │
│                                                             │
│  Q3 2026 — Infrastructure                                  │
│  ├─ AWS S3 file storage (currently hash-only)              │
│  ├─ Token refresh endpoint (15min → seamless session)      │
│  └─ Rate limiting + security headers (Helmet.js)           │
│                                                             │
│  Q4 2026 — Operations                                      │
│  ├─ Custody transfer workflow (TRANSFERRED events)         │
│  ├─ Bulk evidence operations (multi-select, bulk status)   │
│  ├─ Offline sync queue (upload when reconnected)           │
│  └─ Per-user notification filtering                        │
│                                                             │
│  Q1 2027 — Intelligence                                    │
│  ├─ QR code tagging for physical evidence                  │
│  ├─ ML-based anomaly detection (unusual access patterns)   │
│  ├─ CCTV integration webhook                               │
│  └─ Scheduled PDF reports (email digest)                   │
│                                                             │
│  Q2 2027 — Compliance                                      │
│  ├─ Section 65B Indian Evidence Act certificate generator  │
│  ├─ Configurable data retention & auto-archive             │
│  └─ Multi-tenant organisation support                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Talking points:**
- The foundation is solid — bcrypt, JWT, SHA-256, immutable audit logs are all production-ready
- S3 integration is the most critical next step — currently files are hashed but not persisted
- The architecture is designed for these additions — no major rewrites needed
- QR code tagging bridges physical and digital evidence for forensic labs

---

## Slide 13 — Technical Deep Dive (Optional / For Technical Judges)

```
┌─────────────────────────────────────────────────────────────┐
│  HOW SHA-256 GUARANTEES INTEGRITY                           │
│  ───────────────────────────────────────────────────────   │
│                                                             │
│  Original file (1.2 GB):                                   │
│  9f86d081884c7d659a2feaa0c55ad015...                       │
│                     ↓ Change 1 bit                         │
│  Modified file:                                            │
│  a4e9f2c18ab3d047ef6bc21984f7e10a...  ← COMPLETELY differs │
│                                                             │
│  This is the Avalanche Effect — guaranteed by SHA-256.     │
│                                                             │
│  ─────────────────────────────────────────────────────     │
│                                                             │
│  Why server-side matters:                                  │
│  Client-side hash → attacker submits any hash they want    │
│  Server-side hash → computed from actual bytes received    │
│                                                             │
│  EviChain uses Node.js crypto.createHash("sha256")        │
│  on the Multer buffer — before the file even touches disk  │
│                                                             │
│  Result: mathematically provable tamper detection          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Presentation Flow (10-minute version)

| Slide | Time | Content |
|---|---|---|
| 1 | 0:00 | Title |
| 2 | 0:30 | Problem statement |
| 3 | 1:30 | Solution overview — 4-block flow |
| 4 | 2:30 | USP — 3 unique features |
| 5 | 3:30 | Feasibility + competition table |
| 6 | 4:30 | Architecture diagram |
| 7 | 5:30 | Live demo (start here) |
| 8 | 7:00 | Advanced features — what makes it unique |
| 9–11 | 7:30 | Quick screenshots (annotations, analytics, mobile) |
| 12 | 8:30 | Roadmap |
| 13 | 9:00 | Technical SHA-256 deep dive (if asked) |
| — | 9:30 | Q&A |

---

## Screenshot Capture Guide

Before the presentation, take these screenshots for slides 9–11:

| Screenshot | URL | What to show |
|---|---|---|
| Annotation tool | `/evidence/:id/annotate` | Image with arrows + highlights drawn |
| Analytics dashboard | `/reports` | All 4 charts loaded with data |
| Mobile camera | `/mobile/evidence/camera` | Full-screen camera viewfinder |
| Command palette | Any page (Ctrl+K) | Palette open with search results |
| Evidence detail | `/evidence/:id` | SHA-256 card + custody timeline |
| Public verify — match | `/verify` | Green "Integrity Confirmed" result |

**Tip:** Use real data. Register a real file before the demo, so the SHA-256 match on the verify portal is live and provable.
