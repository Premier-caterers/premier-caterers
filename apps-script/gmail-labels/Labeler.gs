/**
 * Labeler.gs — Premier Caterers "In client file" Gmail label
 * ------------------------------------------------------------------
 * Puts the Gmail label "In client file" on every email that is filed in a
 * client file in the app — whether it was filed automatically or with the
 * Premier (P) button — and takes it off again if the email is removed from
 * every client file.
 *
 * Google only lets an account label its OWN mailbox, so this runs
 * separately in each inbox: each person runs the setup once, signed in as
 * themselves, and from then on it checks every 5 minutes on its own.
 * It only adds or removes that one label. It never reads, sends, moves or
 * deletes email.
 *
 * ONE-TIME SETUP (each inbox, signed in as that inbox):
 *   1. Function dropdown → LB_setup → Run. Click Allow.
 *   2. That's it. It also works through emails filed before today, a batch
 *      every 5 minutes, until it has caught up.
 *
 * Other tools (pick in the dropdown and Run):
 *   LB_status — what it has done in this inbox
 *   LB_stop   — turns it off for this inbox (labels already added stay)
 * ------------------------------------------------------------------
 */

// The same web app address that is pasted into Button.gs in the
// "Premier Caterers Gmail button" project.
var LB_SERVER_URL = 'PASTE_THE_WEB_APP_URL_HERE';

var LB_LABEL = 'In client file';
// Gmail only allows colours from its own palette; this is its wine.
var LB_COLOR = { backgroundColor: '#83334c', textColor: '#ffffff' };
var LB_OWN_DOMAIN = 'thepremiercaterer.com';
var LB_PROJECT = 'premier-caterers-internal-app';
var LB_BUDGET_MS = 4 * 60 * 1000;
var LB_PAGE = 300;

/* ================= setup / stop / status ================= */

function LB_setup() {
  LB_stop();
  ScriptApp.newTrigger('LB_run').timeBased().everyMinutes(5).create();
  lb_labelId_();
  LB_run();
  Logger.log('Started for ' + lb_me_() + '. The label "' + LB_LABEL + '" is set up; it checks every 5 minutes.');
}

function LB_stop() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'LB_run') ScriptApp.deleteTrigger(t);
  });
}

function LB_status() {
  var p = PropertiesService.getUserProperties().getProperties();
  Logger.log('Inbox: ' + lb_me_());
  Logger.log('Timer on: ' + ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'LB_run'; }));
  Logger.log(JSON.stringify(JSON.parse(p.LB_STATUS || '{}'), null, 2));
}

/* ================= the 5-minute run ================= */

function LB_run() {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(2000)) return;
  var started = Date.now();
  var props = PropertiesService.getUserProperties();
  var st = JSON.parse(props.getProperty('LB_STATUS') || '{}');
  st.lastRun = new Date().toString();
  try {
    if (Number(st.pausedUntil || 0) > Date.now()) return;
    var labelId = lb_labelId_();
    var res = { labeled: 0, unlabeled: 0 };
    // New filings first, then moves/removals made in the app.
    ['filedAt', 'changedAt'].forEach(function (field) {
      if (Date.now() - started > LB_BUDGET_MS) return;
      var r = lb_catchUp_(field, labelId, started, props);
      res.labeled += r.labeled; res.unlabeled += r.unlabeled;
      st[field === 'filedAt' ? 'caughtUpFiled' : 'caughtUpChanged'] = r.caughtUp;
    });
    st.labeledLastRun = res.labeled;
    st.unlabeledLastRun = res.unlabeled;
    st.labeledTotal = Number(st.labeledTotal || 0) + res.labeled;
    st.lastOk = new Date().toString();
    st.lastError = '';
  } catch (e) {
    st.lastError = String(e && e.message || e).slice(0, 500);
    st.lastErrorAt = new Date().toString();
    // Gmail says slow down → leave it for an hour instead of retrying.
    if (/rate|quota|too many/i.test(st.lastError)) st.pausedUntil = Date.now() + 60 * 60 * 1000;
    Logger.log('Label error: ' + st.lastError);
  } finally {
    props.setProperty('LB_STATUS', JSON.stringify(st));
    lock.releaseLock();
  }
}

// Work forward through one list (oldest first) from where this inbox left off.
function lb_catchUp_(field, labelId, started, props) {
  var curKey = 'LB_CUR_' + field, doneKey = 'LB_DONE_' + field;
  var out = { labeled: 0, unlabeled: 0, caughtUp: false };
  while (Date.now() - started < LB_BUDGET_MS) {
    var cursor = Number(props.getProperty(curKey) || 0);
    var doneAtCursor = JSON.parse(props.getProperty(doneKey) || '[]');
    var page = lb_fetchFiled_(field, cursor);
    var rows = page.rows.filter(function (r) { return !(r.t === cursor && doneAtCursor.indexOf(r.id) >= 0); });
    if (!rows.length) { out.caughtUp = true; break; }
    var add = [], remove = [];
    var i;
    for (i = 0; i < rows.length; i++) {
      if (Date.now() - started > LB_BUDGET_MS) break;
      var r = rows[i];
      if (r.m && r.m.indexOf('gmail:') !== 0) {
        var ids = lb_findMine_(r.m);
        (r.on ? add : remove).push.apply(r.on ? add : remove, ids);
      }
      if (r.t !== cursor) { cursor = r.t; doneAtCursor = []; }
      doneAtCursor.push(r.id);
    }
    lb_apply_(add, remove, labelId);
    out.labeled += add.length; out.unlabeled += remove.length;
    // Only move the bookmark after the labels are actually on.
    props.setProperty(curKey, String(cursor));
    props.setProperty(doneKey, JSON.stringify(doneAtCursor.slice(-200)));
    if (i < rows.length) break;           // ran out of time mid-page
    if (!page.more) { out.caughtUp = true; break; }
  }
  return out;
}

