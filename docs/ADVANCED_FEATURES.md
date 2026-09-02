# EviChain — Advanced Features Documentation

## Overview

This document covers the advanced capabilities of EviChain beyond the core upload-hash-verify loop:

1. Evidence Annotations (canvas drawing tools)
2. Notification system (polling, preferences, toasts)
3. Global Search (command palette)
4. Audit Export Pipeline (CSV + JSON)
5. Case Comments with @mentions
6. Analytics & Reports Dashboard
7. Mobile PWA (offline, camera capture)

---

## 1. Evidence Annotations

### What It Does

Investigators and administrators can draw directly on image evidence in the browser using a HTML5 Canvas tool. Annotations are stored as normalised coordinate points (0–1 range) so they scale correctly on any screen size. All annotations are server-persisted and visible to all users with access.

### How to Use

1. Navigate to `/evidence/:id`
2. Click **"Annotate"** or go directly to `/evidence/:id/annotate`
3. Select a tool from the left sidebar:

| Tool | Icon | Use case |
|---|---|---|
| Select | ↖ | Pan/inspect without drawing |
| Freehand | ✏ | Free-form highlight or circle |
| Arrow | → | Point to specific area |
| Highlight | ▬ | Rectangle highlight over a region |
| Text | T | Add a text label at a point |

4. Choose a colour from the colour picker (6 presets)
5. Draw on the canvas
6. Click **Save** to persist to the database
7. Click **Download PNG** to export the annotated image locally

### Technical Notes

- Points are normalised: `{ x: 0.35, y: 0.72 }` means 35% from left, 72% from top
- `POST /evidence/:id/annotations` **replaces** the calling user's annotation set (not append)
- Other users' annotations are loaded on page open and rendered as read-only
- The annotation canvas uses `crossOrigin: "anonymous"` for the image — requires proper CORS headers if using S3
- Annotation tools are disabled for non-image MIME types; a "Preview unavailable" state is shown instead

### Keyboard Shortcuts

| Key | Action |
|---|---|
| Escape | Cancel current drawing operation |
| Ctrl+Z | Not yet implemented — clear last annotation |

---

## 2. Notification System

### Architecture

Notifications in EviChain are **derived from audit logs** rather than stored in a separate table. Every 30 seconds, the `NotificationContext` polls `GET /audit?limit=20` and maps audit log entries to typed notification objects.

### Notification Types

| Audit action pattern | Notification type | Colour |
|---|---|---|
| Contains "flag" | warning | Amber |
| Contains "delete" | error | Red |
| Contains "upload" or "create" | success | Green |
| All others | info | Blue |

### Bell Dropdown

- Click the bell icon (or press keyboard shortcut if configured)
- Shows latest 8 notifications
- Unread count badge appears on the bell
- Click any notification to navigate to the related resource
- "Mark all read" persists read state across the 30s poll cycle via `readIdsRef`
- "View all →" navigates to `/notifications`

### Mark as Read — Persistence

A common issue with polling-based notifications is that "mark as read" resets when the next poll fires. EviChain solves this with a `Set<string>` (`readIdsRef`) stored in a React `useRef`:

- When you mark a notification as read, its ID is added to `readIdsRef`
- On every poll, each notification checks `readIdsRef.current.has(id)` before setting `read: false`
- This persists within the browser session (resets on full page reload — acceptable for now)

### User Preferences

Navigate to `/profile` → **Notifications** tab. Four toggles:
- Evidence Uploads
- Case Updates
- System Alerts
- Weekly Digest

Preferences are stored in `NotificationPreference` table via `PUT /users/me/notification-preferences`. Note: preferences are **stored** but not yet **enforced** at delivery (all notifications still show regardless). Enforcement is a planned enhancement.

### Toasts

Toast notifications appear bottom-right for immediate feedback after user actions (upload success, comment posted, error). They auto-dismiss after 4.5 seconds. Call `toast({ type, title, message?, duration? })` from `useNotifications()`.

---

## 3. Global Search (Command Palette)

### Opening

- **Keyboard:** `Ctrl+K` (Windows/Linux) or `⌘+K` (Mac)
- **Mouse:** Click the search bar in the dashboard header

### How It Works

1. Palette opens with static action shortcuts immediately visible
2. As you type (minimum 1 character), a 250ms debounce timer starts
3. After 250ms, `GET /search?q={query}` is called with your Bearer token
4. Backend searches three tables in parallel:
   - `Case` — title and description (case-insensitive contains)
   - `Evidence` — name (case-insensitive contains)
   - `User` — name and email (ADMINISTRATOR role only)
5. Results merged with matching static actions and displayed grouped by type
6. Arrow keys navigate, Enter selects, Escape closes

### Static Action Shortcuts

Always available regardless of search query:

| Action | Destination |
|---|---|
| Create new case | `/cases/new` |
| Upload evidence | `/evidence/new` |
| Verify evidence hash | `/verify` |
| View audit logs | `/audit` |
| Open reports | `/reports` |
| View notifications | `/notifications` |

### Result Icons

| Type | Icon | Meaning |
|---|---|---|
| case | ▣ | Investigation case |
| evidence | ◈ | Evidence file |
| user | ○ | User account (admin only) |
| action | ⚡ | Quick navigation action |

### Security

- Non-admin users never see user results (enforced on backend, not just UI)
- Search query is URL-encoded before sending
- Queries shorter than 2 characters return empty arrays from the backend

---

## 4. Audit Export Pipeline

### Formats

#### JSON Export
```json
{
  "product": "EviChain",
  "exportedAt": "2026-08-27T12:00:00.000Z",
  "exportedBy": "uuid-of-exporting-user",
  "totalRecords": 142,
  "filters": { "format": "json" },
  "logs": [...]
}
```

