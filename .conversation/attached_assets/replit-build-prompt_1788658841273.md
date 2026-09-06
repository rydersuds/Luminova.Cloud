# Replit Build Prompt — Construction Project Management App

> Paste everything below this line into Replit as your initial build prompt.

---

## Project overview

Build a web-based **construction project management application**. It is for **Luminova Construction**, used internally to track projects, manage a directory of trades people, collect and compare quotes, control budgets against incoming invoices, and share site photography (including 360° panoramas) with the team and clients.

The app must be responsive and work well on both desktop and mobile browsers, since project managers will use it on site.

## Tech stack

- **Frontend:** React + Vite, TypeScript, Tailwind CSS
- **Backend:** Node.js + Express (TypeScript)
- **Database:** PostgreSQL with Drizzle ORM
- **Auth:** Email/password with hashed passwords (bcrypt) and session cookies, or Replit Auth if simpler — must support the role system below
- **File storage:** Object storage for images and documents, with signed/authenticated URLs so files are not publicly guessable
- **360° viewer:** `@photo-sphere-viewer/core` (or Pannellum) rendered **inside the app**. Panoramas must never open in an external viewer or third-party site.
- **Real-time:** WebSockets (or Socket.IO) for in-app messaging and notifications

Seed the database with realistic demo data (3–4 projects, ~12 trades people across several trades and regions, sample client quotes, trade quotes, budgets, invoices, reviews, and photos) so every screen can be evaluated immediately.

---

## Terminology (important — two different things are called "quotes")

The app contains two distinct quote concepts. Name them separately in the code, the database, and the UI. Never merge them.

- **Client Quote** — the total price quoted to the client for the entire project. One per project (with revision history). Broken down into portions that become the project's budget line items. Visible to admins, project managers, and the client it belongs to.
- **Trade Quote** — a bid submitted by a trades person for a scope of work on a project. Many per project. **Admin-only**, plus the submitting trade can see their own.

---

## User roles and permissions

Five roles, enforced **on the server** for every endpoint — not just hidden in the UI.

| Capability | Admin | Project Manager | User | Client | Trade |
|---|---|---|---|---|---|
| View all projects | ✅ | ✅ | ✅ | Assigned only | Assigned only |
| Create/edit projects | ✅ | ✅ | ❌ | ❌ | ❌ |
| View trades directory | ✅ | ✅ | ✅ | ❌ | ❌ |
| View **client quote** | ✅ | ✅ | ❌ | Own project only | ❌ |
| Create/edit client quote | ✅ | ✅ | ❌ | ❌ | ❌ |
| View **trade quotes** | ✅ | ❌ | ❌ | ❌ | Own quotes only |
| Enter/edit trade quotes | ✅ | ❌ | ❌ | ❌ | ❌ |
| View budgets | ✅ | ✅ | ❌ | ❌ | ❌ |
| Upload invoices | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve over-budget invoices | ✅ | ❌ | ❌ | ❌ | ❌ |
| Write internal reviews/ratings | ✅ | ✅ | ❌ | ❌ | ❌ |
| Read internal reviews | ✅ | ✅ | ❌ | ❌ | ❌ |
| Message trades people | ✅ | ✅ | ✅ | ❌ | Replies only |
| View project photos & 360s | ✅ | ✅ | ✅ | Assigned only | Assigned only |
| Manage users & roles | ✅ | ❌ | ❌ | ❌ | ❌ |

**Critical rules:**
- **Trade quote** records — amounts, competing bids, win/loss status — are **admin-only**. A trade may see only their own submitted bids. Project managers, users, and clients must not see trade quote data anywhere, including in API responses. Client quotes follow their own rule and are visible to admin, PM, and the owning client.
- Internal reviews and ratings are **never** visible to clients or trades people.
- Clients see a read-only view: project status, photos, 360 panoramas, and milestones. No financials, no directory, no reviews.

---

## Features

### 1. Dashboard (landing page after login)

- Card grid of all projects the user can access.
- Each card shows the **project's exterior photo** as the card image, plus project name, address, status badge (Pre-construction / In progress / On hold / Complete), % complete, and PM name.
- Admin/PM cards additionally show a budget health indicator: green (under budget), amber (within 5% of budget), red (over budget).
- Top of dashboard: summary tiles — active projects, invoices awaiting approval, unread messages, new 360 photos this week.
- Search and filter by status, region, and project manager.

### 2. Projects

Clicking a project card opens a project detail page with tabbed sections:

