/**
 * ═══════════════════════════════════════════════════════════════════════════
 *   PREMIER CATERERS — Send approved follow-ups (events@ Apps Script)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The follow-up buttons now write straight to Firebase (no Apps Script web app
 * involved — that's what removed the Google login wall). When someone approves
 * a follow-up, the landing page sets the reminder's status to 'approved'.
 *
 * This file:
 *   1. pcCreateSecondFollowupReminders_() — every minute, checks inquiries
 *      sitting in "Followed Up #1" for 6+ days and queues a second follow-up
 *      reminder for them (once per inquiry), going through the same
 *      approval-first flow as the original follow-up.
 *   2. pcSendApprovedFollowups_() — finds every 'approved' reminder, sends
 *      the client email (honoring test mode + send-as exactly like before),
 *      marks it 'sent', and — for a real (non-test) send — advances the
 *      pipeline card to Followed Up #1 or Followed Up #2 depending on which
 *      round this was.
 *
 * ── SETUP (no deployment needed — timers run the latest saved code) ─
 *
 *   1. Paste this whole file in (replaces the old FollowupApi.gs contents).
 *
 *   2. In Followups.gs, `function processFollowupReminders()` should already
 *      call pcSendApprovedFollowups_() each minute (added previously). No
 *      further change needed there — this file's new round-2 logic runs
 *      automatically as part of that same call.
 *
 *   Then just SAVE (Ctrl+S). No new deployment is required — the time trigger
 *   always runs the latest saved code.
 *
 * Oct 6 2026 fix: the second reminder is now created at most ONCE per client.
 * It used to rely only on a "followup2ReminderCreated" mark on the client's
 * record; when that mark didn't stick, a new reminder was made every run.
 * Now it also looks for an existing round-2 reminder before making one, and
 * gives the reminder a fixed name (r2_<client id>) so the database itself
 * refuses a second copy. Run pcCleanUpDuplicateSecondFollowups once to
 * cancel the duplicates that piled up.
 *
 * Reuses helpers already in your Followups.gs: pcFsFetch_, pcFsDecodeDoc_,
 * pcFsEncodeFields_, pcFsUpdateReminder_, pcFsReadSettingsDoc_,
 * pcFsLogActivity_, pcSendClientFollowup_, pcFsGetInquiry_, pcFsUpdateInquiry_,
 * and the PC_* constants.
 * ═══════════════════════════════════════════════════════════════════════════
 */

var PC_SECOND_FOLLOWUP_DELAY_MS = 6 * 24 * 60 * 60 * 1000;   // 6 days

// Query reminders by an exact status value (e.g. 'approved').
function pcFsQueryRemindersByStatus_(status) {
  var url = 'https://firestore.googleapis.com/v1/projects/' + PC_FIREBASE_PROJECT_ID +
            '/databases/(default)/documents:runQuery';
  var body = {
    structuredQuery: {
      from: [{ collectionId: PC_REMINDERS_COLLECTION }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'status' },
          op: 'EQUAL',
          value: { stringValue: String(status) }
        }
      }
    }
  };
  var resp = pcFsFetch_(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var rows = [];
  try { rows = JSON.parse(resp.getContentText() || '[]'); } catch (e) { rows = []; }
  var out = [];
  rows.forEach(function (row) {
    if (!row.document) return;
    out.push(pcFsDecodeDoc_(row.document));
  });
  return out;
}

// Query inquiries by an exact stage value.
function pcFsQueryInquiriesByStage_(stage) {
  var url = 'https://firestore.googleapis.com/v1/projects/' + PC_FIREBASE_PROJECT_ID +
            '/databases/(default)/documents:runQuery';
  var body = {
    structuredQuery: {
      from: [{ collectionId: 'inquiries' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'stage' },
          op: 'EQUAL',
          value: { stringValue: String(stage) }
        }
      }
    }
  };
  var resp = pcFsFetch_(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var rows = [];
  try { rows = JSON.parse(resp.getContentText() || '[]'); } catch (e) { rows = []; }
  var out = [];
  rows.forEach(function (row) {
    if (!row.document) return;
    out.push(pcFsDecodeDoc_(row.document));
  });
  return out;
}

// Create a new followupReminders document (auto-generated id).
function pcFsCreateReminder_(fields) {
  var encoded = pcFsEncodeFields_(fields);
  var url = 'https://firestore.googleapis.com/v1/projects/' + PC_FIREBASE_PROJECT_ID +
            '/databases/(default)/documents/' + PC_REMINDERS_COLLECTION;
  pcFsFetch_(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ fields: encoded }),
    muteHttpExceptions: true
  });
}