Includes full metadata envelope. Each log entry contains `actor`, `detailJson`, `ipAddress`, `userAgent`, and `timestamp`.

#### CSV Export

Headers:
```
id,timestamp,action,resourceType,resourceId,actorUserId,actorName,actorRole,ipAddress,details
```

The `details` column contains the `detailJson` field serialised as a quoted JSON string. Compatible with Excel and Google Sheets.

### How to Export

**Via UI:**
1. Navigate to `/audit/export`
2. Select format (JSON or CSV)
3. Optionally apply filters:
   - Resource type (evidence / case)
   - Resource ID (specific item UUID)
   - Actor user ID
   - Action (partial match)
   - Date range (from / to)
4. Click Download — file downloads immediately

**Via API:**
```bash
# JSON export, last 30 days
curl -X POST http://localhost:4000/audit/export \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"format":"json","from":"2026-08-01","to":"2026-08-31"}' \
  -o audit-export.json

# CSV export, evidence only
curl -X POST http://localhost:4000/audit/export \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"format":"csv","resourceType":"evidence"}' \
  -o audit-export.csv
```

### Access Control

Only `ADMINISTRATOR` and `AUDITOR` roles can export. Other roles receive `403 Insufficient permissions`.

### Court Submission

For court submission, the recommended format is JSON (preserves full detail) with a date-range filter covering the relevant investigation period. The `exportedAt` and `exportedBy` fields in the JSON envelope provide provenance for the export itself.

---

## 5. Case Comments with @Mentions

### Adding Comments

On any case detail page (`/cases/:id`), scroll to the **Discussion** section:
1. Type your comment in the textarea
2. Use `@name` to mention a team member (e.g., `@Anjali.Sharma`)
3. Click **Post comment**

### Threaded Replies

Click **Reply** under any comment to add a nested reply. Replies are displayed indented under the parent comment.

### @Mentions

- Mentions are parsed client-side using the regex `/@([\w\s.-]+)/g`
- Matched names are rendered in brand green with a clickable appearance
- Backend stores mention records in `CommentMention` table by looking up users by name substring match
- **Note:** Mention notifications (notifying the mentioned user) are a planned enhancement

### Audit Trail

Every comment creates an `AuditLog` entry with `action: "case.comment"` containing a preview of the comment content.

---

## 6. Analytics & Reports Dashboard

### Accessing

Navigate to `/reports`. All authenticated roles can view reports. Only ADMINISTRATOR and AUDITOR can export.

### Available Metrics

| Chart | Type | Data source |
|---|---|---|
| Case volume trend | Line chart (SVG) | Cases grouped by YYYY-MM |
| Evidence volume trend | Line chart (SVG) | Evidence grouped by YYYY-MM |
| Cases by status | Donut chart (SVG) | Count per distinct status value |
| Evidence by file type | Donut chart (SVG) | MIME category count |
| Top contributors | Bar chart (SVG) | Evidence count per uploader, top 5 |

### Stats Strip

| Metric | Calculation |
|---|---|
| Total cases | COUNT of Case in selected period |
| Total evidence | COUNT of Evidence in selected period |
| Avg resolution | Mean of `(updatedAt - createdAt)` for Closed/Archived cases |
| Top contributor | Name with highest evidence upload count |

### Time Range

Select Last 30 days / Last 90 days / Last 12 months from the dropdown. Changing the range re-fetches data from the server.

### CSV Export

Click **Export CSV ↓** to download a structured CSV with all aggregated data. The export is role-restricted (ADMINISTRATOR and AUDITOR only).

### Chart Implementation

All charts are rendered using pure SVG — no external chart library. This keeps the bundle small and eliminates licensing concerns. Chart colours use `--chart-1` through `--chart-6` CSS variables from `design-tokens.css`, derived from the brand/semantic palette.

---

## 7. Mobile PWA

### Installing

1. Visit EviChain in Chrome (Android) or Safari (iOS 16.4+)
2. After 3 seconds, an install prompt appears at the bottom of the screen
3. Tap **Install** → browser shows native installation dialog
4. Accept → app added to home screen with EviChain icon
5. Opens in standalone mode (no browser chrome)

### Offline Capability

| Feature | Offline behaviour |
|---|---|
| Previously loaded pages | ✅ Served from service worker cache |
| Static assets (JS/CSS) | ✅ Cached by next-pwa on first load |
| API calls (evidence, cases) | ⚠️ NetworkFirst — tries network, falls back to 24h cache |
| Image files | ✅ CacheFirst — served from cache for 7 days |
| New uploads | ❌ Fail silently — offline queue is a planned feature |

### Camera Capture

Navigate to `/mobile/evidence/camera`:

1. Browser requests `navigator.mediaDevices.getUserMedia` permission
2. Grant camera access — video stream appears full-screen
3. Tap the white circle to capture a photo
4. Photo is automatically uploaded to `POST /evidence` with your Bearer token
5. Tap the flip icon (⇄) to switch between front and rear cameras

**Capture flow:**
1. Canvas draws a frame from the video at native resolution
2. Frame is converted to JPEG Blob at 90% quality
3. A `File` object is created from the blob with filename `capture-{timestamp}.jpg`
4. `uploadEvidence(accessToken, formData)` is called — same upload path as web

### Mobile Navigation

The mobile layout (`/mobile/*`) uses a bottom navigation bar instead of the sidebar:

| Tab | Icon | Destination |
|---|---|---|
| Home | ⊞ | `/` |
| Evidence | ◈ | `/evidence` |
| Cases | ▣ | `/cases` |
| Profile | ○ | `/profile` |

A quick-upload button (↑) is always visible in the top-right of the mobile header.
