/**
 * Semester Feedback — Google Sheet webhook (wide format)
 * ======================================================
 * Two tabs, both one-row-per-student:
 *
 * "Students" — campaign reach roster (paste UID/Email/Name from DB):
 *    UID | Email | Name | Campaign | Reached (Yes/No)
 *
 * "Feedback" — answers, wide format:
 *    UID | Email | Name | Q1 Rating | Q1 Review | ... | Q6 Rating | Q6 Review
 *        | Final Rating (= average of given ratings) | Flag (NR / 0 / 0.5 / 1)
 *
 * Flag state machine (forward-only): NR -> 0 -> 0.5 -> 1
 *    NR  = campaign never reached the student (roster default)
 *    0   = saw the form, didn't touch it
 *    0.5 = answered some questions, didn't finish
 *    1   = completed all questions
 *
 * BEFORE LAUNCH:
 * 1. Paste the roster (UID, Email, Name) into "Students" columns A-C.
 * 2. Run seedRoster() once — fills Reached=No there, and copies every
 *    student into "Feedback" with Flag=NR.
 *
 * SETUP (one time):
 * 1. Extensions > Apps Script — paste this file over Code.gs. SAVE.
 * 2. Run setupSheet() once (creates both tabs + dropdowns).
 * 3. Deploy as Web app (Execute as: Me, Access: Anyone).
 *
 * !! AFTER ANY CODE CHANGE: Deploy > Manage deployments > pencil icon >
 *    Version: New version > Deploy. (This keeps the SAME /exec URL.
 *    Creating a brand-new deployment instead would CHANGE the URL and
 *    break the campaign config.)
 */

var STUDENTS = "Students";
var FEEDBACK = "Feedback";
var NUM_QUESTIONS = 6;

var FLAGS = ["NR", "0", "0.5", "1"];
var FLAG_RANK = { "NR": 0, "0": 1, "0.5": 2, "1": 3 };

var STUDENTS_HEADERS = ["UID", "Email", "Name", "Campaign", "Reached"];
// Feedback columns: UID, Email, Name, then per question rating+review,
// then Final Rating and Flag.
function feedbackHeaders() {
  var h = ["UID", "Email", "Name"];
  for (var q = 1; q <= NUM_QUESTIONS; q++) h.push("Q" + q + " Rating", "Q" + q + " Review");
  h.push("Final Rating", "Flag");
  return h;
}
// 1-based column positions in "Feedback"
function colQRating(q) { return 3 + (q - 1) * 2 + 1; }   // Q1 Rating = col 4
function colQReview(q) { return 3 + (q - 1) * 2 + 2; }   // Q1 Review = col 5
var COL_FINAL = 3 + NUM_QUESTIONS * 2 + 1;               // col 16
var COL_FLAG = COL_FINAL + 1;                            // col 17

/* ------------------------------------------------------------------ */
/* Webhook                                                             */
/* ------------------------------------------------------------------ */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    var data = JSON.parse(e.postData.contents);
    var type = String(data.type || "");
    var uid = String(data.user_id || "");
    if (!uid) return jsonOut({ ok: false, error: "missing user_id" });

    if (type === "shown") {
      markReached(uid, data.term);
      upgradeFlag(uid, "0");
    } else if (type === "started") {
      markReached(uid, data.term);
      upgradeFlag(uid, "0");
    } else if (type === "answer") {
      writeAnswer(uid, data);
      upgradeFlag(uid, data.is_final ? "1" : "0.5");
    }

    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Open the /exec URL in a browser to confirm the deployment is live. */
