/**
 * Instagram DM outreach tracking.
 *
 * Bound to the same spreadsheet as the leads dashboard, in two more
 * tabs: `IG Contacts` (one row per person who has DM'd you, with an
 * outreach Status) and `IG Messages` (a running log of every inbound
 * and outbound message, used for the live message feed and the
 * received/delivered/read stats).
 *
 * Instagram does not expose a follower list or "new follower" event
 * through its API for any app — DMs are tracked individually via the
 * Messaging API, but follower growth can only be tracked as an
 * aggregate daily count (see the follower-log section below), never
 * as individual names.
 *
 * Setup: see the "Instagram DM Outreach" section in README.md. Reuses
 * the same Facebook App / Page Access Token as MetaWebhook.gs, plus
 * the `instagram_manage_messages` permission and a webhook subscription
 * to the `messages`, `message_deliveries`, and `message_reads` fields
 * on the `instagram` object (not `page`).
 */

const IG_CONTACTS_SHEET = 'IG Contacts';
const IG_MESSAGES_SHEET = 'IG Messages';
const IG_FOLLOWER_LOG_SHEET = 'IG Follower Log';
const IG_CONTACT_COLUMNS = ['IGSID', 'Username', 'Name', 'First Contact', 'Last Message', 'Last Activity', 'Status', 'Contacted Date', 'Contacted By'];
const IG_MESSAGE_COLUMNS = ['Timestamp', 'IGSID', 'Username', 'Direction', 'Message', 'Message Status'];
const IG_FOLLOWER_LOG_COLUMNS = ['Date', 'Follower Count'];
const IG_STATUS_NEW = 'New';
const IG_STATUS_CONTACTED = 'Contacted';

function getOrCreateSheetWithHeaders_(name, columns) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
  }
  return sheet;
}

function ensureInstagramSheets_() {
  return {
    contacts: getOrCreateSheetWithHeaders_(IG_CONTACTS_SHEET, IG_CONTACT_COLUMNS),
    messages: getOrCreateSheetWithHeaders_(IG_MESSAGES_SHEET, IG_MESSAGE_COLUMNS)
  };
}