// Every reminder (any status) for one client.
function pcFsQueryRemindersByInquiry_(inquiryId) {
  var url = 'https://firestore.googleapis.com/v1/projects/' + PC_FIREBASE_PROJECT_ID +
            '/databases/(default)/documents:runQuery';
  var body = {
    structuredQuery: {
      from: [{ collectionId: PC_REMINDERS_COLLECTION }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'inquiryId' },
          op: 'EQUAL',
          value: { stringValue: String(inquiryId) }
        }
      }
    }
  };
  var resp = pcFsFetch_(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() >= 300) throw new Error('Could not check existing reminders (' + resp.getResponseCode() + ')');
  var rows = [];
  try { rows = JSON.parse(resp.getContentText() || '[]'); } catch (e) { throw new Error('Could not read existing reminders'); }
  var out = [];
  rows.forEach(function (row) {
    if (!row.document) return;
    out.push(pcFsDecodeDoc_(row.document));
  });
  return out;
}

// Create a reminder with a fixed id. Returns false (and creates nothing) if a
// reminder with that id already exists — the database guarantees one copy.
function pcFsCreateReminderWithId_(docId, fields) {
  var encoded = pcFsEncodeFields_(fields);
  var url = 'https://firestore.googleapis.com/v1/projects/' + PC_FIREBASE_PROJECT_ID +
            '/databases/(default)/documents/' + PC_REMINDERS_COLLECTION +
            '?documentId=' + encodeURIComponent(docId);
  var resp = pcFsFetch_(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ fields: encoded }),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  if (code === 409) return false;                                   // already exists
  if (code >= 300) throw new Error('Could not create reminder (' + code + '): ' + resp.getContentText().slice(0, 200));
  return true;
}

// Every inquiry sitting in Followed Up #1 for 6+ days (and not yet flagged)
// gets a second follow-up reminder queued — same approval-first flow as the
// first one, just addressed as a 2nd follow-up. Runs every minute; cheap
// no-op when there's nothing due.
function pcCreateSecondFollowupReminders_() {
  var candidates = pcFsQueryInquiriesByStage_('followup_1');
  if (!candidates.length) return { ok: true, created: 0 };

  var settings = pcFsReadSettingsDoc_() || {};
  if (settings.followupsPaused === true) return { ok: true, skipped: 'paused' };

  var salespersonEmails = settings.salespersonEmails || {};
  var now = Date.now();
  var created = 0;

  candidates.forEach(function (inq) {
    try {
      if (inq.followup2ReminderCreated === true) return;                     // already queued
      var sentAt = inq.followup1SentAt || 0;
      if (!sentAt || (now - sentAt) < PC_SECOND_FOLLOWUP_DELAY_MS) return;    // not due yet

      // Already has a 2nd reminder (any status — pending, sent, skipped,
      // cancelled)? Then never make another, and re-set the mark.
      var existing = pcFsQueryRemindersByInquiry_(inq.id).filter(function (r) { return Number(r.round) === 2; });
      if (existing.length) {
        try { pcFsUpdateInquiry_(inq.id, { followup2ReminderCreated: true }); } catch (e) {}
        return;
      }

      var sp = inq.salesperson || '';
      var spEmail = sp ? (salespersonEmails[sp] || salespersonEmails[sp.toLowerCase()] || '') : '';
      var clientName = ((inq.firstName || '') + ' ' + (inq.lastName || '')).trim() || inq.organization || 'Client';
      var eventName = inq.eventName || (inq.eventType || 'Event');
      var eventDate = inq.eventDate || '';
      var eventDateOn = eventDate ? (' on ' + eventDate) : '';

      var subject = 'Following up again' + (eventName ? (' on your ' + eventName) : '');
      var body =
        'Hi ' + clientName + ',\n\n' +
        'Wanted to check in once more about your upcoming ' + eventName + eventDateOn + '. ' +
        'We haven\u2019t heard back yet and want to make sure everything\u2019s in order \u2014 ' +
        'happy to answer any questions or make adjustments to the menu or estimate whenever works for you.\n\n' +
        'Looking forward to hearing from you!';

      var record = {
        inquiryId: inq.id,
        round: 2,
        salesperson: sp,
        salespersonEmail: spEmail,
        status: 'pending',
        createdAt: now,
        sendAt: now,
        lastNotifiedAt: 0,
        nudgeCount: 0,
        clientEmail: inq.email || '',
        clientName: clientName,
        eventName: eventName,
        eventDate: eventDate,
        subject: subject,
        body: body,
        token: Utilities.getUuid()
      };

      if (!pcFsCreateReminderWithId_('r2_' + inq.id, record)) return;     // a copy already exists
      try { pcFsUpdateInquiry_(inq.id, { followup2ReminderCreated: true }); } catch (e) {}
      pcFsLogActivity_(inq.id, 'followup', 'Second follow-up reminder queued for ' + (sp || 'unassigned') + ' (6 days after 1st)', {});
      created++;
    } catch (err) {
      console.error('pcCreateSecondFollowupReminders_ failed for ' + inq.id + ':', err);
    }
  });

  return { ok: true, created: created };
}

