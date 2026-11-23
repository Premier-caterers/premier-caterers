# Apps Script code

These are **copies**. The real code runs inside Google Apps Script.
To update: open the file's raw GitHub link, copy everything, paste it over the
whole file in the script editor, save, then (for web apps) Manage deployments →
edit → **New version**.

| Folder | Apps Script project | Runs as |
|---|---|---|
| `menu-automation/` | **Premier Caterers Menu Automation** — `Code.gs` (web-app relay), `FollowupApi.gs`, `EmailFiling.gs`, `ChecklistEmails.gs` | events@ |
| `gmail-button/` | **Premier Caterers Gmail button** — `Button.gs` (Gmail add-on), `Server.gs`, `appsscript.json` | events@ (installed by each user) |
| `gmail-labels/` | **"In client file" Gmail label** — `Labeler.gs`, `appsscript.json`. Set up separately in each inbox | each inbox |

The Gmail button's icon is served from `/gmail-addon/logo.png` at the top of the
repo — leave it there, the add-on loads it by web address.

## Not in the repo yet

These live only in Apps Script. Adding copies here would make the repo the
complete source:

- Menu Automation: `Followup.gs`, `FollowupSuggestions.gs`, `Grocery.gs`
- **Premier Caterers Orders Relay** (orders@) — invoice scanning for `purchasing.html`
- `Caterercopy.gs` — bound to the weekly W/E Google Sheet ("Caterer copy" menu)

Never paste one project's `appsscript.json` into another project.
