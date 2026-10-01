/**
 * EmailFiling.gs — Premier Caterers
 * ------------------------------------------------------------------
 * Files emails onto each event in the app (the "Emails" card), and saves
 * their attachments into that event's "Attachments from emails" folder.
 *
 * Runs inside the events@ Apps Script project ("Premier Caterers Menu
 * Automation") as a NEW, separate file. It does not touch Code.gs or any
 * other file, and it adds no web-app actions — everything goes through the
 * database, so there is no new deployment URL to paste anywhere.
 *
 * Every email to or from Kenny, Shelley and Josh is already copied into the
 * events@ mailbox by the Google Workspace rules. Once a minute this script
 * looks at what arrived and:
 *
 *   1. CLIENT EMAILS — if anyone on the email is a client (the email address
 *      on an inquiry, or one of its "other email addresses"), it is filed on
 *      that client's NEXT UPCOMING event. No upcoming event → their newest
 *      undated inquiry → their most recent past event. If the client has
 *      more than one upcoming event, the app asks "Also file on …?".
 *   2. REPLIES FOLLOW — once a conversation is filed on an event, every later
 *      reply in it goes to the same event(s), whoever sends it.
 *   3. GMAIL BUTTON TAGS — when someone files an email with the Premier
 *      button in Gmail, it is copied in here (with attachments).
 *   4. APP REQUESTS — moving an email, renaming the attachments folder or a
 *      file, and re-checking a client after you add an email address.
 *
 * Older emails stay where they were filed. Nothing is ever re-sorted
 * automatically; only a person moving an email changes where it lives.
 *
 * ONE-TIME SETUP (after pasting this file in and saving):
 *   1. Function dropdown → EF_setup → Run. Approve the permissions.
 *      It starts the once-a-minute timer and creates the Drive folder.
 *   2. Function dropdown → EF_startBackfill → Run.
 *      It goes back through the last 12 months and files past client
 *      emails. It runs itself in the background in short bursts and logs
 *      "Backfill complete" when done (usually within an hour).
 *
 * Other tools (pick in the dropdown and Run):
 *   EF_status        — what it has done lately
 *   EF_checkAddress  — edit the address inside it, Run, and the log shows
 *                      which event an email from that person would go to
 *   EF_stop          — turns the timer off (nothing is deleted)
 * ------------------------------------------------------------------
 */

var EF_PROJECT        = 'premier-caterers-internal-app';
var EF_TZ             = 'America/New_York';
var EF_OWN_DOMAIN     = 'thepremiercaterer.com';
var EF_ROOT_FOLDER    = 'Premier Caterers — Email attachments';
var EF_SUBFOLDER      = 'Attachments from emails';
var EF_BACKFILL_DAYS  = 365;
var EF_RUN_BUDGET_MS  = 4.5 * 60 * 1000;
// Everyone who should be able to open saved attachments from the app.
var EF_VIEWERS = [
  'kenny@thepremiercaterer.com',
  'shelley@thepremiercaterer.com',
  'joshg@thepremiercaterer.com',
  'bnash.premiercaterers@gmail.com',
  'kitchen@thepremiercaterer.com'
];
// Never treated as a client, even if typed onto an inquiry by mistake.
var EF_IGNORE = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?)@/i;
// Small inline pictures are almost always signature logos — skip them.
var EF_MIN_IMAGE_BYTES = 60 * 1024;
// Firestore documents cap at 1 MB; very long emails keep text only.
var EF_MAX_HTML = 350000;
var EF_MAX_TEXT = 60000;

/* ================= setup / stop / status ================= */

function EF_setup() {
  EF_stop();
  ScriptApp.newTrigger('EF_run').timeBased().everyMinutes(1).create();
  ef_rootFolder_();
  var known = ef_get_('emailFilingStatus/known');
  if (!known) {
    // First install: remember every current inquiry so the "new inquiry"
    // catch-up does not fire for all of them at once. The backfill covers
    // their history instead.
    var idx = ef_loadIndex_();
    ef_set_('emailFilingStatus/known', { sig: ef_sigMap_(idx), at: Date.now() });
  }
  PropertiesService.getScriptProperties().setProperty('EF_SCAN_FROM', String(Date.now() - 60 * 60 * 1000));
  PropertiesService.getScriptProperties().deleteProperty('EF_GMAIL_PAUSE_UNTIL');
  ef_status_({ installedAt: Date.now(), lastError: '' });
  Logger.log('Email filing is ON — checking every minute. Next: run EF_startBackfill once.');
}

function EF_stop() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'EF_run' || h === 'EF_backfillStep') ScriptApp.deleteTrigger(t);
  });
  Logger.log('Email filing timers removed (if there were any). Nothing was deleted.');
}

function EF_status() {
  Logger.log(JSON.stringify(ef_get_('emailFilingStatus/status') || {}, null, 2));
}

