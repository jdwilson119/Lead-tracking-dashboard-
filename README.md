# Lead Tracking Dashboard

A Google Form → Google Sheet → live dashboard pipeline for tracking leads
(candidates, prospects, etc.). When a lead fills out the form, they land in
the sheet automatically. When someone marks a lead "Contacted" from the
dashboard, the sheet updates instantly — the dashboard and the sheet are
always in sync because the dashboard reads live from the sheet.

## How it works

- **Google Form** collects leads (name, email, phone, company, job title,
  lead source, notes).
- **Google Sheet** stores every response (Google Forms creates this
  automatically) plus three tracking columns: `Status`, `Contacted Date`,
  `Contacted By`.
- **Apps Script** (`Code.gs` + `Dashboard.html`, bound to the Sheet):
  - Stamps every new form submission with `Status = New`.
  - Serves the dashboard as a web app, reading straight from the sheet.
  - Lets you click "Mark Contacted" on a lead, which writes the status,
    timestamp, and who contacted them back into the sheet.
  - Polls every 30 seconds so anyone with the dashboard open sees updates
    without refreshing.

## One-time setup

1. **Create the form.** In Google Forms, create the intake form with these
   fields (add/remove as needed):
   - Name
   - Email
   - Phone
   - Company
   - Job Title
   - Lead Source (dropdown: Referral, Website, Event, Cold Outreach, Other)
   - Notes

2. **Link it to a Sheet.** In the Form editor, go to **Responses → Link to
   Sheets → Create a new spreadsheet**. This creates a response sheet named
   `Form Responses 1` by default.

3. **Add the Apps Script project.** Open the linked spreadsheet →
   **Extensions → Apps Script**. Delete the default `Code.gs` boilerplate
   and copy in this repo's `Code.gs`, `Dashboard.html`, and
   `appsscript.json` (use the manifest's gear icon → "Show appsscript.json"
   to paste that one in).

   > If `SHEET_NAME` in `Code.gs` doesn't match your response tab's name,
   > update the constant at the top of the file.

4. **Wire up the on-submit trigger.** In the Apps Script editor: **Triggers**
   (clock icon) → **Add Trigger** → choose function `onFormSubmit`, event
   source `From spreadsheet`, event type `On form submit`. Save.

5. **Backfill any existing rows.** Reload the spreadsheet — a **Lead
   Dashboard** menu appears. Click **Lead Dashboard → Set up tracking
   columns**, then **Backfill existing rows** if you already had
   submissions before setting this up.

6. **Deploy the dashboard.** In Apps Script: **Deploy → New deployment →
   Web app**. Set "Execute as" to yourself and "Who has access" to whoever
   should view the dashboard (e.g. "Anyone within your organization").
   Deploy, then share the resulting URL — that's your live dashboard.

## Day-to-day use

- New form submissions show up on the dashboard as **New**.
- Click **Mark Contacted** once you've reached out — this timestamps the
  sheet and flips the badge to **Contacted** for everyone viewing the
  dashboard.
- Click **Revert to New** if you marked something by mistake.
- The sheet is still the source of truth — editing the `Status` column
  directly in Sheets is reflected on the dashboard on its next refresh.

## Files

- `Code.gs` — Apps Script server-side logic (trigger, data access, status
  updates).
- `Dashboard.html` — the dashboard UI served by the web app.
- `appsscript.json` — Apps Script project manifest/web app config.
