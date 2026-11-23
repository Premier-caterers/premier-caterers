/**
 * ChecklistEmails.gs — Premier Caterers
 * ------------------------------------------------------------------
 * Emails each event's SALESPERSON the open items on that event's
 * checklist at three points before the event:
 *     2 weeks before · 1 week before · 3 days (72 hours) before
 * Each one goes out at 8 AM New York time on that day. Nothing is sent
 * from Friday 6 PM to Saturday 6 PM — those wait until Saturday night.
 *
 * This is a NEW, separate file. It does not touch Code.gs, Followup.gs,
 * FollowupApi.gs or any other file in the project.
 *
 * ONE-TIME SETUP (after pasting this file in and saving):
 *   1. In the function dropdown at the top, pick  CL_setup  and click Run.
 *   2. Approve the permissions Google asks for.
 * That's it — it then checks once an hour on its own.
 *
 * Optional check: pick  CL_sendTestToMe  and Run. It emails YOU (the
 * account running the script) what the next upcoming event's email would
 * look like. Nobody else receives it.
 *
 * To turn it off: pick  CL_stop  and Run.
 *
 * Who receives it: the salesperson on the event's inquiry, using the
 * email address saved for them in the app's Settings. No salesperson or
 * no email address → that event is skipped (noted in the log).
 * An event where every task is done gets no email.
 * Reminders whose time had already passed when CL_setup was run are
 * skipped, so switching this on never floods anyone with late emails.
 * ------------------------------------------------------------------
 */

var CL_PROJECT   = 'premier-caterers-internal-app';
var CL_TZ        = 'America/New_York';
var CL_SEND_HOUR = 8;
var CL_APP_URL   = 'https://premier-caterers.github.io/premier-caterers/';
var CL_STAGES    = [
  { key: 's14', days: 14, label: '2 weeks out' },
  { key: 's7',  days: 7,  label: '1 week out'  },
  { key: 's3',  days: 3,  label: '72 hours out' }
];
var CL_BACK_FROM_SUN = { sunday:0, saturday:1, friday:2, thursday:3, wednesday:4, tuesday:5, monday:6 };

/* ================= setup / stop / test ================= */

function CL_setup() {
  CL_stop();
  ScriptApp.newTrigger('CL_run').timeBased().everyHours(1).create();
  PropertiesService.getScriptProperties().setProperty('CL_INSTALLED_AT', String(Date.now()));
  Logger.log('Checklist emails are ON. Checking every hour.');
}

function CL_stop() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'CL_run') ScriptApp.deleteTrigger(t);
  });
  Logger.log('Checklist email timer removed (if there was one).');
}

function CL_sendTestToMe() {
  var me = Session.getEffectiveUser().getEmail();
  var data = CL_load_();
  var now = Date.now();
  var next = data.events
    .map(function (e) { return { e: e, date: CL_eventDate_(e) }; })
    .filter(function (x) { return x.date && CL_at_(x.date, 0) > now && CL_isActive_(x.e, data); })
    .sort(function (a, b) { return CL_at_(a.date, 0) - CL_at_(b.date, 0); })[0];
  if (!next) { Logger.log('No upcoming events found.'); return; }
  var items = (data.checklists[next.e.id] || []);
  var sp = CL_salesperson_(next.e, data);
  var html = CL_emailHtml_(next.e, next.date, items, CL_STAGES[1], sp);
  GmailApp.sendEmail(me, '[TEST] ' + CL_subject_(next.e, next.date, CL_STAGES[1]), 'Open this email in HTML view.', { htmlBody: html, name: 'Premier Caterers' });
  Logger.log('Test sent to ' + me + ' for ' + (next.e.name || next.e.id) + ' (would go to: ' + (sp || 'no salesperson') + ')');
}

/* ================= the hourly run ================= */

