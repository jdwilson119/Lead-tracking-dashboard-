# Lead Tracking Dashboard

A lead-intake → Google Sheet → live dashboard pipeline for tracking leads
(candidates, prospects, etc.), with optional sync into JobAdder (CRM) and
CV attachment. Leads land in a Sheet automatically. When someone marks a
lead "Contacted" from the dashboard, the sheet updates instantly — the
dashboard and the sheet are always in sync because the dashboard reads
live from the sheet.

Pick the intake path that matches your lead source:

- **[Google Form](#setup-google-form)** — if leads come in through a
  Google Form.
- **[Meta Lead Ads via Make.com](#setup-meta-lead-ads-via-makecom-recommended)**
  (recommended) — if leads come in through Facebook/Instagram lead ads.
- **[Meta Lead Ads via custom webhook](#alternative-meta-lead-ads-via-custom-webhook)**
  — a free but more involved alternative to Make.com.

All paths write into the same sheet/dashboard, so you can also run more
than one at once (e.g. a Google Form for direct applicants, Meta for ads).

## Before you start: what you'll need

The core problem this solves — Facebook lead ads that currently get
copy-pasted by hand into a spreadsheet and then re-typed into JobAdder —
needs access to three separate accounts before it can be built. None of
this can be set up in advance without them; line these up first:

- [ ] **A Google account** to own the Sheet, Apps Script project, and
      dashboard deployment (yours or the client's — whoever should own
      the data long-term).
- [ ] **A Make.com account** (free tier is enough to start; check actual
      lead volume against the ~1,000 operations/month free-tier cap once
      live).
- [ ] **Facebook Business Manager access** to the client's ad account and
      the Page running the lead ads, with permission to connect Make.com
      to it (an admin on the Business Manager can grant this).
- [ ] **JobAdder API access** — ask the client's JobAdder admin for API
      credentials (Client ID/Secret, OAuth2 app registration) or to add
      you as a user with API access. JobAdder's API docs:
      [developer.jobadder.com](https://developer.jobadder.com).
- [ ] **Confirm the JobAdder candidate fields** the client wants
      populated (name, email, phone, source, notes at minimum) and
      whether they want leads created as **Candidates** only, or also
      linked to a specific **Job Ad**/requisition in JobAdder.

Once those are in hand, come back and we can build the real Make.com
scenario step by step (I can walk through each module's exact
configuration, but can't click through Make/Facebook/JobAdder's UI
myself).

Once leads are flowing in, two optional add-ons build on top:

- **[Sync to JobAdder](#optional-sync-to-jobadder-via-makecom)** — mirror
  leads and their contacted status into the client's JobAdder CRM.
- **[Attach CVs](#optional-attaching-cvs)** — since Meta's lead forms
  can't collect file uploads, this covers matching emailed-in CVs back to
  the right lead.

## How it works

- **Google Sheet** stores every lead, plus three tracking columns:
  `Status`, `Contacted Date`, `Contacted By`.
- **Apps Script** (bound to the Sheet):
  - `Code.gs` — stamps new leads `Status = New`, serves the dashboard,
    and updates the sheet when a lead is marked contacted.
  - `Dashboard.html` — the dashboard UI. Polls every 30 seconds so
    anyone with it open sees updates without refreshing.
  - `MetaWebhook.gs` — receives Meta's Lead Ads webhook directly and
    appends new leads to the sheet (only needed for the custom-webhook
    alternative, not the Make.com path).
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
   too). You don't need `MetaWebhook.gs` for this path.

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

## Setup: Meta Lead Ads via Make.com (recommended)

Make.com's native Facebook Lead Ads app handles Meta's webhook
verification, token refresh, and field mapping for you — no Facebook App
review or business verification wait, at the cost of a small monthly
Make.com plan once lead volume grows past the free tier (~1,000
operations/month).

1. **Create a Google Sheet** (a plain new spreadsheet — no Form needed).
   Open **Extensions → Apps Script** and copy in `Code.gs`,
   `Dashboard.html`, and `appsscript.json` from this repo. Set
   `SHEET_NAME` in `Code.gs` to the tab you're using (e.g. `Leads`) — the
   script creates that tab automatically the first time it runs. Skip
   `MetaWebhook.gs` entirely; Make.com replaces it.
2. **Deploy the dashboard** — see [Deploy the dashboard](#deploy-the-dashboard)
   below, and run **Lead Dashboard → Set up tracking columns** once so the
   header row (including `CV Link`, used later) exists before Make.com
   starts writing rows.
3. **Build the Make.com scenario:**
   1. **Trigger — Facebook Lead Ads: Watch Leads.** Connect the client's
      Facebook Business account, pick the Page and lead form(s).
   2. **Google Sheets — Add a Row**, into the same tab the dashboard
      reads. Map: Name, Email, Phone, Company, Job Title,
      Lead Source → `"Meta Ad"`, Notes, `Status` → hardcoded `"New"`,
      Timestamp → `now`. Leave `CV Link`, `Contacted Date`, and
      `Contacted By` blank.
4. Turn the scenario on. New Meta leads now land straight in the sheet
   and show up on the dashboard as **New**.

---

## Alternative: Meta Lead Ads via custom webhook

Meta doesn't write to Sheets on its own; this alternative uses a webhook
you host yourself instead of Make.com — free, but requires a Facebook App
with business verification, and more manual setup than the Make.com path
above.

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
  - Google Form or Make.com path: "Anyone within your organization" is
    fine — edit `appsscript.json`'s `access` back to `"DOMAIN"` since
    nothing needs to reach the script anonymously.
  - Custom webhook path: must be **"Anyone"** (`ANYONE_ANONYMOUS`), since
    Meta calls it without a Google login. Share the dashboard as
    `.../exec?key=YOUR_DASHBOARD_ACCESS_KEY` if you set one.

Deploy, then share/open that URL — that's your live dashboard.

---

## Optional: Sync to JobAdder via Make.com

The client wants leads linked to the **specific Job Ad** they applied
for, not just created as loose candidates — which means Make also needs
to know *which* Job Ad a given lead is for. Since a Facebook lead ad
almost always maps to one specific role, the practical way to resolve
that is a small lookup table matching each Facebook lead form to its
JobAdder Job Ad.

JobAdder has a documented REST API with OAuth2 and appears as a native
app in Make's directory — confirm the exact module names in your Make
account, since candidate/application modeling varies by JobAdder API
version; a generic HTTP module with a JobAdder OAuth2 connection covers
any endpoint if a native module is missing.

**0. Set up the Job Ad mapping.** Add a `Job Ad Mapping` tab to the same
spreadsheet with columns: `Facebook Form ID`, `Facebook Form Name`,
`JobAdder Job Ad ID`, `Job Title`, `Client`. Fill in one row per active
ad — whoever launches a new Facebook lead ad needs to add a row here
pointing at that specific ad's JobAdder Job Ad ID. This is the one manual
step that can't be automated away, since it's a business decision (which
ad is for which role/client), not data already sitting in either system.

The mapping is keyed on the **Facebook Form ID**, not the job title — so
running several ads with the identical title (e.g. "Driller Offsider" for
three different clients at once) works correctly: each ad is a distinct
Facebook form with its own Form ID, so each still resolves to the right
Job Ad. The `Client` column exists so the dashboard can tell those apart
at a glance instead of showing "Driller Offsider" three times with no way
to distinguish them.

**Create the candidate and link them to the Job Ad** (append to the Meta
→ Sheet scenario, after the Google Sheets "Add a Row" step):

1. **Google Sheets — Search Rows** on `Job Ad Mapping`, matching the
   Facebook Form ID from the trigger's payload, to get the `JobAdder Job
   Ad ID`, `Job Title`, and `Client`.
2. **Google Sheets — Update a Row** (the lead row just added) — set its
   `Job Ad` column to `Job Title` + " — " + `Client` (e.g. "Driller
   Offsider — Coastal Mining Co."), so it's clear on the dashboard both
   which role and which client each lead is for.
3. **JobAdder — Search Candidates by Email** (or `GET /v2/candidates?email=...`
   via HTTP) to check whether this person already exists in JobAdder.
4. **Router**, branching on whether step 3 found a match:
   - **Match found:** **JobAdder — Update Candidate** — patch
     phone/notes/source if changed, so you don't create a duplicate
     candidate record.
   - **No match:** **JobAdder — Create Candidate** — map Name →
     firstName/lastName, Email, Phone/mobile, Lead Source into JobAdder's
     source/notes field.
5. **JobAdder — Create Job Application**, linking the candidate ID from
   step 4 to the Job Ad ID from step 1. This is the step that actually
   attaches the lead to the specific role in JobAdder, rather than
   leaving them as an unlinked candidate.
6. **Google Sheets — Update a Row** — write the resulting Candidate ID
   and Job Application ID back into hidden columns on the lead's row (add
   `JobAdder Candidate ID` / `JobAdder Application ID` to the sheet).
   The "push Contacted status" scenario below needs the Application ID
   to know which JobAdder record to update.
7. **(Optional) Error handling** — a Break/Resume or Filter on the
   JobAdder steps (including "no mapping row found" from step 1), feeding
   a Slack or email alert, so a failed sync doesn't fail silently — the
   lead still lands in the Sheet either way.

**Push "Contacted" status into JobAdder** (a separate scenario):

1. **Trigger — Google Sheets: Watch Rows** (or Watch Row Updates) on the
   leads tab, filtered to rows where `Status` changed to `Contacted`.
2. **JobAdder — Update Job Application status**, using the Job
   Application ID captured in step 5 above, moving that specific
   application forward (e.g. to "Contacted"/"In Progress") — updating the
   *application*, not just the candidate record, matters once the same
   person could be linked to more than one Job Ad over time.

---

## Optional: Attaching CVs

**Important limitation:** Meta's Lead Ads forms have no file-upload
question type, so a CV can never come through the Meta lead ad itself.
This sheet/dashboard already has a `CV Link` column reserved for whichever
of the following applies:

- **CVs emailed in separately** (e.g. a candidate replies to outreach, or
  sends it to a dedicated inbox) — build a Make.com scenario:
  1. **Trigger — Email: Watch Emails**, on the inbox/label CVs arrive at,
     filtered to messages with an attachment.
  2. **Filter** — attachment type is PDF/DOC/DOCX.
  3. **Google Sheets — Search Rows** on the leads tab, matching the
     sender's email address to a lead.
  4. **Router**, branching on whether a match was found:
     - **Match found:** **Google Drive — Upload a File** (save the
       attachment, named by lead name/date) → **Google Sheets — Update a
       Row**, setting `CV Link` to the Drive file's shareable URL. Then
       **JobAdder — Upload Attachment to Candidate**, attaching the same
       file to their JobAdder record via the candidate ID from the
       Meta → JobAdder scenario.
     - **No match:** upload the file to Drive anyway and log it to a
       separate "Unmatched CVs" tab (or a Slack alert) for manual
       matching, rather than dropping it.
- **A separate upload form** — if you'd rather ask for the CV
  proactively, send new leads a follow-up link (email/SMS) to a small
  form (Google Form, JotForm, etc.) with a file-upload question just for
  the CV, and point a Make.com scenario at that form's responses instead
  of an inbox, following the same match/upload/update steps above.

Once a `CV Link` is set, it shows up in the dashboard as a **View CV**
link on that lead's row.

---

## Optional: Instagram DM Outreach

A second dashboard tab tracks Instagram DM conversations for outreach —
who's messaged you, whether you've replied, a live feed of recent
messages, and message received/delivered/read counts. It uses the same
Apps Script project and spreadsheet as the leads pipeline.

**Important limitation:** Instagram's API does not let any app — including
this one — see who your followers are or fire an event when someone new
follows. That's a deliberate platform restriction, not a gap in this
build, and there's no legitimate way around it (scraping Instagram to get
follower lists violates its Terms of Service and risks the account being
banned). What Instagram *does* expose is an aggregate daily follower
count, which is what powers the "New Followers (24h/7d)" tiles — real
numbers, but a count only, refreshed about once a day on Instagram's
side, not live, and with no way to tell you the names behind that number.

1. **Reuse or add `MetaWebhook.gs` and `Instagram.gs`** in the same Apps
   Script project as the leads pipeline (see either Meta setup path
   above for the base Facebook App).
2. **Connect an Instagram professional account** (Business or Creator) to
   the same Facebook Page used for the app, if it isn't already
   (Instagram app → Settings → Linked Accounts).
3. **Add permissions to the Facebook App:** `instagram_basic`,
   `instagram_manage_messages`, and `instagram_manage_insights` (for the
   follower-count feature). These require App Review before they work for
   accounts other than the app's own test users/admins.
4. **Find the Instagram Business Account ID** — e.g.
   `GET /me/accounts?fields=instagram_business_account&access_token=...`
   against the connected Page.
5. **Add `IG_USER_ID`** to Script Properties: open `setMetaScriptProperties()`
   in `MetaWebhook.gs`, fill in the real ID alongside your other secrets,
   run it once, then remove the real value from source.
6. **Subscribe the webhook** to the `messages`, `message_deliveries`, and
   `message_reads` fields on the **`instagram`** object (a separate
   subscription object from the `page`/`leadgen` one used for lead ads —
   both point at the same callback URL and verify token).
7. **Add the daily follower-count trigger:** in the Apps Script editor,
   **Triggers → Add Trigger** → function `logDailyFollowerCount_` → event
   source `Time-driven` → `Day timer` (any time is fine — once a day is
   all the underlying data supports).
8. **Send yourself a test DM** on Instagram and confirm it shows up on
   the dashboard's Instagram tab within ~10 seconds.

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
- `Dashboard.html` — the dashboard UI served by the web app (Leads and
  Instagram DMs tabs).
- `MetaWebhook.gs` — Meta Lead Ads + Instagram messaging webhook receiver
  (only needed for the custom-webhook alternative for leads; required for
  the Instagram DM feature either way).
- `Instagram.gs` — Instagram DM/contact tracking and follower-growth
  logic.
- `appsscript.json` — Apps Script project manifest/web app config.
