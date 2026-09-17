/**
 * Lead Tracking Dashboard
 *
 * Bound to the Google Sheet that stores leads, whichever way they arrive
 * (a linked Google Form, or the Meta Lead Ads webhook in MetaWebhook.gs).
 * Either source writes into the same sheet; this script adds and manages
 * three extra "tracking" columns and serves a live dashboard on top of
 * that sheet, so the sheet is always the single source of truth.
 */

const SHEET_NAME = 'Form Responses 1'; // rename to 'Leads' (or your sheet's tab name) if you're not using a Google Form
const LEAD_COLUMNS = ['Timestamp', 'Name', 'Email', 'Phone', 'Company', 'Job Title', 'Lead Source', 'Job Ad', 'Notes', 'CV Link'];
const TRACKING_COLUMNS = ['Status', 'Contacted Date', 'Contacted By'];
const STATUS_NEW = 'New';
const STATUS_CONTACTED = 'Contacted';

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    // No Google Form auto-created this sheet (e.g. Meta-only setup) — create it.
    sheet = ss.insertSheet(SHEET_NAME);
  }
  return sheet;
}

/**
 * Ensures the sheet has a header row (lead columns + tracking columns)
 * and that any tracking columns missing from an existing header (e.g.
 * one Google Forms created) get appended. Safe to run repeatedly.
 */
function ensureTrackingColumns_() {
  const sheet = getSheet_();
  const lastCol = sheet.getLastColumn();

  if (lastCol === 0) {
    const allColumns = LEAD_COLUMNS.concat(TRACKING_COLUMNS);
    sheet.getRange(1, 1, 1, allColumns.length).setValues([allColumns]);
    return allColumns;
  }

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  TRACKING_COLUMNS.forEach((colName) => {
    if (headers.indexOf(colName) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(colName);
      headers.push(colName);
    }
  });

  return headers;
}

function getColumnIndex_(headers, name) {
  const idx = headers.indexOf(name);
  if (idx === -1) throw new Error(`Column "${name}" not found.`);
  return idx + 1; // Sheets ranges are 1-indexed
}

/**
 * Installable trigger: run once from the Apps Script editor
 * (Triggers > Add Trigger > On form submit) so every new lead
 * automatically gets a "New" status the moment it lands in the sheet.
 */
function onFormSubmit(e) {
  const sheet = getSheet_();
  const headers = ensureTrackingColumns_();
  const statusCol = getColumnIndex_(headers, 'Status');
  const row = e && e.range ? e.range.getRow() : sheet.getLastRow();
  const statusCell = sheet.getRange(row, statusCol);
  if (!statusCell.getValue()) {
    statusCell.setValue(STATUS_NEW);
  }
}

/**
 * Run manually once after setup to backfill tracking columns/status
 * for any rows submitted before the trigger was wired up.
 */
function backfillExistingRows() {
  const sheet = getSheet_();
  const headers = ensureTrackingColumns_();
  const statusCol = getColumnIndex_(headers, 'Status');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const statusRange = sheet.getRange(2, statusCol, lastRow - 1, 1);
  const values = statusRange.getValues();
  const updated = values.map((row) => [row[0] ? row[0] : STATUS_NEW]);
  statusRange.setValues(updated);
}

/**
 * Serves the dashboard as a web app, OR responds to Meta's webhook
 * verification handshake (a GET request carrying hub.mode/hub.challenge)
 * if MetaWebhook.gs's verification handler is present. Deploy via
 * Deploy > New deployment > Web app.
 *
 * Because the deployment must allow anonymous access (Meta calls it
 * with no Google auth), the dashboard itself is gated behind a
 * DASHBOARD_ACCESS_KEY script property so the same public URL doesn't
 * expose lead data to anyone who finds the link. Set it once via
 * PropertiesService.getScriptProperties().setProperty('DASHBOARD_ACCESS_KEY', '...')
 * and share the dashboard as .../exec?key=YOUR_KEY.
 */
function doGet(e) {
  if (e && e.parameter && e.parameter['hub.mode'] === 'subscribe' && typeof handleMetaVerification_ === 'function') {
    return handleMetaVerification_(e);
  }

  const requiredKey = PropertiesService.getScriptProperties().getProperty('DASHBOARD_ACCESS_KEY');
  if (requiredKey && (!e || e.parameter.key !== requiredKey)) {
    return HtmlService.createHtmlOutput('<p>Access denied.</p>');
  }

  return HtmlService.createHtmlOutputFromFile('Dashboard')
    .setTitle('Lead Tracking Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Returns every lead row as a plain object, keyed by header name,
 * plus its 1-indexed sheet row so the dashboard can reference it
 * when marking a lead contacted.
 */
function getLeads() {
  const sheet = getSheet_();
  const headers = ensureTrackingColumns_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  return data.map((row, i) => {
    const lead = { rowNumber: i + 2 };
    headers.forEach((header, colIdx) => {
      const value = row[colIdx];
      lead[header] = value instanceof Date ? value.toLocaleString() : value;
    });
    if (!lead['Status']) lead['Status'] = STATUS_NEW;
    return lead;
  });
}

/**
 * Marks a lead as contacted (or reverts it to New), updating the
 * sheet directly. Because the dashboard always reads from the sheet,
 * this keeps both in sync automatically.
 */
function setLeadStatus(rowNumber, status, contactedBy) {
  const sheet = getSheet_();
  const headers = ensureTrackingColumns_();
  const statusCol = getColumnIndex_(headers, 'Status');
  const dateCol = getColumnIndex_(headers, 'Contacted Date');
  const byCol = getColumnIndex_(headers, 'Contacted By');

  sheet.getRange(rowNumber, statusCol).setValue(status);

  if (status === STATUS_CONTACTED) {
    sheet.getRange(rowNumber, dateCol).setValue(new Date());
    sheet.getRange(rowNumber, byCol).setValue(contactedBy || Session.getActiveUser().getEmail() || '');
  } else {
    sheet.getRange(rowNumber, dateCol).setValue('');
    sheet.getRange(rowNumber, byCol).setValue('');
  }

  return getLeads();
}

function markContacted(rowNumber, contactedBy) {
  return setLeadStatus(rowNumber, STATUS_CONTACTED, contactedBy);
}

function markNew(rowNumber) {
  return setLeadStatus(rowNumber, STATUS_NEW, '');
}

/** Adds a manual "Lead Dashboard" menu so setup steps are easy to (re)run. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Lead Dashboard')
    .addItem('Set up tracking columns', 'ensureTrackingColumns_')
    .addItem('Backfill existing rows', 'backfillExistingRows')
    .addToUi();
}