// Edit the address, then Run: logs which event an email from them would go to.
function EF_checkAddress() {
  var address = 'someone@example.com';
  var idx = ef_loadIndex_();
  var cands = idx.byAddr[address.toLowerCase()] || [];
  if (!cands.length) { Logger.log(address + ' is not on any inquiry.'); return; }
  var pick = ef_pick_(cands, Date.now());
  Logger.log(address + ' → ' + idx.byId[pick.id].label + (pick.others.length ? '   (also upcoming: ' + pick.others.map(function (o) { return idx.byId[o].label; }).join(', ') + ')' : ''));
}

/* ================= the once-a-minute run ================= */

function EF_run() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) return;
  var started = Date.now();
  var report = { lastRun: started, tagged: 0, jobs: 0 };
  try {
    var idx = ef_loadIndex_();
    var gmailOk = !ef_gmailPaused_();
    report.gmailPausedUntil = gmailOk ? 0 : ef_gmailPausedUntil_();
    report.jobs = ef_processJobs_(idx, started, gmailOk);
    if (gmailOk) {
      report.tagged = ef_processTagRequests_(idx, started);
      // New mail is checked every 5 minutes — Gmail-button tags and app
      // requests every minute. Keeps events@ well inside Gmail's daily limit.
      var props = PropertiesService.getScriptProperties();
      if (Date.now() - (Number(props.getProperty('EF_LAST_SCAN')) || 0) >= 4.5 * 60 * 1000) {
        props.setProperty('EF_LAST_SCAN', String(Date.now()));
        report.filed = ef_scanNew_(idx, started);
        report.lastScanAt = Date.now();
        report.lastError = '';
      }
      ef_catchUpNewInquiries_(idx, started);
    }
    report.lastOkAt = Date.now();
  } catch (e) {
    report.lastError = String(e && e.stack || e).slice(0, 900);
    report.lastErrorAt = Date.now();
    if (ef_isQuotaError_(e)) report.gmailPausedUntil = ef_pauseGmail_();
    Logger.log('Email filing error: ' + report.lastError);
  } finally {
    ef_status_(report);
    lock.releaseLock();
  }
}

/* ---------- Gmail daily limit: back off instead of hammering ---------- */

function ef_isQuotaError_(e) {
  return /too many times|Service invoked|quota|rate limit/i.test(String(e && e.message || e));
}
function ef_gmailPausedUntil_() {
  return Number(PropertiesService.getScriptProperties().getProperty('EF_GMAIL_PAUSE_UNTIL')) || 0;
}
function ef_gmailPaused_() { return ef_gmailPausedUntil_() > Date.now(); }
// Wait an hour, then try again. Nothing is lost: the scan picks up from
// where it last finished, so mail that arrived meanwhile is still filed.
function ef_pauseGmail_() {
  var until = Date.now() + 60 * 60 * 1000;
  PropertiesService.getScriptProperties().setProperty('EF_GMAIL_PAUSE_UNTIL', String(until));
  Logger.log('Gmail daily limit reached for this account — pausing Gmail work until ' + new Date(until));
  return until;
}

function ef_outOfTime_(started) { return Date.now() - started > EF_RUN_BUDGET_MS; }

/* ---------- 1 & 2: new mail in the events@ mailbox ---------- */

function ef_scanNew_(idx, started) {
  var props = PropertiesService.getScriptProperties();
  var from = Number(props.getProperty('EF_SCAN_FROM')) || (Date.now() - 60 * 60 * 1000);
  // Look back 10 minutes past the last check — mail can land late.
  var afterSec = Math.floor((from - 10 * 60 * 1000) / 1000);
  var newest = from;
  var msgs = [];
  var start = 0, threads;
  do {
    threads = GmailApp.search('in:anywhere -in:spam -in:trash after:' + afterSec, start, 100);
    var tcache = CacheService.getScriptCache();
    var tseen = tcache.getAll(threads.map(function (t) { return 'eft:' + t.getId(); }));
    threads.forEach(function (t) {
      // A conversation with nothing new since the last look is skipped
      // without opening it — the biggest saving on Gmail calls.
      var last = String(t.getLastMessageDate().getTime());
      if (tseen['eft:' + t.getId()] === last) return;
      t.getMessages().forEach(function (m) {
        var ms = m.getDate().getTime();
        if (ms >= afterSec * 1000) msgs.push(m);
      });
      tcache.put('eft:' + t.getId(), last, 21600);
    });
    start += threads.length;
  } while (threads.length === 100 && !ef_outOfTime_(started));
  msgs.sort(function (a, b) { return a.getDate() - b.getDate(); });

  var cache = CacheService.getScriptCache();
  var seen = cache.getAll(msgs.map(function (m) { return 'ef:' + m.getId(); }));
  var filed = 0;
  for (var i = 0; i < msgs.length; i++) {
    if (ef_outOfTime_(started)) break;
    var m = msgs[i];
    newest = Math.max(newest, m.getDate().getTime());
    if (seen['ef:' + m.getId()]) continue;
    if (ef_autoFile_(m, idx)) filed++;
    cache.put('ef:' + m.getId(), '1', 21600);
  }
  if (!ef_outOfTime_(started)) props.setProperty('EF_SCAN_FROM', String(Math.max(newest, Date.now() - 5 * 60 * 1000)));
  return filed;
}

