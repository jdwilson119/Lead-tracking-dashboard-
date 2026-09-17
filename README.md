# Lead Tracking Dashboard

A lead-intake → Google Sheet → live dashboard pipeline for tracking leads
(candidates, prospects, etc.). Leads land in a Sheet automatically —
either from a linked Google Form or from Meta (Facebook/Instagram) Lead
Ads. When someone marks a lead "Contacted" from the dashboard, the sheet
updates instantly — the dashboard and the sheet are always in sync
because the dashboard reads live from the sheet.

Pick the intake path that matches your lead source:

- **[Google Form](#setup-google-form)** — if leads come in through a
  Google Form.
- **[Meta Lead Ads](#setup-meta-lead-ads)** — if leads come in through
  Facebook/Instagram lead ads.

Both write into the same sheet/dashboard, so you can also run both at
once.

## How it works

- **Google Sheet** stores every lead, plus three tracking columns:
  `Status`, `Contacted Date`, `Contacted By`.
- **Apps Script** (bound to the Sheet):
  - `Code.gs` — stamps new leads `Status = New`, serves the dashboard,
    and updates the sheet when a lead is marked contacted.
  - `Dashboard.html` — the dashboard UI. Polls every 30 seconds so
    anyone with it open sees updates without refreshing.
  - `MetaWebhook.gs` — receives Meta's Lead Ads webhook and appends new
    leads to the sheet (only needed for the Meta path).
- Marking a lead "Contacted" writes the status, timestamp, and who
  contacted them straight back into the sheet — nothing else to sync.

---

## Setup: Google Form

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
   and copy in this repo's `Code.gs` and `Dashboard.html` (use the
   manifest's gear icon → "Show appsscript.json" to paste that file in
   too). You don't need `MetaWebhook.gs` unless you're also doing the
   Meta setup below.

   > If `SHEET_NAME` in `Code.gs` doesn't match your response tab's name,
   > update the constant at the top of the file.

4. **Wire up the on-submit trigger.** In the Apps Script editor: **Triggers**
   (clock icon) → **Add Trigger** → choose function `onFormSubmit`, event
   source `From spreadsheet`, event type `On form submit`. Save.

5. **Backfill any existing rows.** Reload the spreadsheet — a **Lead
   Dashboard** menu appears. Click **Lead Dashboard → Set up tracking
   columns**, then **Backfill existing rows** if you already had
   submissions before setting this up.

6. Continue at [Deploy the dashboard](#deploy-the-dashboard) below.

---

## Setup: Meta Lead Ads

Meta doesn't write to Sheets on its own, so this uses a webhook: Meta
notifies the script the instant a lead comes in, and the script pulls the
full lead data via the Graph API.

1. **Create a Google Sheet** (a plain new spreadsheet — no Form needed).
   Open **Extensions → Apps Script** and copy in `Code.gs`,
   `Dashboard.html`, `MetaWebhook.gs`, and `appsscript.json` from this
   repo.
2. **Set `SHEET_NAME` in `Code.gs`** to a tab name you're using (e.g.
   `Leads`) — the script creates that tab automatically if it doesn't
   exist yet.
3. **Create a Facebook App** at [developers.facebook.com](https://developers.facebook.com):
   - App type: Business.
   - Add the **Webhooks** and **Pages** products.
   - Complete Meta's business verification if prompted (required for
     lead access).
4. **Get a Page Access Token** with the `leads_retrieval` and
   `pages_manage_ads` permissions, for the Page running the ads (Graph
   API Explorer, or your app's Page settings).
5. **Set your secrets in Apps Script.** Open `MetaWebhook.gs`, find
   `setMetaScriptProperties()`, fill in real values for
   `META_VERIFY_TOKEN`, `META_PAGE_ACCESS_TOKEN`,
   `WEBHOOK_SHARED_SECRET`, and `DASHBOARD_ACCESS_KEY` (make up random
   strings for the three that aren't the Page token). Run that function
   once from the Apps Script editor (select it in the function dropdown
   → **Run**), then remove the real values from the source so they're
   not sitting in plaintext.
6. **Deploy the web app** — see [Deploy the dashboard](#deploy-the-dashboard)
   below. Because Meta must reach it with no Google login, this deployment
   is set to allow anonymous access (`ANYONE_ANONYMOUS` in
   `appsscript.json`) — that's why step 5's `DASHBOARD_ACCESS_KEY` exists,
   to keep the dashboard itself from being viewable by anyone who finds
   the URL.
7. **Register the webhook** in the Facebook App's **Webhooks** settings:
   - Callback URL: your deployed web app URL with the shared secret
     appended, e.g. `https://script.google.com/macros/s/XXXX/exec?token=YOUR_WEBHOOK_SHARED_SECRET`
   - Verify token: the same value you set as `META_VERIFY_TOKEN`.
   - Subscribe to the **`leadgen`** field, and subscribe your Page to
     the app.
8. **Send a test lead** (Meta's Lead Ads testing tool, or a real test
   submission) and check **Executions** in the Apps Script editor to
   confirm it landed in the sheet. If fields show up under the wrong
   column, check the logged `field_data` names and adjust `META_FIELD_MAP`
   at the top of `MetaWebhook.gs` to match your form's actual field keys.

---

## Deploy the dashboard

In the Apps Script editor: **Deploy → New deployment → Web app**.

- **Execute as:** yourself.
- **Who has access:**
  - Google Form path only: "Anyone within your organization" is fine —
    edit `appsscript.json`'s `access` back to `"DOMAIN"` if you don't need
    the Meta webhook.
  - Meta path: must be **"Anyone"** (`ANYONE_ANONYMOUS`), since Meta calls
    it without a Google login. Share the dashboard as
    `.../exec?key=YOUR_DASHBOARD_ACCESS_KEY` if you set one.

Deploy, then share/open that URL — that's your live dashboard.

## Day-to-day use

- New leads show up on the dashboard as **New**, whichever source they
  came from.
- Click **Mark Contacted** once you've reached out — this timestamps the
  sheet and flips the badge to **Contacted** for everyone viewing the
  dashboard.
- Click **Revert to New** if you marked something by mistake.
- The sheet is still the source of truth — editing the `Status` column
  directly in Sheets is reflected on the dashboard on its next refresh.

## Files

- `Code.gs` — Apps Script server-side logic (sheet access, status
  updates, dashboard serving).
- `Dashboard.html` — the dashboard UI served by the web app.
- `MetaWebhook.gs` — Meta Lead Ads webhook receiver (only needed for
  the Meta setup path).
- `appsscript.json` — Apps Script project manifest/web app config.