// Send every reminder that a salesperson approved from the follow-up page.
function pcSendApprovedFollowups_() {
  try { pcCreateSecondFollowupReminders_(); } catch (err) { console.error('pcCreateSecondFollowupReminders_ top-level error:', err); }

  var approved = pcFsQueryRemindersByStatus_('approved');
  if (!approved.length) return { ok: true, sent: 0 };

  var settings = pcFsReadSettingsDoc_() || {};
  var testMode = settings.followupsTestMode !== false;              // defaults TRUE
  var testEmail = (settings.followupsTestEmail || '').trim();
  var delegationReady = settings.delegationReady || {};
  var salespersonEmails = settings.salespersonEmails || {};
  var now = Date.now();
  var sent = 0;

  approved.forEach(function (rem) {
    try {
      var useSendAs = (!testMode && delegationReady[rem.salesperson] === true)
        ? (salespersonEmails[rem.salesperson] || '') : '';
      var recipient = testMode ? (testEmail || rem.clientEmail) : rem.clientEmail;

      if (!recipient) {
        pcFsUpdateReminder_(rem.id, { status: 'send_failed', sendError: 'no recipient email', updatedAt: now });
        pcFsLogActivity_(rem.inquiryId, 'followup', 'Follow-up approved but no recipient email on file', { reminderId: rem.id });
        return;
      }

      pcSendClientFollowup_({
        to: recipient,
        subject: (testMode ? '[TEST] ' : '') + (rem.subject || 'Following up'),
        body: rem.body || '',
        sendAs: useSendAs,
        salesperson: rem.salesperson,
        testMode: testMode,
        originalClient: rem.clientEmail
      });

      pcFsUpdateReminder_(rem.id, { status: 'sent', sentAt: now, updatedAt: now });
      pcFsLogActivity_(rem.inquiryId, 'followup',
        'Follow-up sent to client' + (testMode ? ' (test mode)' : ''), { reminderId: rem.id, testMode: testMode });

      // Move the pipeline card forward a step — only for a real send (never
      // test mode, since nothing actually reached the client), and only if
      // it's still where it should be, so a card already Booked or moved by
      // hand is never yanked backward.
      if (!testMode) {
        try {
          var inq = pcFsGetInquiry_(rem.inquiryId);
          if (inq) {
            if (rem.round === 2 && inq.stage === 'followup_1') {
              pcFsUpdateInquiry_(rem.inquiryId, { stage: 'followup_2', followup2SentAt: now });
            } else if ((!rem.round || rem.round === 1) && inq.stage === 'menu_sent') {
              pcFsUpdateInquiry_(rem.inquiryId, { stage: 'followup_1', followup1SentAt: now });
            }
          }
        } catch (stageErr) {
          console.error('Failed to advance pipeline stage after follow-up send:', stageErr);
        }
      }

      sent++;
    } catch (err) {
      console.error('pcSendApprovedFollowups_ failed for ' + rem.id + ':', err);
      pcFsUpdateReminder_(rem.id, { status: 'send_failed', sendError: String(err), updatedAt: now });
    }
  });

  return { ok: true, sent: sent };
}
// ── ONE-TIME CLEANUP ───────────────────────────────────────────────────────
// Pick this in the function dropdown and press Run once. For each client:
//   • if a 2nd follow-up was already sent, skipped or approved, every
//     still-pending 2nd-follow-up duplicate is cancelled;
//   • otherwise the OLDEST pending one is kept and the rest are cancelled.
// First follow-ups are not touched. Safe to run more than once.
function pcCleanUpDuplicateSecondFollowups() {
  var pending = pcFsQueryRemindersByStatus_('pending').filter(function (r) { return Number(r.round) === 2; });
  var byInq = {};
  pending.forEach(function (r) { (byInq[r.inquiryId] = byInq[r.inquiryId] || []).push(r); });
  var now = Date.now(), cancelled = 0, kept = 0;
  Object.keys(byInq).forEach(function (inqId) {
    var list = byInq[inqId].sort(function (a, b) { return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0); });
    var handled = pcFsQueryRemindersByInquiry_(inqId).some(function (r) {
      return Number(r.round) === 2 && r.status !== 'pending' && r.status !== 'cancelled';
    });
    list.forEach(function (r, i) {
      if (!handled && i === 0) { kept++; return; }
      pcFsUpdateReminder_(r.id, { status: 'cancelled', cancelReason: 'duplicate 2nd follow-up (cleanup)', cancelledAt: now, updatedAt: now });
      cancelled++;
    });
    try { pcFsUpdateInquiry_(inqId, { followup2ReminderCreated: true }); } catch (e) {}
    var name = (list[0] && list[0].clientName) || inqId;
    Logger.log(name + ': cancelled ' + (handled ? list.length : list.length - 1) + (handled ? ' (2nd follow-up already handled)' : ', kept 1'));
  });
  Logger.log('Done. Cancelled ' + cancelled + ' duplicate reminder(s); kept ' + kept + '.');
  return { cancelled: cancelled, kept: kept };
}
