# EviChain — Advanced Features Test Cases

**Scope:** Annotations, notifications, global search, audit export, case comments, reports, mobile PWA  
**Format:** Mark ✅ Pass / ❌ Fail / ⏭ Skip

---

## Section A — Evidence Annotations

### ANN-001: Open Annotation Page for Image Evidence
**Steps:**
1. Upload a JPEG evidence file
2. Navigate to `/evidence/:id/annotate`

**Expected:**
- Canvas renders the image
- Tool sidebar visible (Select, Freehand, Arrow, Highlight, Text)
- 6 colour swatches visible

**Result:** ___

---

### ANN-002: Draw Arrow Annotation
**Steps:**
1. Select Arrow tool
2. Click and drag on canvas
3. Release mouse

**Expected:**
- Arrow drawn from start to end point
- Arrow appears in Annotations sidebar with type "arrow"
- Colour matches selected swatch

**Result:** ___

---

### ANN-003: Draw Highlight Rectangle
**Steps:**
1. Select Highlight tool
2. Click and drag a rectangle over evidence area

**Expected:**
- Semi-transparent rectangle (30% opacity) appears
- Listed in annotations sidebar as type "highlight"

**Result:** ___

---

### ANN-004: Add Text Annotation
**Steps:**
1. Select Text tool
2. Click on canvas
3. Type "Evidence of tampering" in the text input
4. Press Enter

**Expected:**
- Text appears at clicked position
- Annotation in sidebar shows text content

**Result:** ___

---

### ANN-005: Save Annotations to Backend
**Steps:**
1. Draw at least one annotation
2. Click **Save**

**Expected:**
- Success toast: "Annotations saved"
- Annotations persist on page refresh
- `POST /evidence/:id/annotations` returns `{ count: N }`
- `AuditLog { action: "evidence.annotate" }` created

**Result:** ___

---

### ANN-006: Annotations Reload on Revisit
**Steps:**
1. Draw and save annotations
2. Close the page
3. Reopen `/evidence/:id/annotate`

**Expected:**
- Previous annotations rendered immediately on canvas load

**Result:** ___

---

### ANN-007: Clear All Annotations
**Steps:**
1. Save some annotations
2. Click **Clear all**
3. Confirm in the dialog
4. Click **Save**

**Expected:**
- Canvas clears
- Sidebar shows "No annotations yet"
- Backend annotation count = 0 after save

**Result:** ___

---

### ANN-008: Download Annotated PNG
**Steps:**
1. Draw annotations
2. Click **Download PNG**

**Expected:**
- File downloaded as `{evidence-name}-annotated.png`
- PNG contains the original image with annotations overlaid
- No server call made (purely client-side canvas export)

**Result:** ___

---

### ANN-009: Non-Image File Shows No Canvas
**Steps:**
1. Upload a PDF or ZIP file
2. Navigate to `/evidence/:id/annotate`

**Expected:**
- "Preview unavailable" state shown
- No canvas element rendered
- Tool sidebar still visible but drawing does nothing

**Result:** ___

---

### ANN-010: Annotations Scale Correctly on Different Viewport
**Steps:**
1. Save annotations on a 1920×1080 screen
2. Open the same evidence on a 375×812 mobile viewport

**Expected:**
- Annotations appear in the correct relative position
- No coordinates shifted (normalised 0–1 storage ensures this)

**Result:** ___

---