/* ================= Gmail (this inbox only) ================= */

function lb_labelId_() {
  var cache = CacheService.getUserCache();
  var hit = cache.get('LB_LABEL_ID');
  if (hit) return hit;
  var found = (Gmail.Users.Labels.list('me').labels || []).filter(function (l) { return l.name === LB_LABEL; })[0];
  if (!found) {
    try {
      found = Gmail.Users.Labels.create({ name: LB_LABEL, labelListVisibility: 'labelShow', messageListVisibility: 'show', color: LB_COLOR }, 'me');
    } catch (e) {
      // If Gmail ever refuses the colour, make the label plain rather than fail.
      found = Gmail.Users.Labels.create({ name: LB_LABEL, labelListVisibility: 'labelShow', messageListVisibility: 'show' }, 'me');
    }
  }
  cache.put('LB_LABEL_ID', found.id, 21600);
  return found.id;
}

// This inbox's copy (or copies) of one email, found by its Message-ID.
function lb_findMine_(messageId) {
  var q = 'rfc822msgid:' + String(messageId).replace(/^<|>$/g, '');
  var res = Gmail.Users.Messages.list('me', { q: q, maxResults: 10 });
  return (res.messages || []).map(function (m) { return m.id; });
}

function lb_apply_(add, remove, labelId) {
  for (var i = 0; i < add.length; i += 1000) {
    Gmail.Users.Messages.batchModify({ ids: add.slice(i, i + 1000), addLabelIds: [labelId] }, 'me');
  }
  for (var j = 0; j < remove.length; j += 1000) {
    Gmail.Users.Messages.batchModify({ ids: remove.slice(j, j + 1000), removeLabelIds: [labelId] }, 'me');
  }
}

/* ================= which emails are filed ================= */

function lb_me_() { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); }

// Company inboxes ask the Gmail-button server (runs as events@).
// A personal Gmail can't reach that server, so it reads the database
// directly — which needs that account given access in Firebase first.
function lb_fetchFiled_(field, after) {
  var me = lb_me_();
  if (me.slice(-(LB_OWN_DOMAIN.length + 1)) === '@' + LB_OWN_DOMAIN) return lb_fromServer_(field, after);
  return lb_fromDatabase_(field, after);
}

function lb_fromServer_(field, after) {
  if (!LB_SERVER_URL || LB_SERVER_URL.indexOf('https://') !== 0) throw new Error('The web app URL has not been pasted into Labeler.gs yet.');
  var res = UrlFetchApp.fetch(LB_SERVER_URL, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ action: 'filed', field: field, after: after, limit: LB_PAGE }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true, followRedirects: true
  });
  var t = res.getContentText();
  if (t.charAt(0) !== '{') throw new Error('The server answered with a web page instead of data (code ' + res.getResponseCode() + '). Is the new server version deployed?');
  var o = JSON.parse(t);
  if (!o.ok) throw new Error(o.error || 'Server error');
  return { rows: o.rows || [], more: !!o.more };
}

function lb_fromDatabase_(field, after) {
  var body = { structuredQuery: {
    from: [{ collectionId: 'eventEmails' }],
    select: { fields: [{ fieldPath: 'messageId' }, { fieldPath: 'inquiryIds' }, { fieldPath: field }] },
    where: { fieldFilter: { field: { fieldPath: field }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: String(Math.floor(after)) } } },
    orderBy: [{ field: { fieldPath: field }, direction: 'ASCENDING' }],
    limit: LB_PAGE
  } };
  var res = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' + LB_PROJECT + '/databases/(default)/documents:runQuery', {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(body),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': LB_PROJECT },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() === 403) throw new Error('This account has no access to the database yet (Firebase → Users and permissions).');
  if (res.getResponseCode() >= 300) throw new Error('Database error (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 200));
  var rows = (JSON.parse(res.getContentText() || '[]') || []).filter(function (r) { return r.document; }).map(function (r) {
    var f = r.document.fields || {};
    var ids = (f.inquiryIds && f.inquiryIds.arrayValue && f.inquiryIds.arrayValue.values) || [];
    var tv = f[field] || {};
    return {
      id: r.document.name.split('/').pop(),
      m: (f.messageId && f.messageId.stringValue) || '',
      on: ids.length > 0,
      t: Number(tv.integerValue || tv.doubleValue || 0)
    };
  });
  return { rows: rows, more: rows.length >= LB_PAGE };
}
