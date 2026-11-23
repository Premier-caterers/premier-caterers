# Premier Caterers — Operations apps

Custom apps that run Premier Caterers. Hosted free on GitHub Pages:
`https://premier-caterers.github.io/premier-caterers/<page>.html`

**Anything merged into `main` is live within a few minutes.**
Rules for making changes are in [CLAUDE.md](CLAUDE.md).

## The apps (top level — do not move these, their web addresses are in use)

| Page | What it is | Who uses it |
|---|---|---|
| `index.html` | Operations Hub — pipeline, clients, events, invoices, cover sheet, checklists, My Day | Staff (login) |
| `dropoff.html` | Drop-off / à-la-carte ordering | Clients + staff (embedded on the website) |
| `eventday.html` | Event Day — phone app for event staff | Staff |
| `hub.html` | Communications hub (one screen for messages and tasks) | Staff |
| `hub-preview.html` | Earlier preview of the hub | — |
| `brief.html` | Interactive message brief | Kenny |
| `purchasing.html` | Purchasing, vendor pricing, invoice scanning | Staff |
| `grocery.html` | Grocery lists | Kitchen |
| `timeclock.html` | Employee time clock | Staff |
| `truck-checklist.html` / `truck-checklist-admin.html` | Weekly truck checks | Drivers / managers |
| `portal.html` | Client event page (opened from emailed link) | Clients |
| `sign.html` | Contract signing (emailed link) | Clients |
| `followup-action.html` | Approve / skip buttons in follow-up emails | Staff |
| `premier_caterers_form.html` | Website inquiry form (embedded in Wix) | Public |
| `gallery.html` / `photos.html` | Event photo albums | Clients / staff |
| `linens.html` | Linen colors page linked from the client portal | Clients |

Supporting files served by address: `styles.css`, `heic-to.js` (photo converter
for `photos.html`), `eventday-icon-*.png`, `eventday.webmanifest`,
`gmail-addon/logo.png`.

## Folders

| Folder | What's in it |
|---|---|
| `apps-script/` | Copies of the Google Apps Script code — see [apps-script/README.md](apps-script/README.md) |
| `firebase/` | Firestore security rules |
| `docs/` | How things work, and decisions already made |
| `backups/` | Automatic nightly copies of `index.html` and `grocery.html` (60 days) |

## Backend

- Database: Firebase Firestore, project `premier-caterers-internal-app`
- Email and automation: Google Apps Script, run as events@ and orders@
