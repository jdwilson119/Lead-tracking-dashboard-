/**
 * Lead Tracking Dashboard
 *
 * Bound to the Google Sheet that collects Google Form responses.
 * The form writes the raw columns (timestamp, name, email, ...); this
 * script adds and manages three extra "tracking" columns and serves a
 * live dashboard on top of the same sheet, so the sheet is always the
 * single source of truth.
 */

const SHEET_NAME = 'Form Responses 1'; // default name Google Forms gives its response sheet
const TRACKING_COLUMNS = ['Status', 'Contacted Date', 'Contacted By'];
const STATUS_NEW = 'New';
const STATUS_CONTACTED = 'Contacted';

function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found. Update SHEET_NAME in Code.gs to match your form's response sheet.`);
  }
  return sheet;
}

/**
 * Ensures the tracking columns exist at the end of the header row.
 * Safe to run repeatedly (e.g. from the onOpen menu) since it only
 * appends columns that are missing.
 */
function ensureTrackingColumns_() {
  const sheet = getSheet_();
  const lastCol = sheet.getLastColumn();
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

/** Serves the dashboard as a web app. Deploy via Deploy > New deployment > Web app. */
function doGet() {
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
