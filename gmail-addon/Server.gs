/**
 * Server.gs — Premier Caterers Gmail button (web app half)
 * ------------------------------------------------------------------
 * This half runs as events@ (it is deployed as a web app that only people
 * at thepremiercaterer.com can reach). The Gmail button calls it to get the
 * list of events and to file an email. It never sends mail and never
 * changes an event — it only writes a "please file this email" request,
 * which the EmailFiling.gs timer in the main events@ project picks up
 * within a minute.
 * ------------------------------------------------------------------
 */

var PS_PROJECT = 'premier-caterers-internal-app';
var PS_TZ = 'America/New_York';
var PS_OWN_DOMAIN = 'thepremiercaterer.com';

function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var who = String(Session.getActiveUser().getEmail() || '').toLowerCase();
    if (who && who.slice(-(PS_OWN_DOMAIN.length + 1)) !== '@' + PS_OWN_DOMAIN) throw new Error('Not a Premier Caterers account.');
    if (req.action === 'context') out = ps_context_(req);
    else if (req.action === 'search') out = { ok: true, results: ps_search_(req.q || '') };
    else if (req.action === 'tag') out = ps_tag_(req, who || req.by || '');
    else if (req.action === 'ping') out = { ok: true, who: who };
    else throw new Error('Unknown request.');
    out.ok = true;
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// Opening the URL in a browser just confirms it works.
function doGet() {
  return ContentService.createTextOutput('Premier Caterers Gmail button server is running.');
}

/* ---------- what the button shows for one email ---------- */

function ps_context_(req) {
  var idx = ps_index_();
  var today = Utilities.formatDate(new Date(), PS_TZ, 'yyyy-MM-dd');
  var participants = (req.participants || []).map(function (a) { return String(a).toLowerCase(); });

  // Already filed?
  var filedOn = [];
  if (req.messageId) {
    var rec = ps_get_('eventEmails/' + ps_hash_(String(req.messageId).replace(/^<|>$/g, '')));
    if (rec) filedOn = (rec.inquiryIds || []).filter(function (id) { return idx.byId[id]; }).map(function (id) { return ps_item_(idx.byId[id]); });
  }

  // Suggestions, strongest first.
  var scores = {};
  function bump(id, n, why) {
    if (!idx.byId[id]) return;
    if (!scores[id]) scores[id] = { n: 0, why: why };
    scores[id].n += n;
  }
  // 1. a client on this email
  idx.list.forEach(function (it) {
    if (it.addrs.some(function (a) { return participants.indexOf(a) >= 0; })) bump(it.id, it.ymd && it.ymd >= today ? 50 : 20, 'Client on this email');
  });
  // 2. events this sender's emails were filed on before (venues, vendors)
  participants.slice(0, 4).forEach(function (a) {
    ps_queryArray_('eventEmails', 'participants', a, 40).forEach(function (r) {
      (r.inquiryIds || []).forEach(function (id) {
        var it = idx.byId[id];
        if (it && (!it.ymd || it.ymd >= today)) bump(id, 15, 'Earlier emails with ' + a);
      });
    });
  });
  // 3. an event number or a client name mentioned in the email
  var text = String((req.subject || '') + ' ' + (req.text || '')).toLowerCase();
  var nums = text.match(/\b\d{2}-\d{4}-\d{2}[a-z]?\b/g) || [];
  idx.list.forEach(function (it) {
    if (it.num && nums.indexOf(it.num.toLowerCase()) >= 0) bump(it.id, 40, 'Event number mentioned');
    if (!it.ymd || it.ymd < today) return;
    it.keys.forEach(function (k) {
      if (k.length >= 4 && new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(text)) bump(it.id, 10, 'Mentioned in the email');
    });
  });
  var suggested = Object.keys(scores)
    .filter(function (id) { return filedOn.every(function (f) { return f.id !== id; }); })
    .sort(function (a, b) { return scores[b].n - scores[a].n; })
    .slice(0, 8)
    .map(function (id) { var x = ps_item_(idx.byId[id]); x.why = scores[id].why; return x; });

  // Upcoming, grouped by week (week ends Sunday).
  var weeks = Math.min(Math.max(Number(req.weeks) || 6, 1), 30);
  var end = ps_addDays_(today, weeks * 7);
  var start = ps_addDays_(today, -3);
  var byWeek = {};
  idx.list.forEach(function (it) {
    if (it.lost || !it.ymd || it.ymd < start || it.ymd > end) return;
    (byWeek[it.week] = byWeek[it.week] || []).push(it);
  });
  var upcoming = Object.keys(byWeek).sort().map(function (w) {
    return {
      week: w,
      label: 'Week ending ' + Utilities.formatDate(new Date(w + 'T12:00:00Z'), 'UTC', 'EEE MMM d'),
      items: byWeek[w].sort(function (a, b) { return a.ymd < b.ymd ? -1 : 1; }).map(ps_item_)
    };
  });
  var undated = idx.list.filter(function (it) { return !it.lost && !it.ymd && it.recent; }).slice(0, 12).map(ps_item_);
  var selectedItems = (req.selectedIds || []).filter(function (id) { return idx.byId[id]; }).map(function (id) { return ps_item_(idx.byId[id]); });
  return { filedOn: filedOn, suggested: suggested, upcoming: upcoming, undated: undated, weeks: weeks, selectedItems: selectedItems };
}