### ANN-011: Colour Picker Selection
**Steps:**
1. Select the red swatch (#ef4444)
2. Draw a freehand line
3. Select the blue swatch (#3b82f6)
4. Draw another freehand line

**Expected:**
- Each line drawn in its respective colour
- Both annotations listed in sidebar with different colour values

**Result:** ___

---

### ANN-012: Show/Hide Annotations Toggle
**Steps:**
1. Save some annotations
2. Uncheck "Show annotations" checkbox

**Expected:**
- Canvas redraws with only the original image (no annotations)
- Re-checking restores all annotations

**Result:** ___

---

## Section B — Notification System

### NOTIF-001: Bell Badge Shows Unread Count
**Steps:**
1. Login and perform any action (upload evidence, create case)
2. Wait up to 30 seconds for the next poll

**Expected:**
- Bell badge shows a number ≥ 1
- Badge is red

**Result:** ___

---

### NOTIF-002: Mark Single Notification as Read
**Steps:**
1. Open bell dropdown
2. Click a notification item

**Expected:**
- Navigate to the linked resource
- That notification shows as read (no bullet)
- On next poll (30s), that notification remains read

**Result:** ___

---

### NOTIF-003: Mark All as Read Persists Across Poll
**Steps:**
1. Open bell dropdown with unread notifications
2. Click "Mark all read"
3. Wait 35 seconds (let one full poll cycle pass)

**Expected:**
- Badge clears to 0
- After poll completes, notifications remain marked as read
- Badge does NOT reappear

**Result:** ___  ← **Verifies the readIdsRef fix**

---

### NOTIF-004: Notification Preference Saved
**Steps:**
1. `/profile` → Notifications tab
2. Toggle off "Evidence Uploads"
3. Click "Save preferences"
4. Reload the page

**Expected:**
- "Evidence Uploads" still shows as off after reload
- `GET /users/me/notification-preferences` returns `{ evidenceUploads: false }`

**Result:** ___

---

### NOTIF-005: Toast Appears on Evidence Upload
**Steps:**
1. Successfully upload evidence

**Expected:**
- Green toast: "Evidence registered successfully" appears bottom-right
- Disappears after ~4.5 seconds

**Result:** ___

---

### NOTIF-006: Toast Appears on Upload Failure
**Steps:**
1. Attempt to upload a file that's too large (>50MB)

**Expected:**
- Red toast with error message

**Result:** ___

---

### NOTIF-007: Notifications Page Shows Full List
**Steps:**
1. Click "View all →" in bell dropdown
2. OR navigate to `/notifications`

**Expected:**
- Full list of notifications with type badges, titles, messages, timestamps
- Dismiss button on each item
- "Mark all as read" button if any unread

**Result:** ___

---

## Section C — Global Search (Command Palette)

### SEARCH-001: Palette Opens with Ctrl+K
**Steps:**
1. Press Ctrl+K (Windows) or Cmd+K (Mac) anywhere in the app

**Expected:**
- Modal opens with blurred overlay
- Search input auto-focused
- Static action shortcuts visible

**Result:** ___

---

### SEARCH-002: Static Actions Always Visible
**Steps:**
1. Open palette
2. Don't type anything

**Expected:**
- 6 static actions shown: Create new case, Upload evidence, Verify evidence hash, View audit logs, Open reports, View notifications

**Result:** ___

---

### SEARCH-003: Debounce — No Request Until 250ms
**Steps:**
1. Open palette
2. Type "mi" rapidly (under 250ms)
3. Type "d" slowly (wait 300ms)

**Expected:**
- Only one API request fires (after the 250ms pause)
- No rapid-fire requests visible in DevTools Network tab

**Result:** ___

---

### SEARCH-004: Case Search Returns Results
**Steps:**
1. Create a case titled "Operation Midnight"
2. Open palette, type "midnight"

**Expected:**
- Case result shown with title "Operation Midnight" and status
- Clicking navigates to `/cases/:id`

**Result:** ___

---

### SEARCH-005: Evidence Search Returns Results
**Steps:**
1. Upload evidence named "incident-video.mp4"
2. Open palette, type "incident"

**Expected:**
- Evidence result shown with filename and linked case (if any)
- Clicking navigates to `/evidence/:id`

**Result:** ___

---

### SEARCH-006: User Search Only for Admin
**Steps:**
1. Login as ADMINISTRATOR, search for a user's name

**Expected:**
- User results appear in palette

2. Login as INVESTIGATOR, search for the same name

**Expected:**
- No user results (backend enforces this)

**Result:** ___  ← **Security test**

---

### SEARCH-007: Keyboard Navigation
**Steps:**
1. Open palette with search results
2. Press ↓ arrow 3 times
3. Press ↑ arrow once

**Expected:**
- Active highlight moves down 3 items, then back up 1
- No page scroll

**Result:** ___

---

### SEARCH-008: Enter Selects Active Item
**Steps:**
1. Open palette, type a query
2. Navigate to a result with arrow keys
3. Press Enter

**Expected:**
- Navigate to the result's URL
- Palette closes
- Query cleared

**Result:** ___

---

### SEARCH-009: Short Query Returns Empty
**Steps:**
1. Open palette, type "a" (single character)

**Expected:**
- Only static actions shown
- No API call made (minimum 2 chars enforced by backend)

**Result:** ___

---

## Section D — Audit Export Pipeline

### EXPORT-001: CSV Download Has Correct Headers
**Steps:**
1. Login as ADMINISTRATOR
2. `/audit/export` → CSV format → click Download

**Expected:**
- File named `audit-export-YYYY-MM-DD.csv`
- First line: `id,timestamp,action,resourceType,resourceId,actorUserId,actorName,actorRole,ipAddress,details`
- Subsequent rows contain real data

**Result:** ___

---

### EXPORT-002: JSON Download Has Metadata Envelope
**Steps:**
1. `/audit/export` → JSON format → click Download

**Expected:**
- File contains `{ "product": "EviChain", "exportedAt": "...", "exportedBy": "...", "totalRecords": N, "logs": [...] }`
- `totalRecords` matches actual `logs` array length

**Result:** ___

---

### EXPORT-003: Date Range Filter Works
**Steps:**
1. Set From = today's date, To = today's date
2. Export JSON

**Expected:**
- Only today's logs in the export
- If no activity today, `totalRecords = 0` and `logs = []`

**Result:** ___

---

### EXPORT-004: Investigator Cannot Export (Frontend)
**Steps:**
1. Login as Investigator
2. Navigate to `/audit/export`

**Expected:**
- "Only Administrators and Auditors can export" banner
- Download button disabled

**Result:** ___

---

### EXPORT-005: Investigator Cannot Export (Backend) — Security Critical
**Steps:**
1. Get Investigator JWT
2. `curl -X POST http://localhost:4000/audit/export -H "Authorization: Bearer <investigator-jwt>" -H "Content-Type: application/json" -d '{"format":"json"}'`

**Expected:**
- `{"error":"Insufficient permissions"}`
- HTTP 403

**Result:** ___  ← **Must pass**

---

### EXPORT-006: Large Export Does Not Time Out
**Steps:**
1. Ensure > 200 audit log entries exist
2. Export JSON without date filter

**Expected:**
- All records included (no server-side limit cap on export)
- File downloads successfully without timeout

**Result:** ___

---

## Section E — Case Comments

### COMMENT-001: Add Top-Level Comment
**Steps:**
1. Open a case detail page
2. Type a comment and click "Post comment"

**Expected:**
- Comment appears in Discussion section
- Author name and timestamp shown
- AuditLog `case.comment` entry created

**Result:** ___

---

### COMMENT-002: @Mention Rendered in Brand Colour
**Steps:**
1. Post comment: "Please review @Anjali.Sharma"

**Expected:**
- "@Anjali.Sharma" appears in brand green colour
- Rest of text in normal colour

**Result:** ___

---

### COMMENT-003: Threaded Reply
**Steps:**
1. Click Reply on an existing comment
2. Type reply text
3. Submit

**Expected:**
- Reply appears indented under parent comment
- Different timestamp from parent

**Result:** ___

---

### COMMENT-004: Comments Load on Page Refresh
**Steps:**
1. Post a comment
2. Hard-refresh the page (Ctrl+Shift+R)

**Expected:**
- Comment still visible
- Data from `GET /cases/:id/comments` endpoint

**Result:** ___

---

## Section F — Reports & Analytics

### REPORT-001: Stats Reflect Actual DB Data
**Steps:**
1. Note the case count in reports
2. Create a new case
3. Reload reports page

**Expected:**
- `totalCases` count incremented by 1

**Result:** ___

---

### REPORT-002: Chart Renders Without External Library
**Steps:**
1. Open `/reports`
2. Open DevTools → Network tab
3. Filter by "chart" or "d3" or "recharts"

**Expected:**
- No external chart library loaded
- Charts rendered with SVG elements

**Result:** ___

---

### REPORT-003: Time Range Changes Data
**Steps:**
1. View reports on "Last 30 days"
2. Change to "Last 12 months"

**Expected:**
- Different (typically higher) numbers shown
- New API request fires with `?range=365`

**Result:** ___

---

### REPORT-004: Reports Export CSV — Admin Only Backend Test
**Steps:**
1. Use Investigator token: `curl "http://localhost:4000/reports/export?range=90" -H "Authorization: Bearer <investigator-jwt>"`

**Expected:**
- `403 Insufficient permissions`

**Result:** ___

---

## Section G — Mobile PWA

### PWA-001: Install Prompt Fires
**Steps:**
1. Open EviChain in Chrome Android (or Chrome Desktop → DevTools → Mobile emulation)
2. Wait 3 seconds

**Expected:**
- Install banner appears at bottom of screen
- "Install" and "Later" buttons

**Result:** ___

---

### PWA-002: Offline Cached Pages Load
**Steps:**
1. Load the app while online
2. Open DevTools → Network → set to "Offline"
3. Navigate to `/` (dashboard)

**Expected:**
- Page loads from service worker cache
- May show stale data — that is expected

**Result:** ___  ← Requires production build (`npm run build && npm start`)

---

### PWA-003: Camera Permission Request
**Steps:**
1. Navigate to `/mobile/evidence/camera`
2. Click "Enable camera"

**Expected:**
- Browser shows camera permission dialog
- On grant: video stream fills the screen
- On deny: error toast shown

**Result:** ___

---

### PWA-004: Photo Capture and Upload
**Steps:**
1. Start camera
2. Tap capture button

**Expected:**
- Frame captured from video
- Upload initiates to `POST /evidence`
- Success toast: "Photo uploaded"
- Evidence appears in `/evidence` list

**Result:** ___

---

## Section H — Edge Cases & Performance

### PERF-001: Search Response Under 500ms
**Steps:**
1. Open palette
2. Type a 5-character query
3. Check Network tab for response time

**Expected:**
- `GET /search` responds in < 500ms on local dev

**Result:** ___ ms

---

### PERF-002: Audit Export for 500 Records
**Steps:**
1. Ensure ≥ 500 audit log entries in DB
2. Export as CSV without filters
3. Measure time to download

**Expected:**
- File downloads in < 10 seconds
- CSV is valid (no truncation)

**Result:** ___ seconds

---

### PERF-003: Large Annotation Set (50 points)
**Steps:**
1. Draw a very long freehand path (50+ points)
2. Save and reload

**Expected:**
- Canvas renders without jank
- DB insert succeeds (large JSON points array)
- No 413 or 500 error

**Result:** ___

---

### PERF-004: Slow Connection Upload (Network Throttling)
**Steps:**
1. DevTools → Network → set to "Slow 3G"
2. Upload a 5MB file

**Expected:**
- Progress bar advances slowly but accurately
- Upload completes (may take ~60 seconds)
- No timeout error

**Result:** ___

---

## Accessibility Audit

### A11Y-001: Keyboard Navigation — Annotation Tools
**Steps:**
1. Tab to the toolbar
2. Use arrow keys or Tab to navigate tools

**Expected:**
- Each tool button has visible focus ring
- `aria-pressed` attribute reflects active state
- `aria-label` on each tool button

**Result:** ___

---

### A11Y-002: Command Palette — Screen Reader
**Steps:**
1. Open palette with Ctrl+K
2. Tab through results

**Expected:**
- Input has `aria-autocomplete="list"` and `aria-controls`
- Results have `role="option"` and `aria-selected`
- Active result announced by screen reader

**Result:** ___

---

### A11Y-003: Notification Bell — Accessible Label
**Steps:**
1. Tab to the bell button

**Expected:**
- Button has `aria-label="Notifications, N unread"` (dynamic count)
- Badge number does not cause screen-reader noise (badge has `aria-hidden="true"`)

**Result:** ___

---

### A11Y-004: Colour-Only Status Indicators
**Steps:**
1. View evidence list with mixed statuses
2. Use a colour blindness simulator (e.g., Chrome DevTools → Rendering → Emulate vision deficiency)

**Expected:**
- Status badges use both colour AND text (e.g., "Verified" text + green dot)
- No information is conveyed by colour alone

**Result:** ___

---

### A11Y-005: Form Error Messages — ARIA Live
**Steps:**
1. Submit login form with wrong password
2. Inspect the error box

**Expected:**
- Error div has `role="alert"` and `aria-live="assertive"`
- Screen reader announces error immediately

**Result:** ___