function doGet() {
  return ContentService.createTextOutput("OK - feedback webhook is live (wide format)");
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/* "Students" tab — campaign reach                                     */
/* ------------------------------------------------------------------ */

function markReached(uid, campaign) {
  var sheet = getSheet(STUDENTS, STUDENTS_HEADERS);
  var row = findRowByUid(sheet, uid);
  if (row === -1) {
    sheet.appendRow([uid, "", "", campaign || "", "Yes"]);
    return;
  }
  sheet.getRange(row, 5).setValue("Yes");
  if (campaign) sheet.getRange(row, 4).setValue(campaign);
}

/* ------------------------------------------------------------------ */
/* "Feedback" tab — wide answers + flag                                */
/* ------------------------------------------------------------------ */

function writeAnswer(uid, data) {
  var sheet = getSheet(FEEDBACK, feedbackHeaders());
  var row = ensureFeedbackRow(sheet, uid);

  var q = Number(data.question_id);
  if (q >= 1 && q <= NUM_QUESTIONS) {
    sheet.getRange(row, colQRating(q)).setValue(data.rating != null ? data.rating : "");
    sheet.getRange(row, colQReview(q)).setValue(
      Array.isArray(data.review) ? data.review.join(", ") : (data.review || "")
    );
  }

  // Final Rating = average of all ratings given so far (1 decimal)
  var ratings = [];
  for (var i = 1; i <= NUM_QUESTIONS; i++) {
    var v = Number(sheet.getRange(row, colQRating(i)).getValue());
    if (v >= 1) ratings.push(v);
  }
  if (ratings.length) {
    var avg = ratings.reduce(function (a, b) { return a + b; }, 0) / ratings.length;
    sheet.getRange(row, COL_FINAL).setValue(Math.round(avg * 10) / 10);
  }
}

function upgradeFlag(uid, newFlag) {
  var sheet = getSheet(FEEDBACK, feedbackHeaders());
  var row = ensureFeedbackRow(sheet, uid);
  var current = String(sheet.getRange(row, COL_FLAG).getValue() || "NR");
  // forward-only: a late "shown" ping can never downgrade 0.5 or 1
  if ((FLAG_RANK[newFlag] || 0) > (FLAG_RANK[current] || 0)) {
    sheet.getRange(row, COL_FLAG).setValue(newFlag);
  }
}

/** Find the student's Feedback row; create it (copying Email/Name from
 *  Students if present) when missing. Returns the 1-based row number. */
function ensureFeedbackRow(sheet, uid) {
  var row = findRowByUid(sheet, uid);
  if (row !== -1) return row;

  var email = "", name = "";
  var students = getSheet(STUDENTS, STUDENTS_HEADERS);
  var sRow = findRowByUid(students, uid);
  if (sRow !== -1) {
    email = students.getRange(sRow, 2).getValue();
    name = students.getRange(sRow, 3).getValue();
  }

  var newRow = [uid, email, name];
  for (var i = 0; i < NUM_QUESTIONS * 2; i++) newRow.push("");
  newRow.push("", "NR");
  sheet.appendRow(newRow);
  return sheet.getLastRow();
}

function findRowByUid(sheet, uid) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var uids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < uids.length; i++) {
    if (String(uids[i][0]) === uid) return i + 2;
  }
  return -1;
}

/* ------------------------------------------------------------------ */
/* Setup helpers                                                       */
/* ------------------------------------------------------------------ */

/** Run once after pasting this script: creates both tabs + dropdowns. */
function setupSheet() {
  var students = getSheet(STUDENTS, STUDENTS_HEADERS);
  addDropdown(students, 5, ["Yes", "No"]);          // Reached
  var feedback = getSheet(FEEDBACK, feedbackHeaders());
  addDropdown(feedback, COL_FLAG, FLAGS);           // Flag
}

/**
 * Run once AFTER pasting the roster (UID, Email, Name) into the
 * Students tab columns A-C:
 *  - sets Reached = "No" where empty
 *  - copies every student into Feedback with Flag = "NR" (if missing)
 */
function seedRoster() {
  setupSheet();
  var students = getSheet(STUDENTS, STUDENTS_HEADERS);
  var feedback = getSheet(FEEDBACK, feedbackHeaders());
  var last = students.getLastRow();
  if (last < 2) return;

  var rows = students.getRange(2, 1, last - 1, 5).getValues();
  for (var i = 0; i < rows.length; i++) {
    var uid = String(rows[i][0]);
    if (!uid) continue;
    if (!rows[i][4]) students.getRange(i + 2, 5).setValue("No");
    if (findRowByUid(feedback, uid) === -1) {
      var newRow = [uid, rows[i][1], rows[i][2]];
      for (var j = 0; j < NUM_QUESTIONS * 2; j++) newRow.push("");
      newRow.push("", "NR");
      feedback.appendRow(newRow);
    }
  }
}

function getSheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  return sheet;
}

function addDropdown(sheet, col, values) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(rule);
}