function CL_run() {
  var now = new Date();
  // Shabbos quiet hours: Friday 6 PM – Saturday 6 PM
  var dow = Number(Utilities.formatDate(now, CL_TZ, 'u'));   // 1=Mon … 5=Fri, 6=Sat, 7=Sun
  var hr  = Number(Utilities.formatDate(now, CL_TZ, 'H'));
  if ((dow === 5 && hr >= 18) || (dow === 6 && hr < 18)) return;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var installedAt = Number(PropertiesService.getScriptProperties().getProperty('CL_INSTALLED_AT') || 0);
    var data = CL_load_();
    var log = data.log;
    var t = now.getTime();

    data.events.forEach(function (e) {
      if (!CL_isActive_(e, data)) return;
      var date = CL_eventDate_(e);
      if (!date) return;
      var eventStart = CL_at_(date, 0, 0);
      if (t >= eventStart) return;                      // event day has arrived — nothing more to send

      var entry = log[e.id] || {};
      // Stages whose 8 AM time has passed and that haven't been handled yet
      var due = CL_STAGES.filter(function (s) {
        return !entry[s.key] && t >= CL_at_(date, s.days);
      });
      if (!due.length) return;

      var patch = {};
      // Only the latest due stage is sent; earlier missed ones are marked skipped.
      var send = due[due.length - 1];
      due.slice(0, -1).forEach(function (s) { patch[s.key] = 'skipped'; });

      if (CL_at_(date, send.days) < installedAt) {
        patch[send.key] = 'skipped (before switch-on)';
      } else {
        if (!(e.id in data.checklists)) { Logger.log('No checklist saved yet for ' + (e.name || e.id) + ' — will retry'); return; }
        var items = data.checklists[e.id] || [];
        var open = items.filter(function (i) { return !i.na && !CL_isDone_(i); });
        var sp = CL_salesperson_(e, data);
        var to = sp ? (data.emails[sp] || '') : '';
        if (!open.length) {
          patch[send.key] = 'nothing open';
        } else if (!to) {
          patch[send.key] = 'no email for salesperson "' + (sp || '—') + '"';
          Logger.log('Skipped ' + (e.name || e.id) + ': ' + patch[send.key]);
        } else {
          GmailApp.sendEmail(to, CL_subject_(e, date, send), CL_plain_(e, date, items, send),
            { htmlBody: CL_emailHtml_(e, date, items, send, sp), name: 'Premier Caterers' });
          patch[send.key] = 'sent ' + new Date().toISOString() + ' to ' + to;
          Logger.log('Sent ' + send.label + ' checklist for ' + (e.name || e.id) + ' to ' + to);
        }
      }
      CL_patchLog_(e.id, patch);
    });
  } finally {
    lock.releaseLock();
  }
}

/* ================= data ================= */

function CL_load_() {
  var events = CL_list_('events');
  var inquiries = {};
  CL_list_('inquiries').forEach(function (d) { inquiries[d._id] = d; });
  var checklists = {};
  CL_list_('checklists').forEach(function (d) { checklists[d._id] = d.items || []; });
  var log = {};
  CL_list_('checklistEmailLog').forEach(function (d) { log[d._id] = d; });
  var settings = CL_get_('settings', 'app') || {};
  events.forEach(function (e) { if (!e.id) e.id = e._id; });
  return { events: events, inquiries: inquiries, checklists: checklists, log: log, emails: settings.salespersonEmails || {} };
}