// Decide where one message goes (if anywhere) and file it. Returns true if filed.
function ef_autoFile_(m, idx, opts) {
  opts = opts || {};
  var head = ef_headers_(m);
  var existing = ef_get_('eventEmails/' + head.docId);
  if (existing && !opts.extraTargets) return false; // already filed — leave it where it is

  var targets = [], others = [];
  var thread = ef_get_('emailThreads/' + head.rootId);
  if (thread && thread.inquiryIds && thread.inquiryIds.length) {
    targets = thread.inquiryIds.slice();
  } else {
    var picks = ef_pickForParticipants_(head.participants, m.getDate().getTime(), idx, opts.onlyAddrs);
    targets = picks.targets; others = picks.others;
  }
  if (opts.extraTargets) targets = ef_union_(targets, opts.extraTargets);
  targets = targets.filter(function (id) { return !!idx.byId[id]; });
  if (existing) targets = targets.filter(function (id) { return (existing.removedFrom || []).indexOf(id) < 0; });
  if (!targets.length) return false;

  ef_fileMessage_(m, head, targets, { source: thread ? 'thread' : 'auto', others: others, existing: existing }, idx);
  if (!thread) {
    ef_set_('emailThreads/' + head.rootId, {
      root: head.root, subject: head.subject, inquiryIds: targets, updatedAt: Date.now(), by: 'auto'
    });
  }
  return true;
}

function ef_pickForParticipants_(participants, ms, idx, onlyAddrs) {
  var targets = [], others = [];
  participants.forEach(function (a) {
    if (onlyAddrs && onlyAddrs.indexOf(a) < 0) return;
    var cands = idx.byAddr[a];
    if (!cands || !cands.length) return;
    var p = ef_pick_(cands, ms);
    if (p.id) targets = ef_union_(targets, [p.id]);
    others = ef_union_(others, p.others);
  });
  others = others.filter(function (o) { return targets.indexOf(o) < 0; });
  return { targets: targets, others: others };
}

// The rule for which of a client's events an email belongs to.
function ef_pick_(cands, ms) {
  var msgDay = Utilities.formatDate(new Date(ms), EF_TZ, 'yyyy-MM-dd');
  var pool = cands.filter(function (c) { return !c.lost; });
  if (!pool.length) pool = cands.slice();
  // An inquiry that did not exist yet when the email was sent is skipped
  // (keeps old emails on the old event) — unless nothing else is left.
  var existed = pool.filter(function (c) { return !c.createdMs || c.createdMs <= ms + 86400000; });
  if (existed.length) pool = existed;

  var upcoming = pool.filter(function (c) { return c.ymd && c.ymd >= msgDay; })
    .sort(function (a, b) { return a.ymd < b.ymd ? -1 : a.ymd > b.ymd ? 1 : 0; });
  var undated = pool.filter(function (c) { return !c.ymd; })
    .sort(function (a, b) { return (b.createdMs || 0) - (a.createdMs || 0); });
  var past = pool.filter(function (c) { return c.ymd && c.ymd < msgDay; })
    .sort(function (a, b) { return a.ymd < b.ymd ? 1 : a.ymd > b.ymd ? -1 : 0; });

  var choice = upcoming[0] || undated[0] || past[0];
  if (!choice) return { id: null, others: [] };
  var others = upcoming.concat(undated)
    .filter(function (c) { return c.id !== choice.id; })
    .map(function (c) { return c.id; });
  return { id: choice.id, others: others };
}

/* ---------- 3: Gmail-button tags ---------- */