/** Fetches an Instagram-scoped user's name/username via the Graph API. */
function fetchInstagramProfile_(igsid) {
  const token = PropertiesService.getScriptProperties().getProperty('META_PAGE_ACCESS_TOKEN');
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${igsid}?fields=name,username&access_token=${encodeURIComponent(token)}`;
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(response.getContentText());
  if (data.error) {
    console.error('Graph API error fetching IG profile ' + igsid + ': ' + JSON.stringify(data.error));
    return { name: '', username: '' };
  }
  return { name: data.name || '', username: data.username || '' };
}

function findContactRow_(sheet, igsid) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(igsid)) return i + 2;
  }
  return -1;
}

/** Returns the contact's row number, creating the contact (with a Graph API profile lookup) if new. */
function getOrCreateContact_(igsid) {
  const sheets = ensureInstagramSheets_();
  const row = findContactRow_(sheets.contacts, igsid);
  if (row !== -1) return row;

  const profile = fetchInstagramProfile_(igsid);
  const now = new Date();
  sheets.contacts.appendRow([
    igsid, profile.username, profile.name, now, '', now, IG_STATUS_NEW, '', ''
  ]);
  return sheets.contacts.getLastRow();
}

function touchContactActivity_(row, lastMessagePreview) {
  const sheets = ensureInstagramSheets_();
  sheets.contacts.getRange(row, IG_CONTACT_COLUMNS.indexOf('Last Message') + 1).setValue(lastMessagePreview);
  sheets.contacts.getRange(row, IG_CONTACT_COLUMNS.indexOf('Last Activity') + 1).setValue(new Date());
}

function appendMessageLog_(igsid, username, direction, text, status, timestamp) {
  const sheets = ensureInstagramSheets_();
  sheets.messages.appendRow([timestamp || new Date(), igsid, username, direction, text || '', status]);
}

/**
 * Processes one Instagram Messaging webhook event (one entry of the
 * `messaging` array). Handles inbound messages, our own outbound
 * message echoes, delivery confirmations, and read receipts.
 */
function processInstagramMessagingEvent_(event) {
  if (!event) return;

  if (event.message && !event.message.is_deleted) {
    const igsid = event.message.is_echo ? event.recipient.id : event.sender.id;
    const row = getOrCreateContact_(igsid);
    const username = ensureInstagramSheets_().contacts.getRange(row, IG_CONTACT_COLUMNS.indexOf('Username') + 1).getValue();
    const text = event.message.text || '(attachment)';
    const timestamp = event.timestamp ? new Date(event.timestamp) : new Date();

    if (event.message.is_echo) {
      // A message the connected account itself sent (e.g. from the Instagram app, or triggered elsewhere).
      appendMessageLog_(igsid, username, 'Sent', text, 'Sent', timestamp);
    } else {
      appendMessageLog_(igsid, username, 'Received', text, 'Received', timestamp);
      touchContactActivity_(row, text);
    }
    return;
  }

  if (event.delivery) {
    updateMessageStatusByWatermark_(event.recipient.id, event.delivery.watermark, 'Sent', 'Delivered');
    return;
  }

  if (event.read) {
    updateMessageStatusByWatermark_(event.sender.id, event.read.watermark, 'Delivered', 'Read');
  }
}

/**
 * Marks our own "Sent" (or "Delivered") messages to a given contact,
 * up to the delivery/read watermark timestamp, as the next status.
 * Instagram's delivery/read events report a watermark (a timestamp
 * cutoff), not individual message IDs, so this updates every earlier
 * matching message rather than a single row.
 */
function updateMessageStatusByWatermark_(igsid, watermarkMs, fromStatus, toStatus) {
  const sheets = ensureInstagramSheets_();
  const lastRow = sheets.messages.getLastRow();
  if (lastRow < 2) return;

  const range = sheets.messages.getRange(2, 1, lastRow - 1, IG_MESSAGE_COLUMNS.length);
  const values = range.getValues();
  let changed = false;

  values.forEach((row, i) => {
    const [timestamp, rowIgsid, , direction, , status] = row;
    const isMatch = String(rowIgsid) === String(igsid) &&
      direction === 'Sent' &&
      status === fromStatus &&
      new Date(timestamp).getTime() <= Number(watermarkMs);
    if (isMatch) {
      values[i][IG_MESSAGE_COLUMNS.indexOf('Message Status')] = toStatus;
      changed = true;
    }
  });

  if (changed) range.setValues(values);
}

/**
 * Returns everything the dashboard's Instagram tab needs: the contact
 * list, the most recent messages, and received/delivered/read-with-
 * no-reply counts.
 */
function getInstagramData() {
  const sheets = ensureInstagramSheets_();

  const contactsLastRow = sheets.contacts.getLastRow();
  const contacts = contactsLastRow < 2 ? [] : sheets.contacts
    .getRange(2, 1, contactsLastRow - 1, IG_CONTACT_COLUMNS.length)
    .getValues()
    .map((row, i) => {
      const contact = { rowNumber: i + 2 };
      IG_CONTACT_COLUMNS.forEach((header, colIdx) => {
        const value = row[colIdx];
        contact[header] = value instanceof Date ? value.toLocaleString() : value;
      });
      return contact;
    })
    .sort((a, b) => new Date(b['Last Activity']) - new Date(a['Last Activity']));

  const messagesLastRow = sheets.messages.getLastRow();
  const allMessages = messagesLastRow < 2 ? [] : sheets.messages
    .getRange(2, 1, messagesLastRow - 1, IG_MESSAGE_COLUMNS.length)
    .getValues()
    .map((row) => {
      const msg = {};
      IG_MESSAGE_COLUMNS.forEach((header, colIdx) => {
        const value = row[colIdx];
        msg[header] = value instanceof Date ? value.toLocaleString() : value;
      });
      return msg;
    });

  const recentMessages = allMessages.slice(-50).reverse();

  const received = allMessages.filter((m) => m['Direction'] === 'Received').length;
  const delivered = allMessages.filter((m) => m['Direction'] === 'Sent' && (m['Message Status'] === 'Delivered' || m['Message Status'] === 'Read')).length;
  const leftOnRead = allMessages.filter((m) => m['Direction'] === 'Sent' && m['Message Status'] === 'Read').length;

  return {
    contacts,
    messages: recentMessages,
    stats: { received, delivered, leftOnRead },
    followerGrowth: getFollowerGrowth_()
  };
}

function setInstagramContactStatus_(rowNumber, status, contactedBy) {
  const sheets = ensureInstagramSheets_();
  const statusCol = IG_CONTACT_COLUMNS.indexOf('Status') + 1;
  const dateCol = IG_CONTACT_COLUMNS.indexOf('Contacted Date') + 1;
  const byCol = IG_CONTACT_COLUMNS.indexOf('Contacted By') + 1;

  sheets.contacts.getRange(rowNumber, statusCol).setValue(status);
  if (status === IG_STATUS_CONTACTED) {
    sheets.contacts.getRange(rowNumber, dateCol).setValue(new Date());
    sheets.contacts.getRange(rowNumber, byCol).setValue(contactedBy || Session.getActiveUser().getEmail() || '');
  } else {
    sheets.contacts.getRange(rowNumber, dateCol).setValue('');
    sheets.contacts.getRange(rowNumber, byCol).setValue('');
  }
  return getInstagramData();
}

function markInstagramContacted(rowNumber, contactedBy) {
  return setInstagramContactStatus_(rowNumber, IG_STATUS_CONTACTED, contactedBy);
}

function markInstagramNew(rowNumber) {
  return setInstagramContactStatus_(rowNumber, IG_STATUS_NEW, '');
}

/**
 * Follower growth (aggregate count only — see the file header for why
 * individual followers can't be listed).
 *
 * Instagram's Insights API reports `follower_count` once per day, not
 * live, so this logs one snapshot per day via a daily time-driven
 * trigger and computes 24h/7-day deltas from that log — it will not
 * tick up during the day the way the DM feed does.
 */

/** Fetches today's total follower count from the Instagram Insights API. */
function fetchFollowerCount_() {
  const token = PropertiesService.getScriptProperties().getProperty('META_PAGE_ACCESS_TOKEN');
  const igUserId = PropertiesService.getScriptProperties().getProperty('IG_USER_ID');
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${igUserId}/insights?metric=follower_count&period=day&access_token=${encodeURIComponent(token)}`;
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(response.getContentText());

  if (data.error) {
    console.error('Graph API error fetching follower_count: ' + JSON.stringify(data.error));
    return null;
  }

  const values = data.data && data.data[0] && data.data[0].values;
  if (!values || !values.length) return null;
  return values[values.length - 1].value;
}