- **Overview** — address, client, start/target completion dates, status, exterior photo, description, assigned project manager, assigned trades.
- **Photos** — gallery of regular site photos, grouped by upload date, with lightbox viewing, captions, and tagging by phase (e.g. framing, drywall, finishing). Support multi-file upload and drag-and-drop.
- **360 Photos** — see section 6.
- **Budget** — see section 5.
- **Invoices** — see section 5.
- **Client Quote** — the active client quote and its portion breakdown, plus revision history. Admin, PM, and that project's client.
- **Trade Quotes** — admin only; all trade bids tied to this project, grouped by scope, with the selected winner highlighted.
- **Trades** — trades people assigned to this project with quick links to their profiles and message threads.
- **Documents** — general file uploads (PDF, images, spreadsheets).
- **Activity log** — chronological record of uploads, approvals, status changes, and comments.

### 3. Trades directory

- Browsable/searchable list of all trades people.
- **Filters:** region, trade type (e.g. Electrical, Plumbing, HVAC, Framing, Drywall, Roofing, Concrete, Landscaping — make trade types admin-editable), and average rating. Filters must be combinable.
- List view shows: company name, contact name, trade, region, average star rating, number of completed jobs.

**Trade profile page** contains:
- Contact information: company name, primary contact, phone, email, address, website, licence/WCB number, insurance expiry date.
- Trade type(s) and regions serviced.
- **Overall rating** displayed prominently at the top — a weighted average of all job ratings, shown as stars plus numeric value and review count.
- **Reviews section:** each entry is an internal project manager comment tied to a specific project, with a per-job star rating (1–5), reviewer name, and date. Optionally allow sub-ratings for quality, timeliness, communication, and cleanliness, averaged into the job rating.
- **Trade quotes section (admin only):** table of every bid this trade has submitted — project name, scope, quoted amount, date submitted, and outcome (**Won / Lost / Pending**). Show a win-rate percentage.
- **Message** button that opens a direct thread with this trade.
- Job history: projects worked on, with dates.

### 4. Messaging

- In-app direct messaging between internal staff and trades people, and internal-to-internal.
- Threaded conversations, optionally scoped to a project ("Message about: 123 Maple Ave").
- Real-time delivery, unread badge counts, message notifications.
- File and photo attachments in messages.
- Full message history is retained and searchable.
- Trades people can reply within their own threads but cannot browse the directory or start threads with clients.

### 5. Client quote, budgets, and invoice approval

**Client quote:**
- Each project has one active **client quote** — the total price quoted to the client for the whole job.
- The client quote is broken into portions (scope areas / cost codes) with an amount each. These portions **are** the project's budget line items — one source of truth, not two lists to reconcile.
- Support revisions: keep every version with a date and author, mark one as active, and show what changed between versions. Never overwrite a prior version.
- Show the client quote total on the project overview for admins, PMs, and that project's client.

**Budget:**
- Budget line items are generated from the active client quote's portions. Admins and PMs can also import via CSV/Excel or add line items manually.
- Line items have: cost code, description, assigned trade (optional), budgeted amount.
- Show total budget, invoiced to date, remaining, and variance — both per line item and project-wide.

**Invoice intake and automatic approval logic:**
- Invoices are uploaded (PDF or image) and **manually assigned** by the uploader to a project and to a specific budget line item via a dropdown. No auto-matching — keep this manual and explicit.
- Enter the invoice amount, vendor/trade, invoice number, and date.
- On submission, compare the invoice amount against the **remaining balance of its assigned budget line item**:
  - **If invoice ≤ remaining on that line item:** status is set to **Auto-approved**, and it becomes available to mark as purchased/paid. Log the amount, the line item, and the fact that approval was automatic.
  - **If invoice > remaining on that line item:** status is set to **Pending approval**, it is routed to an admin approval queue, and the overage is recorded (dollar amount and % over). It cannot be marked purchased until an admin approves or rejects it, with a required note on rejection.
- Every over-budget event is flagged and retained permanently so the team can see exactly where and by how much a project went over.

**Budget variance view:**
- Per-project table of every line item: quoted/budgeted vs invoiced vs variance, with over-budget rows highlighted using `--danger`.
- **Project roll-up against the client quote:** total client quote vs total invoiced vs remaining, expressed in dollars and percent. This is the headline number — a project can have several line items over while still sitting under the client quote overall, and both facts need to be visible at once. Show line-level overages and the project-level position side by side, never one instead of the other.
- A company-wide "Over Budget" report listing all flagged invoices across all projects, filterable by project, trade, cost code, and date range.

### 6. 360° photos