function ef_processTagRequests_(idx, started) {
  var reqs = ef_query_('emailTagRequests', 'status', 'EQUAL', 'pending');
  var n = 0;
  reqs.forEach(function (r) {
    if (ef_outOfTime_(started)) return;
    var path = 'emailTagRequests/' + r._id;
    try {
      var ids = (r.inquiryIds || []).filter(function (id) { return !!idx.byId[id]; });
      if (!ids.length) { ef_patch_(path, { status: 'failed', note: 'None of the chosen events exist any more.', doneAt: Date.now() }); return; }
      var found = ef_findByMessageId_(r.messageId);
      var age = Date.now() - (Number(r.createdAt) || 0);
      if (!found && age < 10 * 60 * 1000) return; // the copy may still be on its way — try next minute

      var rootId, root, subject;
      if (found) {
        var list = r.includeThread ? found.thread.getMessages() : [found.message];
        list.forEach(function (m) {
          var h = ef_headers_(m);
          var ex = ef_get_('eventEmails/' + h.docId);
          var targets = ef_union_(ex ? ex.inquiryIds || [] : [], ids);
          ef_fileMessage_(m, h, targets, { source: 'tag', by: r.by || '', existing: ex, manual: ids }, idx);
        });
        var fh = ef_headers_(found.message);
        rootId = fh.rootId; root = fh.root; subject = fh.subject;
      } else {
        // Not in the events@ mailbox (sent to someone whose mail is not
        // copied there). File what the Gmail button sent; attachments can't
        // be copied from here.
        var fb = r.fallback || {};
        var docId = ef_hash_(r.messageId);
        var ex2 = ef_get_('eventEmails/' + docId);
        var rec = {
          messageId: r.messageId, root: fb.root || r.messageId, rootId: ef_hash_(fb.root || r.messageId),
          subject: fb.subject || '(no subject)', from: fb.from || {}, to: fb.to || [], cc: fb.cc || [],
          participants: fb.participants || [], date: Number(fb.date) || Date.now(),
          direction: ef_isOwn_((fb.from || {}).email) ? 'out' : 'in',
          snippet: String(fb.bodyText || '').replace(/\s+/g, ' ').slice(0, 220),
          attachments: (ex2 && ex2.attachments) || [],
          attachmentsNote: (fb.attachmentCount ? 'This email had ' + fb.attachmentCount + ' attachment(s) that could not be copied — forward it to events@ to save them.' : ''),
          inquiryIds: ef_union_(ex2 ? ex2.inquiryIds || [] : [], ids),
          removedFrom: ((ex2 && ex2.removedFrom) || []).filter(function (x) { return ids.indexOf(x) < 0; }),
          source: 'tag', filedBy: r.by || '', filedAt: Date.now()
        };
        ef_set_('eventEmails/' + docId, rec);
        ef_set_('eventEmails/' + docId + '/content/body', {
          bodyHtml: String(fb.bodyHtml || '').slice(0, EF_MAX_HTML), bodyText: String(fb.bodyText || '').slice(0, EF_MAX_TEXT), tooLarge: false
        });
        rootId = rec.rootId; root = rec.root; subject = rec.subject;
      }
      if (r.followThread !== false) {
        var t = ef_get_('emailThreads/' + rootId);
        ef_set_('emailThreads/' + rootId, {
          root: root, subject: subject, inquiryIds: ef_union_(t ? t.inquiryIds || [] : [], ids),
          updatedAt: Date.now(), by: r.by || ''
        });
      }
      ef_patch_(path, { status: 'done', doneAt: Date.now(), note: found ? '' : 'Filed without attachments (not in events@).' });
      n++;
    } catch (e) {
      if (ef_isQuotaError_(e)) throw e; // stays pending until Gmail is available again
      ef_patch_(path, { status: 'failed', note: String(e).slice(0, 300), doneAt: Date.now() });
    }
  });
  return n;
}

function ef_findByMessageId_(messageId) {
  if (!messageId) return null;
  var bare = String(messageId).replace(/^<|>$/g, '');
  var threads = GmailApp.search('in:anywhere rfc822msgid:' + bare, 0, 5);
  for (var i = 0; i < threads.length; i++) {
    var ms = threads[i].getMessages();
    for (var j = 0; j < ms.length; j++) {
      if (String(ms[j].getHeader('Message-ID') || '').replace(/^<|>$/g, '') === bare) return { thread: threads[i], message: ms[j] };
    }
  }
  return null;
}

/* ---------- 4: requests from the app ---------- */

function ef_processJobs_(idx, started, gmailOk) {
  var jobs = ef_query_('emailJobs', 'status', 'EQUAL', 'pending');
  var n = 0;
  jobs.forEach(function (j) {
    if (ef_outOfTime_(started)) return;
    if (!gmailOk && j.type === 'checkClient') return; // waits until Gmail is available again
    var path = 'emailJobs/' + j._id;
    try {
      if (j.type === 'syncAttachments') ef_syncAttachments_(j.emailId, idx);
      else if (j.type === 'renameFolder') ef_renameFolder_(j.inquiryId, j.name);
      else if (j.type === 'renameFile') DriveApp.getFileById(j.fileId).setName(String(j.name || '').slice(0, 200) || 'Attachment');
      else if (j.type === 'checkClient') ef_catchUpInquiry_(j.inquiryId, idx, j.addresses || null, started);
      else throw new Error('Unknown request type: ' + j.type);
      ef_patch_(path, { status: 'done', doneAt: Date.now() });
      n++;
    } catch (e) {
      if (ef_isQuotaError_(e)) throw e; // leave it pending; the run pauses Gmail work
      ef_patch_(path, { status: 'failed', note: String(e).slice(0, 300), doneAt: Date.now() });
    }
  });
  return n;
}