/**
 * Installable trigger: run once a day (Triggers > Add Trigger >
 * logDailyFollowerCount_ > Time-driven > Day timer) to append today's
 * follower count. Safe to run more than once a day — it overwrites
 * today's row instead of duplicating it.
 */
function logDailyFollowerCount_() {
  const count = fetchFollowerCount_();
  if (count == null) return;

  const sheet = getOrCreateSheetWithHeaders_(IG_FOLLOWER_LOG_SHEET, IG_FOLLOWER_LOG_COLUMNS);
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    const dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < dates.length; i++) {
      const rowDate = Utilities.formatDate(new Date(dates[i][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (rowDate === today) {
        sheet.getRange(i + 2, 2).setValue(count);
        return;
      }
    }
  }

  sheet.appendRow([new Date(), count]);
}

/** Computes 24h/7-day follower deltas from the logged daily snapshots. */
function getFollowerGrowth_() {
  const sheet = getOrCreateSheetWithHeaders_(IG_FOLLOWER_LOG_SHEET, IG_FOLLOWER_LOG_COLUMNS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { latest: null, delta24h: null, delta7d: null };

  const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues()
    .map(([date, count]) => ({ date: new Date(date), count: Number(count) }))
    .sort((a, b) => a.date - b.date);

  const latest = rows[rows.length - 1];
  const findNearestBefore = (msAgo) => {
    const cutoff = latest.date.getTime() - msAgo;
    let candidate = null;
    for (const row of rows) {
      if (row.date.getTime() <= cutoff) candidate = row;
    }
    return candidate;
  };

  const oneDayAgo = findNearestBefore(24 * 60 * 60 * 1000);
  const sevenDaysAgo = findNearestBefore(7 * 24 * 60 * 60 * 1000);

  return {
    latest: latest.count,
    delta24h: oneDayAgo ? latest.count - oneDayAgo.count : null,
    delta7d: sevenDaysAgo ? latest.count - sevenDaysAgo.count : null
  };
}