- Admins and PMs upload equirectangular 360° panoramas (2:1 JPEG) against a project, with a capture date and optional label (e.g. "Week 12 — Main floor").
- Panoramas are viewed **natively inside the app** using an embedded panorama viewer — drag to pan, pinch/scroll to zoom, fullscreen toggle. No redirect to any external service.
- Timeline/date selector so users can step through the panorama history for a project and see progress over time.
- On upload, **notify all users with access to that project** ("A new 360 photo is available for [Project Name]") via in-app notification, with optional email notification.
- Support multiple panoramas per capture date (e.g. one per room/location) with a location label.
- Generate and store a flat thumbnail for each panorama for use in listings.

### 7. Notifications

In-app notification centre with unread badge, covering:
- New 360 photo uploaded
- New regular photos uploaded
- New message received
- Invoice pending approval (admins)
- Invoice approved/rejected (submitter)
- Assigned to a project

---

## Branding and theme

The company is **Luminova Construction**. The logo is gold and silver on black: an isometric building mark above the wordmark. I am providing the logo file — place it top-left in the sidebar/header (on the dark surface, where it was designed to sit), on the login screen, and generate a favicon from the building mark alone.

Use these exact design tokens:

```css
/* Brand */
--gold-light:   #D4CB7A;  /* highlights, active nav text on dark */
--gold:         #AD9C4C;  /* PRIMARY — buttons, active states, key accents */
--gold-deep:    #907A2B;  /* hover state */
--gold-text:    #7A6626;  /* gold-coloured text/links on light backgrounds */
--silver:       #D9D9DA;  /* secondary accent, dividers on dark */

/* Surfaces */
--ink:          #121212;  /* sidebar, top bar, footers, 360 viewer chrome */
--ink-soft:     #1F1F1E;  /* raised surfaces on dark */
--canvas:       #FAFAF8;  /* app background */
--surface:      #FFFFFF;  /* cards */
--border:       #E4E2DC;

/* Text */
--text:         #1A1A18;
--text-muted:   #6B6862;

/* Status */
--success:      #2E7D4F;
--warning:      #C2410C;  /* deliberately orange, NOT amber */
--danger:       #B42318;
--info:         #2563EB;
```

**Rules for using these:**
- **Primary buttons are gold (`--gold`) with near-black text (`--ink`)**, not white text. That combination is both on-brand and passes contrast at 6.8:1. Gold with white text fails accessibility — do not use it.
- Gold is reserved for brand identity and primary actions. **Do not use gold or amber for status indicators** — budget-health and warning states would become indistinguishable from brand chrome. Use the status tokens above, where "warning" is orange rather than amber.
- Dark chrome (`--ink`) for the persistent sidebar and top bar; light canvas for the working area. This mirrors the logo's black background without making the whole app dark.
- The 360° viewer and the photo lightbox should use full dark chrome (`--ink`) so the imagery carries the screen.
- Use `--gold-light` for active/selected nav items sitting on the dark sidebar.

**Typography:** a strong, slightly condensed sans for headings (Inter Tight, Archivo, or similar) and a highly legible sans for body and data (Inter). Tabular numerals for all money columns. The logo wordmark uses a serif — do not try to match it in the UI; keep the interface sans-serif and let the logo carry that character.

**Visual direction:** clean, professional, high-contrast, and built for readability in bright outdoor light on a phone. Generous spacing, clear typographic hierarchy, subtle card shadows, rounded corners (6–8px). Avoid a generic dashboard-template look — status colours, badges, and data density should feel purpose-built for construction. Photos are first-class content: large, uncluttered, edge-to-edge where possible.

---

## Build order

Build in phases and make each phase working and demoable before moving on:

1. **Foundation** — auth, role system, user management, database schema, app shell with navigation and branding.
2. **Projects & dashboard** — project CRUD, exterior photo upload, dashboard card grid, project detail shell.
3. **Photos** — regular photo upload and gallery, then the 360 uploader and in-app viewer with the timeline.
4. **Trades directory** — trades CRUD, filters, profile pages, reviews and rating system.
5. **Quotes** — client quotes with portion breakdown and revisions; trade quotes with admin-only visibility, win/loss tracking, win-rate stats.
6. **Budgets & invoices** — budget line items derived from the client quote, invoice intake with manual line-item assignment, auto-approval logic, approval queue, variance reporting.
7. **Messaging & notifications** — real-time threads, attachments, notification centre.

## Requirements throughout

- Enforce permissions server-side on every route; never rely on hiding UI elements alone.
- Validate all uploads (file type, size limits) and store files with access control.
- Every list view should have search, filtering, and sensible empty states.
- All money values stored as integers (cents) to avoid floating-point errors.
- Timestamps stored in UTC, displayed in local time.
- Write the schema so it can be extended later — I will be adding more features (scheduling, change orders, RFIs, and client-facing progress reports are likely next).

Ask me any clarifying questions before you start building.
