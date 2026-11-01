# Deepa Silks — Store Operations Checklist

A production-ready, self-contained store-operations checklist for **Deepa Silks**.
Staff sign in with a PIN, complete their assigned daily tasks (with photos where
required), and admins track completion, missed tasks, remarks, photo evidence and
audit history from a dashboard — with `.xlsx` / `.csv` export.

- **Frontend:** zero-build static HTML/CSS/JS → deploys to GitHub Pages as-is
- **Backend:** Google Apps Script (2 files) + Google Sheets as the single source of truth + private Google Drive for photos
- **Branding:** Deepa red **#B5122A** (major theme) / navy / cream palette with the Deepa logo and the tagline **“தீப வணக்கம்”** (login page, “Submitted!” screen and PDF report header); a small Consulting & Beyond logo sits at the bottom of every page (the only third-party mark — a transparent PNG that hides itself if the file is missing)
- **This repository contains no BSC data, no real PINs, no spreadsheet IDs and no secrets.**

> ⚠️ Nothing in this project has been deployed. All commands below are local.
> Deployment steps (for you to run and authorize later) are in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## Rolled out from the MPS Silks build — what changed

This is the MPS Silks checklist app re-branded for **Deepa Silks (Dharmapuri)**. Logic is unchanged.

| Item | MPS Silks | Deepa Silks |
|---|---|---|
| Logo | `images/mps-logo.png` | `images/deepa-logo.png` |
| Theme | maroon / gold / cream | red **#B5122A** / navy #0F2237 / cream |
| Tagline | — | **தீப வணக்கம்** (login, “Submitted!” screen, PDF header) |
| Backend files | `MPS_BACKEND.gs`, `mps-core.gs` | `DEEPA_BACKEND.gs`, `deepa-core.gs` |
| GitHub Actions variable | `MPS_API_ENDPOINT` | **`DEEPA_API_ENDPOINT`** |
| Browser globals / storage keys | `MPS_CONFIG`, `MPS_API`, `mpsAuth`, `mps_…` | `DEEPA_CONFIG`, `DEEPA_API`, `deepaAuth`, `deepa_…` (so both apps can live on the same GitHub account without clashing) |
| Default location | KGF | Dharmapuri |