// Make each attachment's saved copies match the email's current events:
// copy into any event it was added to, bin the copy in any it was removed from.
function ef_syncAttachments_(emailId, idx) {
  var path = 'eventEmails/' + emailId;
  var rec = ef_get_(path);
  if (!rec) return;
  var want = rec.inquiryIds || [];
  var atts = rec.attachments || [];
  if (!atts.length) return;
  var gmailMsg = null;
  atts.forEach(function (a, ai) {
    a.files = a.files || {};
    // add missing copies
    want.forEach(function (inqId) {
      if (a.files[inqId] || !idx.byId[inqId]) return;
      var folder = ef_folderFor_(inqId, idx);
      var src = null;
      Object.keys(a.files).some(function (k) {
        try { src = DriveApp.getFileById(a.files[k].id); return true; } catch (e) { return false; }
      });
      var file;
      if (src) file = src.makeCopy(a.name, folder);
      else {
        if (!gmailMsg && rec.messageId) { var f = ef_findByMessageId_(rec.messageId); gmailMsg = f && f.message; }
        if (!gmailMsg) return;
        var blob = ef_attachmentsOf_(gmailMsg)[a.index != null ? a.index : ai];
        if (!blob) return;
        file = folder.createFile(blob.copyBlob()).setName(a.name);
      }
      a.files[inqId] = { id: file.getId(), url: file.getUrl(), name: a.name };
    });
    // remove copies for events it is no longer on
    Object.keys(a.files).forEach(function (inqId) {
      if (want.indexOf(inqId) >= 0) return;
      try { DriveApp.getFileById(a.files[inqId].id).setTrashed(true); } catch (e) {}
      delete a.files[inqId];
    });
  });
  ef_patch_(path, { attachments: atts });
}

function ef_renameFolder_(inqId, name) {
  var rec = ef_get_('emailFolders/' + inqId);
  if (!rec || !rec.folderId) throw new Error('This event has no attachments folder yet.');
  var clean = String(name || '').replace(/[\/\\]/g, '-').trim().slice(0, 120) || EF_SUBFOLDER;
  DriveApp.getFolderById(rec.folderId).setName(clean);
  ef_patch_('emailFolders/' + inqId, { folderName: clean, renamedAt: Date.now() });
}

/* ---------- new inquiries / new addresses: pick up earlier emails ---------- */

// Once an hour, compare every inquiry's email addresses with what was seen
// last time. A new inquiry (or a newly added address) gets its last 90 days
// of mail checked, so the email that started the inquiry lands on it.
function ef_catchUpNewInquiries_(idx, started) {
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty('EF_CATCHUP_AT')) || 0;
  if (Date.now() - last < 10 * 60 * 1000) return;
  props.setProperty('EF_CATCHUP_AT', String(Date.now()));
  var known = ef_get_('emailFilingStatus/known') || { sig: {} };
  var oldSig = known.sig || {};
  var now = ef_sigMap_(idx);
  var changed = false;
  Object.keys(now).forEach(function (id) {
    if (ef_outOfTime_(started)) return; // the rest are picked up next time
    if (oldSig[id] === now[id]) return;
    var before = oldSig[id] ? String(oldSig[id]).split(',') : [];
    var after = now[id] ? String(now[id]).split(',') : [];
    var added = after.filter(function (a) { return a && before.indexOf(a) < 0; });
    if (added.length) ef_catchUpInquiry_(id, idx, added, started);
    oldSig[id] = now[id];
    changed = true;
  });
  if (changed) ef_set_('emailFilingStatus/known', { sig: oldSig, at: Date.now() });
}

// File the not-yet-filed mail of one inquiry's addresses (last 90 days).
// Mail already filed on another event is left where it is.
function ef_catchUpInquiry_(inqId, idx, addresses, started) {
  var inq = idx.byId[inqId];
  if (!inq) return;
  var addrs = (addresses && addresses.length ? addresses : inq.addrs).filter(function (a) { return !!a; });
  if (!addrs.length) return;
  var q = 'in:anywhere -in:spam -in:trash newer_than:90d {' + addrs.map(function (a) { return 'from:' + a + ' to:' + a + ' cc:' + a; }).join(' ') + '}';
  var threads = GmailApp.search(q, 0, 100);
  var msgs = [];
  threads.forEach(function (t) { msgs = msgs.concat(t.getMessages()); });
  msgs.sort(function (a, b) { return a.getDate() - b.getDate(); });
  msgs.forEach(function (m) {
    if (started && ef_outOfTime_(started)) return;
    ef_autoFile_(m, idx, { onlyAddrs: addrs });
  });
}

/* ================= backfill (run once) ================= */

function EF_startBackfill() {
  var props = PropertiesService.getScriptProperties();
  var idx = ef_loadIndex_();
  var addrs = Object.keys(idx.byAddr);
  props.setProperty('EF_BF_ADDRS', JSON.stringify(addrs));
  props.setProperty('EF_BF_POS', '0');
  props.setProperty('EF_BF_SINCE', String(Math.floor((Date.now() - EF_BACKFILL_DAYS * 86400000) / 1000)));
  ef_status_({ backfill: 'running — 0 of ' + addrs.length + ' client addresses' });
  Logger.log('Backfill started for ' + addrs.length + ' client addresses. It continues in the background.');
  EF_backfillStep();
}