function ps_search_(q) {
  q = String(q || '').toLowerCase().trim();
  if (!q) return [];
  var words = q.split(/\s+/);
  var idx = ps_index_();
  var today = Utilities.formatDate(new Date(), PS_TZ, 'yyyy-MM-dd');
  return idx.list.filter(function (it) {
    return words.every(function (w) { return it.hay.indexOf(w) >= 0; });
  }).sort(function (a, b) {
    // upcoming first (soonest), then past (most recent), then undated
    var ka = a.ymd ? (a.ymd >= today ? '0' + a.ymd : '1' + (99999999 - Number(a.ymd.replace(/-/g, '')))) : '2';
    var kb = b.ymd ? (b.ymd >= today ? '0' + b.ymd : '1' + (99999999 - Number(b.ymd.replace(/-/g, '')))) : '2';
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  }).slice(0, 25).map(ps_item_);
}

function ps_tag_(req, who) {
  var ids = (req.inquiryIds || []).filter(function (x) { return !!x; });
  if (!ids.length) throw new Error('Pick at least one event.');
  if (!req.messageId) throw new Error('This email has no message ID.');
  var id = Utilities.getUuid().replace(/-/g, '');
  var fb = req.fallback || {};
  // Keep the request comfortably under the database's 1 MB document limit.
  fb.bodyHtml = String(fb.bodyHtml || '').slice(0, 300000);
  fb.bodyText = String(fb.bodyText || '').slice(0, 60000);
  ps_set_('emailTagRequests/' + id, {
    status: 'pending',
    messageId: String(req.messageId).replace(/^<|>$/g, ''),
    inquiryIds: ids,
    followThread: req.followThread !== false,
    includeThread: req.includeThread !== false,
    by: who,
    createdAt: Date.now(),
    fallback: fb
  });
  return { requestId: id };
}

/* ---------- the event list ---------- */

function ps_index_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('ps_index_v1');
  if (hit) { var o = JSON.parse(hit); o.byId = {}; o.list.forEach(function (it) { o.byId[it.id] = it; }); return o; }

  var inqs = ps_list_('inquiries', ['email', 'extraEmails', 'stage', 'eventDate', 'firstName', 'lastName', 'organization', 'eventName', 'eventType', 'venueName', 'submittedAt', 'createdAt']);
  var evs = ps_list_('events', ['inquiryId', 'weekOf', 'day', 'eventDate', 'eventNumber', 'name', 'addr']);
  var evByInq = {};
  evs.forEach(function (e) {
    var key = e.inquiryId || (String(e._id).indexOf('inq_') === 0 ? String(e._id).slice(4) : null);
    if (key) evByInq[key] = e;
  });
  var recentCut = Date.now() - 120 * 86400000;
  var list = inqs.map(function (q) {
    var ev = evByInq[q._id] || null;
    var ymd = q.eventDate ? String(q.eventDate).slice(0, 10) : (ev ? ps_eventDate_(ev) : null);
    if (ymd && !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) ymd = null;
    var org = String(q.organization || '').trim();
    var person = (String(q.firstName || '') + ' ' + String(q.lastName || '')).trim();
    var name = org || person || 'Client';
    var num = ev && ev.eventNumber ? String(ev.eventNumber) : '';
    var created = q.createdAt ? Number(q.createdAt) : (q.submittedAt ? new Date(q.submittedAt).getTime() : 0);
    var addrs = ps_emails_(String(q.email || '') + ' ' + String(q.extraEmails || ''));
    var keys = [org, String(q.lastName || ''), String(q.eventName || '')].map(function (s) { return s.toLowerCase().trim(); }).filter(function (s) { return s.length >= 4; });
    return {
      id: q._id, ymd: ymd, week: ymd ? ps_weekEnd_(ymd) : '', num: num, name: name,
      type: String(q.eventType || ''), lost: q.stage === 'lost' || q.stage === 'declined',
      addrs: addrs, keys: keys, recent: created > recentCut,
      hay: [name, person, org, q.eventName, q.eventType, num, ymd, ymd ? ps_pretty_(ymd) : '', q.venueName, ev && ev.addr, addrs.join(' ')].join(' ').toLowerCase()
    };
  });
  var o = { list: list };
  try { cache.put('ps_index_v1', JSON.stringify(o), 120); } catch (e) { /* too big to cache — fine */ }
  o.byId = {};
  list.forEach(function (it) { o.byId[it.id] = it; });
  return o;
}

