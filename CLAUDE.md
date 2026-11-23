# Premier Caterers — instructions for Claude

Owner: Kenny (Premier Caterers, kosher catering, New Jersey, ~8–12 events/week).
Kenny is not a programmer. He does not use a terminal. Claude makes the changes,
commits and pushes; Kenny hard-refreshes (Ctrl+Shift+R) and checks.

## The most important rule: `main` is live

This repo is served by GitHub Pages from `main`
(`https://premier-caterers.github.io/premier-caterers/<file>`).
**A push to `main` is a live deploy to staff and clients.**

- Work on a branch. Merge to `main` only after Kenny says go.
- One change per deploy. Never bundle unrelated changes.
- Warn Kenny before changing or removing anything that already exists.
- Before a large build: honest pushback and risks first, then a mockup, then build.
- Never send a real client an automated email without Kenny's explicit OK.

## Do not move or rename the live pages

Every `.html` at the top level is a live web address that is already out in the
world: links in client emails (portal, sign, follow-up buttons), the Wix website
form and drop-off embed, staff home-screen icons (eventday, timeclock, truck
checklist), and the in-app "push to GitHub" button in `index.html` that writes
`index.html` at the top level. Also served by address and must stay put:
`styles.css`, `heic-to.js`, `eventday-icon-*.png`, `eventday.webmanifest`,
`gmail-addon/logo.png` (the Gmail button's icon), `backups/` (nightly workflow).

New pages go at the top level too. Behind-the-scenes files go in folders (below).

## Folder map

| Where | What |
|---|---|
| `*.html` (top level) | The live apps — see README.md for what each one is |
| `styles.css` | Shared stylesheet for `index.html` |
| `apps-script/` | Copies of the Google Apps Script code, one folder per Apps Script project (see `apps-script/README.md`) |
| `firebase/firestore.rules` | Firestore security rules (published by hand in the Firebase console) |
| `docs/` | How things work and decisions already made — read before big changes |
| `backups/` | Nightly dated copies of `index.html` and `grocery.html` (automatic, kept 60 days) |
| `.github/workflows/` | The nightly backup job |

## Editing checklist (every change)

1. Start from a fresh `origin/main`, never an old local copy.
2. Targeted edits only. Check the target text is unique before replacing it.
3. Validate every inline `<script>` block: extract them and run `node --check`.
   Check `<head>` angle brackets are balanced.
4. Changed `styles.css`? Bump the cache-buster `styles.css?v=N` near the top of
   `index.html` (currently around line 8), or browsers keep the old stylesheet.
5. `git diff` against `origin/main` — only the intended lines changed.
6. Tell Kenny what to hard-refresh and one thing to look for to confirm it's live.
   GitHub Pages can lag a few minutes; check the raw file before debugging code.

## Apps Script

The `.gs` files here are copies. The real code runs in Google Apps Script.
Kenny updates it by opening the raw GitHub link and pasting the **whole file**
over the one in the script editor — give him whole files, never patch steps,
and a word to Ctrl+F for so he can confirm he has the new version (raw links
can be stale for ~5 minutes after a push).

- Update a web app deployment as **Manage deployments → edit → New version** on
  the existing deployment so the URL stays the same. If a new URL is ever
  unavoidable, it must be pasted into the app's Settings.
- Never paste one project's `appsscript.json` into another project.
- Firestore/Storage REST calls from Apps Script need the `x-goog-user-project` header.
- `runQuery` needs the full `/documents` path before `:runQuery`.
- events@ has a daily Gmail allowance — never poll Gmail from browser tabs.

## Firestore / app code lessons

- One source of truth: the same data drives every view. No parallel copies.
- Use `update()`, not `set({merge:true})` (merge deep-merges nested maps).
- Nothing called inside an `onSnapshot` listener may write back unconditionally.
- Permissions: staff-only collections need a real staff login; public pages
  (form, portal, sign, timeclock, truck checklist, follow-up action, brief,
  drop-off) sign in anonymously. Adding a staff member = `staffEmails()` in
  `firebase/firestore.rules` AND `PC_EMAILS` in `index.html`, then republish rules.
- Dead code — leave alone: legacy `groceryLink`, `renderGrocery` /
  `groceryLists` / `groceryStations`; `renderDetail` / `.detail-panel` is the
  fallback for very old events and must not be deleted.
- No build step (no npm/Vite). Splitting `index.html` was considered and
  rejected — it would end Kenny's ability to deploy without a terminal.

## Design rules

- Colorblind-safe: status always shows a shape/symbol or pattern, never color alone.
  Symbols: ✓ done, ● in progress, ✕ missing, ○ optional/none.
- Shared components in `styles.css` (`.btn`, `.pill`, `.card`, `.tbl`, `.field`)
  — use them instead of inline styles.
- Print templates don't load `styles.css`, so they need literal colors.
- More in `docs/design-decisions.md`.

## How to talk to Kenny

Short, plain words, step-by-step, no jargon. Act and deliver rather than asking
lots of questions. Explain the reasoning briefly before writing code.