function EF_backfillStep() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'EF_backfillStep') ScriptApp.deleteTrigger(t);
  });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { ScriptApp.newTrigger('EF_backfillStep').timeBased().after(60 * 1000).create(); return; }
  var started = Date.now();
  var props = PropertiesService.getScriptProperties();
  if (ef_gmailPaused_()) {
    ef_status_({ backfill: 'waiting for Gmail\u2019s daily limit to reset — will continue on its own' });
    ScriptApp.newTrigger('EF_backfillStep').timeBased().after(30 * 60 * 1000).create();
    lock.releaseLock();
    return;
  }
  try {
    var addrs = JSON.parse(props.getProperty('EF_BF_ADDRS') || '[]');
    var pos = Number(props.getProperty('EF_BF_POS')) || 0;
    var since = props.getProperty('EF_BF_SINCE');
    var idx = ef_loadIndex_();
    while (pos < addrs.length && !ef_outOfTime_(started)) {
      var chunk = addrs.slice(pos, pos + 10);
      var q = 'in:anywhere -in:spam -in:trash after:' + since + ' {' + chunk.map(function (a) { return 'from:' + a + ' to:' + a + ' cc:' + a; }).join(' ') + '}';
      var msgs = [], start = 0, threads;
      do {
        threads = GmailApp.search(q, start, 100);
        threads.forEach(function (t) { msgs = msgs.concat(t.getMessages()); });
        start += threads.length;
      } while (threads.length === 100 && !ef_outOfTime_(started));
      if (ef_outOfTime_(started)) break; // redo this chunk next time
      msgs.sort(function (a, b) { return a.getDate() - b.getDate(); });
      var finished = true;
      for (var i = 0; i < msgs.length; i++) {
        if (ef_outOfTime_(started)) { finished = false; break; }
        ef_autoFile_(msgs[i], idx, { onlyAddrs: chunk });
      }
      if (!finished) break; // already-filed ones are skipped quickly on the retry
      pos += chunk.length;
      props.setProperty('EF_BF_POS', String(pos));
    }
    if (pos >= addrs.length) {
      ef_status_({ backfill: 'complete ' + new Date().toISOString() });
      Logger.log('Backfill complete.');
    } else {
      ef_status_({ backfill: 'running — ' + pos + ' of ' + addrs.length + ' client addresses' });
      ScriptApp.newTrigger('EF_backfillStep').timeBased().after(60 * 1000).create();
    }
  } catch (e) {
    var quota = ef_isQuotaError_(e);
    if (quota) ef_pauseGmail_();
    ef_status_({ backfill: (quota ? 'waiting for Gmail\u2019s daily limit to reset' : 'paused after an error') + ' — will continue on its own: ' + String(e).slice(0, 160) });
    ScriptApp.newTrigger('EF_backfillStep').timeBased().after((quota ? 60 : 5) * 60 * 1000).create();
  } finally {
    lock.releaseLock();
  }
}

/* ================= reading a message ================= */

function ef_headers_(m) {
  var mid = String(m.getHeader('Message-ID') || '').trim().replace(/^<|>$/g, '');
  if (!mid) mid = 'gmail:' + m.getId();
  var refs = String(m.getHeader('References') || '').match(/<[^>]+>/g) || [];
  var irt = String(m.getHeader('In-Reply-To') || '').match(/<[^>]+>/);
  var root = refs.length ? refs[0] : (irt ? irt[0] : '<' + mid + '>');
  root = root.replace(/^<|>$/g, '');
  var from = ef_parseOne_(m.getFrom());
  var to = ef_parseList_(m.getTo());
  var cc = ef_parseList_(m.getCc());
  var participants = ef_union_([from.email], to.map(function (x) { return x.email; }).concat(cc.map(function (x) { return x.email; })))
    .filter(function (a) { return a && !ef_isOwn_(a) && !EF_IGNORE.test(a); });
  return {
    messageId: mid, docId: ef_hash_(mid), root: root, rootId: ef_hash_(root),
    subject: m.getSubject() || '(no subject)', from: from, to: to, cc: cc, participants: participants
  };
}