function ps_item_(it) {
  var when = it.ymd ? ps_pretty_(it.ymd) : 'No date yet';
  return {
    id: it.id,
    label: it.name + (it.type ? ' — ' + it.type : ''),
    sub: when + (it.num ? '  ·  #' + it.num : '') + (it.lost ? '  ·  Lost' : '')
  };
}

var PS_BACK_FROM_SUN = { sunday: 0, saturday: 1, friday: 2, thursday: 3, wednesday: 4, tuesday: 5, monday: 6 };
function ps_eventDate_(e) {
  if (e.eventDate) return String(e.eventDate).slice(0, 10);
  if (!e.weekOf) return null;
  var back = PS_BACK_FROM_SUN[String(e.day || '').toLowerCase()];
  if (back == null) return null;
  var sun = new Date(e.weekOf + 'T12:00:00Z');
  if (isNaN(sun)) return null;
  return new Date(sun.getTime() - back * 86400000).toISOString().slice(0, 10);
}
function ps_weekEnd_(ymd) {
  var d = new Date(ymd + 'T12:00:00Z');
  return ps_addDays_(ymd, (7 - d.getUTCDay()) % 7);
}
function ps_addDays_(ymd, n) {
  return new Date(new Date(ymd + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
}
function ps_pretty_(ymd) {
  return Utilities.formatDate(new Date(ymd + 'T12:00:00Z'), 'UTC', 'EEE MMM d, yyyy');
}
function ps_emails_(s) {
  return (String(s || '').match(/[A-Z0-9._%+'\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/ig) || []).map(function (x) { return x.toLowerCase(); });
}
function ps_hash_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').slice(0, 40);
}

/* ---------- database (as events@) ---------- */

function ps_base_() { return 'https://firestore.googleapis.com/v1/projects/' + PS_PROJECT + '/databases/(default)/documents'; }
function ps_fetch_(url, opt) {
  opt = opt || {};
  opt.headers = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PS_PROJECT };
  opt.muteHttpExceptions = true;
  if (opt.payload && typeof opt.payload !== 'string') { opt.payload = JSON.stringify(opt.payload); opt.contentType = 'application/json'; }
  var res = UrlFetchApp.fetch(url, opt);
  var code = res.getResponseCode();
  if (code === 404) return null;
  if (code < 200 || code >= 300) throw new Error('Database error (' + code + '): ' + res.getContentText().slice(0, 200));
  var t = res.getContentText();
  return t ? JSON.parse(t) : {};
}
function ps_get_(path) {
  var d = ps_fetch_(ps_base_() + '/' + path);
  return d ? ps_decFields_(d.fields || {}) : null;
}
function ps_list_(coll, fields) {
  var out = [], token = '';
  var mask = (fields || []).map(function (f) { return '&mask.fieldPaths=' + encodeURIComponent(f); }).join('');
  do {
    var d = ps_fetch_(ps_base_() + '/' + coll + '?pageSize=300' + mask + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    ((d && d.documents) || []).forEach(function (doc) {
      var o = ps_decFields_(doc.fields || {});
      o._id = doc.name.split('/').pop();
      out.push(o);
    });
    token = (d && d.nextPageToken) || '';
  } while (token);
  return out;
}
function ps_queryArray_(coll, field, value, limit) {
  var body = { structuredQuery: { from: [{ collectionId: coll }], where: { fieldFilter: { field: { fieldPath: field }, op: 'ARRAY_CONTAINS', value: { stringValue: value } } }, limit: limit || 40 } };
  var rows = ps_fetch_(ps_base_() + ':runQuery', { method: 'post', payload: body }) || [];
  return rows.filter(function (r) { return r.document; }).map(function (r) { return ps_decFields_(r.document.fields || {}); });
}
function ps_set_(path, obj) {
  ps_fetch_(ps_base_() + '/' + path, { method: 'patch', payload: { fields: ps_encFields_(obj) } });
}
function ps_encFields_(o) {
  var f = {};
  Object.keys(o).forEach(function (k) { if (o[k] !== undefined) f[k] = ps_enc_(o[k]); });
  return f;
}
function ps_enc_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return (Math.floor(v) === v && Math.abs(v) < 9e15) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(ps_enc_) } : {} };
  if (typeof v === 'object') return { mapValue: { fields: ps_encFields_(v) } };
  return { stringValue: String(v) };
}
function ps_decFields_(f) {
  var o = {};
  Object.keys(f).forEach(function (k) { o[k] = ps_dec_(f[k]); });
  return o;
}
function ps_dec_(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return ps_decFields_(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(ps_dec_);
  return null;
}
