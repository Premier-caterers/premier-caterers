# Deployment & security

Carried over from the claude.ai project notes (state as of 1 Oct 2026), updated
for the Nov 2026 folder layout.

## The repo is many apps, not one app plus junk

Every top-level `.html` is its own working app (see README.md). An earlier
session wrongly advised deleting "junk files" and keeping only `index.html` —
that would have destroyed most of the business tools. Never bulk-delete pages.

Hosted on GitHub Pages from `main`, so **a push to main is a live deploy**.

## How changes ship

Branch → commit → test → merge to `main` → Kenny hard-refreshes (Ctrl+Shift+R)
and spot-checks. Rollback: revert the commit (or restore from `backups/`; on
Sep 22 an old June build was uploaded over `index.html` and was restored from a
nightly backup).

Apps Script files: Kenny copies from the raw link
`https://raw.githubusercontent.com/Premier-caterers/premier-caterers/<branch>/apps-script/<folder>/<file>`
and pastes over the file in the script editor. Raw links can be stale for ~5
minutes after a push — give him a word to Ctrl+F for.

## Apps Script projects

| Project | Code in repo | Runs as |
|---|---|---|
| Premier Caterers Menu Automation | `apps-script/menu-automation/` (+ Followup.gs, FollowupSuggestions.gs, Grocery.gs not yet copied) | events@ |
| Premier Caterers Gmail button | `apps-script/gmail-button/` — shared with kenny@, shelley@, joshg@ as editors; each installs via Deploy → Test deployments → Install | events@ |
| "In client file" labeler | `apps-script/gmail-labels/` — set up in each inbox | each inbox |
| Premier Caterers Orders Relay | not in repo — invoice scanning for purchasing.html, 15-min trigger | orders@ |

**Never paste one project's appsscript.json into another.** On Oct 1 the Gmail
button's manifest was pasted into Menu Automation by mistake; restored from
Project History → Version 73.

## events@ daily Gmail allowance

events@ was running out of its daily Gmail allowance by late morning because
every open browser tab polled Gmail through the relay every 2 minutes. Fixed
Oct 1: the unanswered-email badge reads the `eventEmails` collection instead;
`Code.gs doGet` short-circuits the old request; EmailFiling.gs checks every 5
min, skips unchanged threads, and pauses an hour on a quota error. The
allowance can't be reset by hand — it returns ~24h after it ran out.

## Security

**Step 1 (29 Sep 2026):** anonymous sign-in for the public/shared apps; rules
require `request.auth != null`.

**Step 2 (1 Oct 2026):** staff-only collections need a real staff login (one of
the accounts in `PC_EMAILS`): all email-inbox data (`eventEmails`,
`emailThreads`, `emailFolders`, `emailTagRequests`, `emailJobs`,
`emailFilingStatus`) plus `changes`, `equipment`, `checklists`, `venues`,
`trash`, `groceryStations`, `groceryLists`, `activity`, `roadmap`, `regulars`,
`followupSuggestions`, `checklistEmailLog`. Apps Script uses the events@ Google
account and is not affected by rules.

To add a staff member: add their email to `staffEmails()` in
`firebase/firestore.rules` AND to `PC_EMAILS` in `index.html`, then publish the
rules in the Firebase console.

**Still open:** locking `events`, `invoices`, `contracts`, `clientPortals`,
`tc_*` needs the public pages changed first. `insuranceCompanyLinks_()` in
`index.html` prints an insurer login password in page source, which is public.
The time-clock manager PIN is in plain text in source.

## Architecture

Splitting `index.html` into components was considered and rejected — it needs a
build step (npm/Vite), which would end Kenny's ability to deploy without a
terminal.
