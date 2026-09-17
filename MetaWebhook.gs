/**
 * Meta (Facebook/Instagram) Lead Ads webhook receiver.
 *
 * Meta calls this same web app URL two ways:
 *  - GET, once, to verify the webhook (handled in Code.gs's doGet, which
 *    delegates to handleMetaVerification_ below).
 *  - POST, every time a new lead is submitted, with a lightweight
 *    notification containing a leadgen_id. This script then calls the
 *    Graph API to fetch the full lead data and appends it to the sheet.
 *
 * Setup (see README.md for the full walkthrough):
 *  1. Create a Facebook App with the Webhooks + Pages products.
 *  2. Get a Page Access Token with leads_retrieval permission for the
 *     Page running the ads.
 *  3. Run `setMetaScriptProperties()` once (fill in the values first)
 *     from the Apps Script editor to store your secrets.
 *  4. Deploy this project as a web app (access: "Anyone") and register
 *     that URL, with `?token=YOUR_WEBHOOK_SHARED_SECRET` appended, as
 *     the webhook callback URL in the Facebook App's Webhooks config,
 *     subscribed to the `leadgen` field.
 */

// Maps Meta's lead form field names (the "key" Meta sends, not the
// question label) to this sheet's column names. Check the Logs
// (View > Logs after a test lead) to see the real field names Meta
// sends for your specific form and adjust this map to match.
const META_FIELD_MAP = {
  full_name: 'Name',
  first_name: 'Name',
  email: 'Email',
  phone_number: 'Phone',
  company_name: 'Company',
  job_title: 'Job Title',
  how_did_you_hear_about_us: 'Lead Source',
  notes: 'Notes'
};

const META_GRAPH_VERSION = 'v19.0';

/**
 * One-time setup helper. Fill in the three values below, run this
 * function once from the Apps Script editor (select it in the function
 * dropdown, click Run), then delete the values from source so they
 * aren't committed anywhere — they live in Script Properties from here.
 */
function setMetaScriptProperties() {
  PropertiesService.getScriptProperties().setProperties({
    META_VERIFY_TOKEN: 'REPLACE_WITH_A_RANDOM_STRING_YOU_MAKE_UP',
    META_PAGE_ACCESS_TOKEN: 'REPLACE_WITH_YOUR_PAGE_ACCESS_TOKEN',
    WEBHOOK_SHARED_SECRET: 'REPLACE_WITH_ANOTHER_RANDOM_STRING_YOU_MAKE_UP',
    DASHBOARD_ACCESS_KEY: 'REPLACE_WITH_A_THIRD_RANDOM_STRING_YOU_MAKE_UP'
  });
}

/** Handles Meta's GET verification handshake. */
function handleMetaVerification_(e) {
  const verifyToken = PropertiesService.getScriptProperties().getProperty('META_VERIFY_TOKEN');
  if (e.parameter['hub.verify_token'] === verifyToken) {
    return ContentService.createTextOutput(e.parameter['hub.challenge']);
  }
  return ContentService.createTextOutput('Verification token mismatch').setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Handles Meta's POST lead notifications.
 *
 * Apps Script web apps don't expose inbound HTTP headers, so this can't
 * check Meta's X-Hub-Signature-256 HMAC. As a substitute, the webhook
 * URL you register with Meta should include `?token=WEBHOOK_SHARED_SECRET`
 * as a query parameter, which Meta preserves on every call and which
 * this checks below.
 */
function doPost(e) {
  const expectedToken = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SHARED_SECRET');
  if (!expectedToken || e.parameter.token !== expectedToken) {
    return ContentService.createTextOutput('Forbidden').setMimeType(ContentService.MimeType.TEXT);
  }

  try {
    const body = JSON.parse(e.postData.contents);
    (body.entry || []).forEach((entry) => {
      (entry.changes || []).forEach((change) => {
        if (change.field === 'leadgen' && change.value && change.value.leadgen_id) {
          processMetaLead_(change.value.leadgen_id, change.value.created_time);
        }
      });
    });
  } catch (err) {
    console.error('Failed to process Meta webhook payload: ' + err);
  }

  // Meta requires a fast 200 response regardless of processing outcome.
  return ContentService.createTextOutput('EVENT_RECEIVED');
}

/** Fetches the full lead from the Graph API and appends it to the sheet. */
function processMetaLead_(leadgenId, createdTimeSeconds) {
  const token = PropertiesService.getScriptProperties().getProperty('META_PAGE_ACCESS_TOKEN');
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${leadgenId}?access_token=${encodeURIComponent(token)}`;
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(response.getContentText());

  if (data.error) {
    console.error('Graph API error fetching lead ' + leadgenId + ': ' + JSON.stringify(data.error));
    return;
  }

  const fieldValues = {};
  (data.field_data || []).forEach((field) => {
    const columnName = META_FIELD_MAP[field.name] || field.name;
    fieldValues[columnName] = (field.values && field.values[0]) || '';
  });

  const timestamp = createdTimeSeconds
    ? new Date(createdTimeSeconds * 1000)
    : new Date();

  appendLeadRow_(fieldValues, timestamp);
}

/** Appends one lead as a new row, aligned to whatever the sheet's current headers are. */
function appendLeadRow_(fieldValues, timestamp) {
  const sheet = getSheet_();
  const headers = ensureTrackingColumns_();

  const row = headers.map((header) => {
    if (header === 'Timestamp') return timestamp;
    if (header === 'Status') return STATUS_NEW;
    if (header === 'Contacted Date' || header === 'Contacted By') return '';
    return fieldValues[header] || '';
  });

  sheet.appendRow(row);
}