function CL_inquiryFor_(e, data) {
  var id = String(e.id || '').indexOf('inq_') === 0 ? String(e.id).slice(4) : (e.inquiryId || '');
  return id ? data.inquiries[id] : null;
}
function CL_salesperson_(e, data) {
  var inq = CL_inquiryFor_(e, data);
  return (inq && inq.salesperson) || e.salesperson || '';
}
// Mirrors the app's isActiveEvent: skip lost events and events whose inquiry is gone or lost.
function CL_isActive_(e, data) {
  if (e.lost === true) return false;
  if (String(e.id || '').indexOf('inq_') === 0) {
    var inq = CL_inquiryFor_(e, data);
    if (!inq) return false;
    if (inq.stage === 'lost') return false;
  }
  return true;
}
function CL_isDone_(i) {
  if (i.done !== undefined) return !!i.done;
  return (i.assignees || []).some(function (a) { return a.done; });
}
// Event date as 'yyyy-MM-dd' — same rule as the app (eventDate, else W/E Sunday minus weekday)
function CL_eventDate_(e) {
  if (e.eventDate) return String(e.eventDate).slice(0, 10);
  if (!e.weekOf) return null;
  var back = CL_BACK_FROM_SUN[String(e.day || '').toLowerCase()];
  if (back == null) return null;
  var sun = new Date(e.weekOf + 'T12:00:00Z');
  if (isNaN(sun)) return null;
  return new Date(sun.getTime() - back * 86400000).toISOString().slice(0, 10);
}
// Timestamp for HH:00 New York time, `daysBefore` days before the given date
function CL_at_(ymd, daysBefore, hour) {
  var d = new Date(ymd + 'T12:00:00Z');
  d = new Date(d.getTime() - daysBefore * 86400000);
  var day = d.toISOString().slice(0, 10);
  var h = (hour == null ? CL_SEND_HOUR : hour);
  return Utilities.parseDate(day + ' ' + (h < 10 ? '0' : '') + h + ':00', CL_TZ, 'yyyy-MM-dd HH:mm').getTime();
}
function CL_taskDue_(ymd, i) {
  if (i.dueOption === 'custom') return i.customDue ? CL_at_(i.customDue, 0, 23) : null;
  if (i.dueOption) return CL_at_(ymd, parseInt(i.dueOption, 10), 23);
  return null;
}

/* ================= email ================= */

function CL_eventLabel_(e) { return (e.eventNumber || e.job || '') + ' ' + (e.name || ''); }
function CL_prettyDate_(ymd) {
  return Utilities.formatDate(new Date(ymd + 'T12:00:00Z'), CL_TZ, 'EEE, MMM d');
}
function CL_subject_(e, ymd, stage) {
  return 'Checklist · ' + CL_eventLabel_(e).trim() + ' · ' + stage.label + ' (' + CL_prettyDate_(ymd) + ')';
}
function CL_who_(i) {
  var w = (i.assignees || []).map(function (a) { return a.person === 'Other' ? (a.otherName || 'Other') : a.person; });
  return w.length ? w.join(', ') : 'Unassigned';
}
function CL_esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}
function CL_emailHtml_(e, ymd, items, stage, sp) {
  var now = Date.now();
  var active = items.filter(function (i) { return !i.na; });
  var done = active.filter(CL_isDone_).length;
  var open = active.filter(function (i) { return !CL_isDone_(i); });
  var rows = open.map(function (i) {
    var due = CL_taskDue_(ymd, i);
    var late = due != null && due < now;
    var dueTxt = due == null ? '—' : Utilities.formatDate(new Date(due), CL_TZ, 'MMM d');
    var st = late ? '<span style="background:#F9D5D5;color:#8E1C16;padding:2px 8px;border-radius:4px;font-weight:600">&#9650; Overdue</span>'
                  : '<span style="background:#ECEDEF;color:#45484D;padding:2px 8px;border-radius:4px;font-weight:600">&#9675; Open</span>';
    return '<tr>'
      + '<td style="padding:8px 10px;border:1px solid #D5DAE3">' + CL_esc_(i.text) + '</td>'
      + '<td style="padding:8px 10px;border:1px solid #D5DAE3">' + CL_esc_(CL_who_(i)) + '</td>'
      + '<td style="padding:8px 10px;border:1px solid #D5DAE3;text-align:center">' + dueTxt + '</td>'
      + '<td style="padding:8px 10px;border:1px solid #D5DAE3;text-align:center">' + st + '</td>'
      + '</tr>';
  }).join('');
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#1D1F21;max-width:680px">'
    + '<div style="background:#ECE4FA;padding:14px 18px;border-radius:8px 8px 0 0">'
    + '<div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#5B4F7A">Checklist · ' + stage.label + '</div>'
    + '<div style="font-size:20px;font-weight:bold;margin-top:4px">' + CL_esc_(CL_eventLabel_(e).trim()) + '</div>'
    + '<div style="font-size:13px;color:#45484D;margin-top:2px">' + CL_prettyDate_(ymd) + (sp ? ' · Salesperson: ' + CL_esc_(sp) : '') + '</div>'
    + '</div>'
    + '<div style="padding:14px 18px;border:1px solid #D5DAE3;border-top:0;border-radius:0 0 8px 8px">'
    + '<p style="margin:0 0 12px;font-size:14px"><b>' + open.length + ' still open</b> · ' + done + ' of ' + active.length + ' done</p>'
    + '<table style="border-collapse:collapse;width:100%;font-size:13px">'
    + '<tr style="background:#E4ECF8"><th style="padding:8px 10px;border:1px solid #D5DAE3;text-align:left">Task</th>'
    + '<th style="padding:8px 10px;border:1px solid #D5DAE3;text-align:left">Assigned to</th>'
    + '<th style="padding:8px 10px;border:1px solid #D5DAE3">Due</th>'
    + '<th style="padding:8px 10px;border:1px solid #D5DAE3">Status</th></tr>'
    + rows + '</table>'
    + '<p style="margin:16px 0 0"><a href="' + CL_APP_URL + '" style="background:#7F1D3A;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none;font-weight:bold">Open checklists</a></p>'
    + '</div></div>';
}
function CL_plain_(e, ymd, items, stage) {
  var open = items.filter(function (i) { return !i.na && !CL_isDone_(i); });
  return 'Checklist — ' + CL_eventLabel_(e).trim() + ' — ' + stage.label + ' (' + CL_prettyDate_(ymd) + ')\n\n'
    + open.map(function (i) { return '- ' + i.text + ' (' + CL_who_(i) + ')'; }).join('\n')
    + '\n\n' + CL_APP_URL;
}