**When you duplicate the MPS Google Sheet for Deepa:**
1. `Settings` tab → `Store_Name` = **Deepa Silks**, `Store_Location` = **Dharmapuri** (the sheet value wins over `js/config.js`).
2. `Users` tab → delete the MPS staff rows and add Deepa staff with plain 4-digit PINs (they are hashed automatically on first login; MPS hashes will not work with the new Apps Script project's salt).
3. `Submissions` tab → clear all rows below the header.
4. New Drive folder for photos; in the new Apps Script project set Script Properties `SS_ID` and `PHOTO_FOLDER_ID` to the **Deepa** sheet and folder.
5. Paste `backend/DEEPA_BACKEND.gs` + `backend/deepa-core.gs`, deploy the web app, then add the URL as the repo variable **`DEEPA_API_ENDPOINT`** in the new GitHub repo.

---

## Feature checklist

| Area | What you get |
|---|---|
| Login | 4–8 digit PIN keypad → server-issued session token (PIN never stored or echoed) |
| Roles | **Staff** and **Admin**, enforced **server-side** (hiding buttons is not authorization) |
| Staff workflow | Assigned tasks → local validation → photo upload → **submit only confirmed after backend save** → safe retry without duplicates |
| Task types | Yes/No (remarks required on “No”), rating (1–5), photo (upload required), free text |
| Missed vs pending | Sheet has no due times → **today = Pending**, **past dates = Missed** (documented rule) |
| Completion % | distinct assigned tasks with a valid latest submission ÷ active assigned tasks; **failed ≠ passed** |
| Dashboard | date filters, headline stats, section & staff breakdowns, daily trend, outstanding list, remarks + photos, updates log |
| Admin UI | add / edit / activate / delete tasks, manage staff + PINs + roles, store settings — **no code changes needed** |
| Photos | type/size validated, stored **private** in Drive, served only through authenticated `getPhoto`; **true capture time** read from the photo's EXIF before compression |
| Admin photo gallery | Photos tab: date range + **section filter chips with counts**, tap-to-load thumbs, tap-to-enlarge, “Photo taken” vs “Submitted” times |
| PDF report | staff download an A4 PDF (summary, per-section table, photo thumbnails, page numbers) — generated **in the browser**, no server round-trip |
| Export | `.xlsx` (primary) and `.csv` (secondary), formula-injection safe, generated client-side |
| Audit | every submission keeps history (`Sequence: First/Update`, `Submission_ID`, update reason, timestamp) |
| Security | salted SHA-256 PINs, rate limiting, LockService, session revocation, cache invalidation |

---

## Quick start (local, nothing deployed)

Requirements: **Node ≥ 18.17** (only for lint/test/build), Python 3 (optional, for the workbook template / cross-checks).

```powershell
# 1. syntax-check every JS/.gs file
npm.cmd run lint          # → node scripts/check-syntax.js

# 2. run the full test suite (120 tests: core logic, dates/IST, EXIF, PDF report data, XLSX/CSV, page hygiene)
npm.cmd test              # → node --test

# 3. production build → dist/
npm.cmd run build         # → node scripts/build.js

# 4. preview the build locally
npm.cmd run serve         # http://localhost:4173
```

> `npm.cmd` (or plain `node …`) is used on Windows when npm is blocked by PowerShell execution policy.

Set your backend URL at build time (public configuration, not a secret):

```powershell
$env:DEEPA_API_ENDPOINT = "https://script.google.com/macros/s/…/exec"
npm.cmd run build         # injects it into dist/js/config.js
```

If unset, the build keeps the `__DEEPA_API_ENDPOINT__` placeholder and the app
tells you it is not configured yet.

---

## Repository layout

```
deepa-silks-store-checklist/
├── index.html            # PIN login (keypad)
├── checklist.html        # staff: today's tasks, validation, photos, submit
├── dashboard.html        # admin: stats, filters, breakdowns, trend, exports
├── admin.html            # admin: tasks / staff / settings (server-enforced)
├── css/theme.css         # Deepa red #B5122A / navy / cream design system (+ shared C&B footer)
├── js/
│   ├── config.js         # public endpoint (build-injected)
│   ├── auth.js           # token session storage
│   ├── api.js            # GET/POST client, photo fetch
│   ├── dates.js          # Asia/Kolkata date helpers
│   ├── exif.js           # tiny dependency-free JPEG EXIF reader (capture time)
│   ├── ui.js             # shared UI helpers (modal, toast, spinner…)
│   ├── report.js         # pure PDF-report data + jsPDF renderer
│   ├── vendor/           # vendored third-party (jspdf.umd.min.js) — never a CDN
│   └── xlsx.js           # zero-dependency .xlsx/.csv writer
├── images/deepa-logo.png   # Deepa logo
├── images/cb-logo.png    # Consulting & Beyond logo (page footer + PDF header);
│                         # optional — every use hides itself if the file is absent
├── backend/
│   ├── deepa-core.gs       # pure logic (validated by the Node test suite)
│   ├── DEEPA_BACKEND.gs    # Apps Script IO: routing, sessions, sheets, photos
│   └── appsscript.json   # manifest (Scopes, timezone, webapp config)
├── sheets/deepa-silks-workbook-template.xlsx   # clean Google Sheet template
├── scripts/              # lint / build / workbook-template generator
├── tests/                # node --test suite
├── docs/                 # architecture, API, security, deployment, troubleshooting
├── .github/workflows/deploy.yml   # lint → test → build → GitHub Pages
├── .env.example          # public env config (placeholders only)
└── .nojekyll
```

---

## Documentation

| Doc | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | components, data flow, completion-% maths, pending/missed rule, sheet schema & header mapping |
| [docs/API.md](docs/API.md) | every GET/POST action, parameters, responses, error codes |
| [docs/SECURITY.md](docs/SECURITY.md) | auth model, PIN hashing, sessions, rate limits, photo privacy, Apps Script limitations (honest) |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | **step-by-step commands for you to authorize later**: repo, Pages, Apps Script, sheet, properties, first admin |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | common errors and fixes |
| [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md) | the one vendored library (jsPDF, MIT), how to refresh it, logo/branding credits |

---

## Development notes

- **No runtime npm dependencies.** The XLSX writer, hash, date logic, EXIF reader etc. are
  implemented in-repo. The one devDependency (`jspdf`) exists only so `js/vendor/jspdf.umd.min.js`
  can be refreshed from `node_modules`; the site itself loads that single vendored file (never a CDN).
  Node is used only for lint/test/build.
- **Logos:** `images/deepa-logo.png` is the Deepa brand; `images/cb-logo.png` is the Consulting & Beyond
  credit shown in the shared page footer and in the PDF header. To replace the C&B logo, drop a new
  **transparent PNG** (alpha channel, ideally ≤ 150 KB, roughly 4× width-to-height) at exactly
  `images/cb-logo.png` — no code change needed. The artwork is dark grey, so it is shown as-is on the
  light pages and turned white where the background is dark: in CSS with `.cb-logo--onDark`
  (`filter: brightness(0) invert(1)`) on the red login page, and in the PDF by recolouring the same
  PNG white at runtime on a canvas (`globalCompositeOperation = 'source-in'`) — one file, never two.
  If the file is missing, every use hides itself (`onerror`), so a missing file never shows a broken
  icon or a placeholder.
- **PDF report:** staff press “Download PDF report” on the Completed tab or the success screen.
  The report is assembled in the browser from the checklist data already on the device and rendered
  with the vendored jsPDF; photos are fetched through the same private `getPhoto` endpoint (3 at a
  time, with progress) and re-compressed to ≤ 800 px before embedding. An admin-wide “PDF for any
  day/staff member” can be added later by calling `DeepaReport.buildReportData` with a
  `getDashboard`-style payload and `downloadReport(...)` from `dashboard.html` — no backend change.
- **The Google Sheet is the source of truth** for tasks, users, submissions and settings. The app
  never assumes a fixed column order — headers are matched by alias, unmapped rows/columns are
  *reported* (dashboard “mapping problems”, admin log), never silently dropped.
- **The backend core is shared with tests:** `backend/deepa-core.gs` is a pure UMD module, executed
  directly by `node --test` — the same code that runs in production is what the tests exercise.
- **Timezone:** everything (day boundaries, “today”, trend dates, sheet `Date` values) uses
  `Asia/Kolkata`, not the server or browser timezone.

## Status

| Check | Result |
|---|---|
| `npm.cmd run lint` | ✅ 18/18 files pass syntax check |
| `npm.cmd test` | ✅ 120/120 tests pass |
| `npm.cmd run build` | ✅ `dist/` produced (placeholder endpoint until configured) |
| Deployment | ❌ **Not performed — intentionally.** See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). |