function ef_attachmentsOf_(m) {
  return m.getAttachments({ includeInlineImages: true, includeAttachments: true }).filter(function (a) {
    var type = String(a.getContentType() || '');
    if (/^image\//i.test(type) && a.getSize() < EF_MIN_IMAGE_BYTES) return false;
    return true;
  });
}

function ef_fileMessage_(m, head, targets, opts, idx) {
  var path = 'eventEmails/' + head.docId;
  var ex = opts.existing || null;
  var html = String(m.getBody() || '').replace(/<script[\s\S]*?<\/script>/gi, '');
  var text = String(m.getPlainBody() || '');
  var tooBig = html.length > EF_MAX_HTML;
  var rec = {
    messageId: head.messageId, root: head.root, rootId: head.rootId,
    subject: head.subject, from: head.from, to: head.to, cc: head.cc,
    participants: head.participants,
    date: m.getDate().getTime(),
    direction: ef_isOwn_(head.from.email) ? 'out' : 'in',
    snippet: text.replace(/\s+/g, ' ').trim().slice(0, 220),
    inquiryIds: targets,
    removedFrom: ((ex && ex.removedFrom) || []).filter(function (x) { return (opts.manual || []).indexOf(x) < 0; }),
    suggestOthers: (opts.others || []).filter(function (o) { return targets.indexOf(o) < 0; }),
    source: ex && ex.source ? ex.source : opts.source,
    filedBy: ex && ex.filedBy ? ex.filedBy : (opts.by || ''),
    filedAt: ex && ex.filedAt ? ex.filedAt : Date.now(),
    attachments: (ex && ex.attachments) || []
  };
  // Attachments: save a copy into each event's folder (first time only).
  if (!rec.attachments.length) {
    rec.attachments = ef_attachmentsOf_(m).map(function (a, i) {
      return { index: i, name: a.getName() || ('Attachment ' + (i + 1)), size: a.getSize(), type: a.getContentType() || '', files: {} };
    });
  }
  if (rec.attachments.length) {
    var blobs = null;
    rec.attachments.forEach(function (a) {
      a.files = a.files || {};
      targets.forEach(function (inqId) {
        if (a.files[inqId]) return;
        if (!blobs) blobs = ef_attachmentsOf_(m);
        var b = blobs[a.index];
        if (!b) return;
        var file = ef_folderFor_(inqId, idx).createFile(b.copyBlob()).setName(a.name);
        a.files[inqId] = { id: file.getId(), url: file.getUrl(), name: a.name };
      });
    });
  }
  ef_set_(path, rec);
  // The full text lives in a separate small document so the app's email
  // lists stay quick to load; it is only fetched when an email is opened.
  ef_set_(path + '/content/body', { bodyHtml: tooBig ? '' : html, bodyText: text.slice(0, EF_MAX_TEXT), tooLarge: tooBig });
}

/* ================= folders ================= */

function ef_rootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('EF_ROOT_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder(EF_ROOT_FOLDER);
  // People added to the top folder can open everything saved inside it.
  EF_VIEWERS.forEach(function (v) { try { f.addViewer(v); } catch (e) { Logger.log('Could not share with ' + v + ': ' + e); } });
  props.setProperty('EF_ROOT_ID', f.getId());
  return f;
}

function ef_folderFor_(inqId, idx) {
  var rec = ef_get_('emailFolders/' + inqId);
  if (rec && rec.folderId) { try { return DriveApp.getFolderById(rec.folderId); } catch (e) {} }
  var info = idx.byId[inqId] || { label: inqId };
  var parent = ef_rootFolder_().createFolder(String(info.label).replace(/[\/\\]/g, '-').slice(0, 120));
  var sub = parent.createFolder(EF_SUBFOLDER);
  ef_set_('emailFolders/' + inqId, {
    inquiryId: inqId, folderId: sub.getId(), folderUrl: sub.getUrl(), folderName: EF_SUBFOLDER,
    eventFolderId: parent.getId(), createdAt: Date.now()
  });
  return sub;
}

/* ================= who are the clients ================= */

function ef_loadIndex_() {
  var inqs = ef_list_('inquiries', ['email', 'extraEmails', 'stage', 'eventDate', 'firstName', 'lastName', 'organization', 'eventName', 'eventType', 'submittedAt', 'createdAt']);
  var evs = ef_list_('events', ['inquiryId', 'weekOf', 'day', 'eventDate', 'eventNumber', 'job', 'name']);
  var evByInq = {};
  evs.forEach(function (e) {
    var key = e.inquiryId || (String(e._id).indexOf('inq_') === 0 ? String(e._id).slice(4) : null);
    if (key) evByInq[key] = e;
  });
  var byId = {}, byAddr = {};
  inqs.forEach(function (q) {
    var id = q._id;
    var ev = evByInq[id] || null;
    var ymd = q.eventDate ? String(q.eventDate).slice(0, 10) : (ev ? ef_eventDate_(ev) : null);
    if (ymd && !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) ymd = null;
    var created = q.createdAt ? Number(q.createdAt) : (q.submittedAt ? new Date(q.submittedAt).getTime() : NaN);
    var addrs = ef_union_(ef_emailsIn_(q.email), ef_emailsIn_(q.extraEmails))
      .filter(function (a) { return !ef_isOwn_(a) && !EF_IGNORE.test(a); });
    var name = String(q.organization || '').trim() || (String(q.firstName || '') + ' ' + String(q.lastName || '')).trim() || 'Client';
    var num = ev ? (ev.eventNumber || '') : '';
    var label = (num ? num + ' ' : (ymd ? ymd + ' ' : '')) + name + (q.eventType ? ' — ' + q.eventType : '');
    var info = { id: id, ymd: ymd, lost: q.stage === 'lost' || q.stage === 'declined', createdMs: isNaN(created) ? null : created, addrs: addrs, label: label };
    byId[id] = info;
    addrs.forEach(function (a) { (byAddr[a] = byAddr[a] || []).push(info); });
  });
  return { byId: byId, byAddr: byAddr };
}

function ef_sigMap_(idx) {
  var out = {};
  Object.keys(idx.byId).forEach(function (id) { out[id] = idx.byId[id].addrs.slice().sort().join(','); });
  return out;
}

var EF_BACK_FROM_SUN = { sunday: 0, saturday: 1, friday: 2, thursday: 3, wednesday: 4, tuesday: 5, monday: 6 };
function ef_eventDate_(e) {
  if (e.eventDate) return String(e.eventDate).slice(0, 10);
  if (!e.weekOf) return null;
  var back = EF_BACK_FROM_SUN[String(e.day || '').toLowerCase()];
  if (back == null) return null;
  var sun = new Date(e.weekOf + 'T12:00:00Z');
  if (isNaN(sun)) return null;
  return new Date(sun.getTime() - back * 86400000).toISOString().slice(0, 10);
}

/* ================= small helpers ================= */

function ef_emailsIn_(s) {
  return (String(s || '').match(/[A-Z0-9._%+'\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/ig) || []).map(function (x) { return x.toLowerCase(); });
}
function ef_parseOne_(s) {
  s = String(s || '');
  var email = (ef_emailsIn_(s)[0]) || '';
  var name = s.replace(/<[^>]*>/, '').replace(/"/g, '').trim();
  if (name.toLowerCase() === email) name = '';
  return { name: name, email: email };
}
function ef_parseList_(s) {
  s = String(s || '');
  if (!s.trim()) return [];
  // split on commas that are not inside quotes
  var parts = s.match(/("[^"]*"|[^,])+/g) || [];
  return parts.map(ef_parseOne_).filter(function (x) { return !!x.email; });
}
function ef_isOwn_(a) {
  a = String(a || '').toLowerCase();
  return a.slice(-(EF_OWN_DOMAIN.length + 1)) === '@' + EF_OWN_DOMAIN;
}
function ef_union_(a, b) {
  var out = (a || []).slice();
  (b || []).forEach(function (x) { if (x && out.indexOf(x) < 0) out.push(x); });
  return out;
}
function ef_hash_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').slice(0, 40);
}
function ef_status_(patch) {
  try { ef_patch_('emailFilingStatus/status', patch); } catch (e) { Logger.log('Status write failed: ' + e); }
}

/* ================= database (Firestore REST, as events@) ================= */

function ef_base_() { return 'https://firestore.googleapis.com/v1/projects/' + EF_PROJECT + '/databases/(default)/documents'; }
function ef_auth_() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': EF_PROJECT };
}
function ef_fetch_(url, opt) {
  opt = opt || {};
  opt.headers = ef_auth_();
  opt.muteHttpExceptions = true;
  if (opt.payload && typeof opt.payload !== 'string') { opt.payload = JSON.stringify(opt.payload); opt.contentType = 'application/json'; }
  var res = UrlFetchApp.fetch(url, opt);
  var code = res.getResponseCode();
  if (code === 404) return null;
  if (code < 200 || code >= 300) throw new Error('Database ' + (opt.method || 'get') + ' failed (' + code + '): ' + res.getContentText().slice(0, 300));
  var t = res.getContentText();
  return t ? JSON.parse(t) : {};
}
function ef_get_(path) {
  var d = ef_fetch_(ef_base_() + '/' + path);
  return d ? ef_decodeFields_(d.fields || {}) : null;
}
function ef_list_(coll, fields) {
  var out = [], token = '';
  var mask = (fields || []).map(function (f) { return '&mask.fieldPaths=' + encodeURIComponent(f); }).join('');
  do {
    var d = ef_fetch_(ef_base_() + '/' + coll + '?pageSize=300' + mask + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    ((d && d.documents) || []).forEach(function (doc) {
      var o = ef_decodeFields_(doc.fields || {});
      o._id = doc.name.split('/').pop();
      out.push(o);
    });
    token = (d && d.nextPageToken) || '';
  } while (token);
  return out;
}
function ef_query_(coll, field, op, value) {
  var body = { structuredQuery: { from: [{ collectionId: coll }], where: { fieldFilter: { field: { fieldPath: field }, op: op, value: ef_enc_(value) } }, limit: 200 } };
  var rows = ef_fetch_(ef_base_() + ':runQuery', { method: 'post', payload: body }) || [];
  return rows.filter(function (r) { return r.document; }).map(function (r) {
    var o = ef_decodeFields_(r.document.fields || {});
    o._id = r.document.name.split('/').pop();
    return o;
  });
}
function ef_set_(path, obj) {
  ef_fetch_(ef_base_() + '/' + path, { method: 'patch', payload: { fields: ef_encFields_(obj) } });
}
function ef_patch_(path, obj) {
  var keys = Object.keys(obj);
  var mask = keys.map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&');
  ef_fetch_(ef_base_() + '/' + path + '?' + mask, { method: 'patch', payload: { fields: ef_encFields_(obj) } });
}
function ef_encFields_(o) {
  var f = {};
  Object.keys(o).forEach(function (k) { if (o[k] !== undefined) f[k] = ef_enc_(o[k]); });
  return f;
}
function ef_enc_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return (Math.floor(v) === v && Math.abs(v) < 9e15) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(ef_enc_) } : {} };
  if (typeof v === 'object') return { mapValue: { fields: ef_encFields_(v) } };
  return { stringValue: String(v) };
}
function ef_decodeFields_(f) {
  var o = {};
  Object.keys(f).forEach(function (k) { o[k] = ef_decode_(f[k]); });
  return o;
}
function ef_decode_(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return ef_decodeFields_(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(ef_decode_);
  return null;
}