/* ================= Firestore (REST) ================= */

// Since the database was locked on 29 Sep 2026, every request must say who
// is asking. This signs requests as the Google account running the script.
function CL_auth_() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': CL_PROJECT };
}
function CL_base_() { return 'https://firestore.googleapis.com/v1/projects/' + CL_PROJECT + '/databases/(default)/documents/'; }

function CL_list_(coll) {
  var out = [], token = '';
  do {
    var url = CL_base_() + coll + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : '');
    var res = UrlFetchApp.fetch(url, { headers: CL_auth_(), muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) { Logger.log('Read failed for ' + coll + ': ' + res.getContentText().slice(0, 300)); break; }
    var body = JSON.parse(res.getContentText());
    (body.documents || []).forEach(function (d) {
      var obj = CL_decodeFields_(d.fields || {});
      obj._id = d.name.split('/').pop();
      out.push(obj);
    });
    token = body.nextPageToken || '';
  } while (token);
  return out;
}
function CL_get_(coll, id) {
  var res = UrlFetchApp.fetch(CL_base_() + coll + '/' + encodeURIComponent(id), { headers: CL_auth_(), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  return CL_decodeFields_(JSON.parse(res.getContentText()).fields || {});
}
function CL_patchLog_(eventId, patch) {
  var keys = Object.keys(patch);
  if (!keys.length) return;
  var fields = {};
  keys.forEach(function (k) { fields[k] = { stringValue: String(patch[k]) }; });
  var url = CL_base_() + 'checklistEmailLog/' + encodeURIComponent(eventId) + '?'
    + keys.map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&');
  var res = UrlFetchApp.fetch(url, { method: 'patch', headers: CL_auth_(), contentType: 'application/json', payload: JSON.stringify({ fields: fields }), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) Logger.log('Log write failed for ' + eventId + ': ' + res.getContentText().slice(0, 300));
}
function CL_decodeFields_(f) {
  var o = {};
  Object.keys(f).forEach(function (k) { o[k] = CL_decode_(f[k]); });
  return o;
}
function CL_decode_(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return CL_decodeFields_(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(CL_decode_);
  return null;
}
