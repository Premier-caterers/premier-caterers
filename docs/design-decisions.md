# Design decisions (summary)

Condensed from the claude.ai project notes (Sep–Nov 2026). Newer lines win.

## Direction history

1. Sep 2: **Clean Slate** — grouped sidebar, near-empty top bar (search + New),
   white canvas, one shared table / pill / card / button. Fraunces for titles
   and big numbers only, Inter everywhere else, IBM Plex Mono for event numbers.
   Wine `#7A2E3D` as the only accent. No brass (except semantic Meat/Dairy/Parve
   and partial-payment uses).
2. Sep: pivot toward a Zoho-CRM look — dark navy sidebar, crimson active state,
   large icon buttons on Clients.
3. Oct 1–2: **dashboard look** (My Day / Checklists kit) for the whole app —
   pastel tiles, shaded table headers, lavender panel header bands, full-color
   status cells that always carry a symbol. Client file opens as a full page
   ("Classic view" link restores the side drawer).

## Rules that hold everywhere

- **Colorblind-safe**: never color alone — always a symbol, shape or pattern.
  ✓ done · ● in progress · ✕ missing (red, required) · ○ optional/none (grey).
- **One stage vocabulary**: New inquiry · Menu sent · Followed up #1 ·
  Followed up #2 · Booked · Invoice sent · Paid · Lost.
- Event numbers: `YY-MMDD-NN[letter]` on the week-ending Sunday date.
- Payment state shown by border pattern on cards; loud red allergy banners.
- One record per event — never make staff hop between screens to see one event.
- Restyles are override layers appended to the end of `styles.css`; bump the
  `?v=` cache-buster in `index.html` each time.
- Print templates (BEO, cover sheet, grocery, staff schedule) don't load
  `styles.css` — they keep literal hex colors.

## Known leftovers

- Permission checks missing on Schedule, Checklists, Changes, Invoices,
  Equipment, Venues, Grocery, Trash (Josh/Kitchen are `canEdit:false` but can edit).
- No loading states — before Firebase loads, counts read 0.
- A few native `prompt()` / `confirm()` / `alert()` dialogs remain.
- Equipment page header hardcoded "W/E Jun 7".
- Settings: `followupsTestEmail` and `salespersonEmails` look blank after reload
  though saved correctly.

## Testing approach that works

Headless Chromium against local `index.html` with outside requests blocked and
a stand-in `db`; set `events` / `inquiries` / `checklists` globals, call
`render()` or `openEventFile()`, screenshot. Icon font won't load offline.
