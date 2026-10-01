/**
 * Button.gs — Premier Caterers Gmail button (the part you see in Gmail)
 * ------------------------------------------------------------------
 * Open any email, click the Premier Caterers icon in Gmail's side panel
 * (on a phone: scroll to the bottom of the email), tick one or more events,
 * and press "File on selected events". The email — and, if you leave the
 * box ticked, the rest of its conversation and every future reply — shows
 * up in each event's Emails card in the app within about a minute.
 *
 * This part runs as whoever is using Gmail. It asks the web-app half
 * (Server.gs, running as events@) for the event list and hands it the
 * filing request. It never sends email and never changes an event.
 *
 * SETUP: paste the web app URL (Deploy → Manage deployments → Web app)
 * between the quotes below, then save.
 * ------------------------------------------------------------------
 */

var PB_SERVER_URL = 'PASTE_THE_WEB_APP_URL_HERE';

var PB_WINE = '#7A2E3D';

/* ---------- entry points ---------- */

function PB_onHomepage() {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Premier Caterers'))
    .addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph()
      .setText('Open an email, then click this icon to file it on one or more events.<br><br>It appears in each event’s <b>Emails</b> card in the app within about a minute, attachments included.')))
    .build();
}

function PB_onMessage(e) {
  return pb_render_(e, { q: '', weeks: 6, selected: [] });
}

/* ---------- button actions ---------- */

function pb_search(e) {
  var st = pb_state_(e);
  st.q = pb_input_(e, 'q');
  return pb_update_(pb_render_(e, st));
}

function pb_clearSearch(e) {
  var st = pb_state_(e);
  st.q = '';
  return pb_update_(pb_render_(e, st));
}

function pb_more(e) {
  var st = pb_state_(e);
  st.weeks = Math.min(st.weeks + 8, 30);
  return pb_update_(pb_render_(e, st));
}

function pb_file(e) {
  var st = pb_state_(e);
  if (!st.selected.length) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Tick at least one event first.')).build();
  }
  var opts = pb_inputList_(e, 'opts');
  var info = pb_message_(e);
  var res = pb_call_({
    action: 'tag',
    messageId: info.messageId,
    inquiryIds: st.selected,
    followThread: opts.indexOf('follow') >= 0,
    includeThread: opts.indexOf('thread') >= 0,
    fallback: {
      subject: info.subject, from: info.from, to: info.to, cc: info.cc, participants: info.participants,
      date: info.date, root: info.root, bodyHtml: info.bodyHtml, bodyText: info.bodyText,
      attachmentCount: info.attachmentCount
    }
  });
  if (!res.ok) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Not filed: ' + res.error)).build();
  }
  var n = st.selected.length;
  st.justFiled = st.selected.slice();
  st.selected = [];
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('Filed on ' + n + ' event' + (n === 1 ? '' : 's') + '. It shows in the app within a minute.'))
    .setNavigation(CardService.newNavigation().updateCard(pb_render_(e, st)))
    .build();
}

/* ---------- the card ---------- */

function pb_render_(e, st) {
  var info = pb_message_(e);
  var ctx = pb_call_({
    action: 'context', messageId: info.messageId, participants: info.participants,
    subject: info.subject, text: info.bodyText.slice(0, 4000), weeks: st.weeks, selectedIds: st.selected
  });
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('File on an event').setSubtitle(info.subject));

  if (!ctx.ok) {
    card.addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph()
      .setText('<font color="#B3261E"><b>Can\u2019t reach the Premier server.</b></font><br>' + pb_esc_(ctx.error) +
        '<br><br>Check that the web app URL is pasted at the top of Button.gs and that the web app is deployed for everyone at thepremiercaterer.com.')));
    return card.build();
  }

  // Ticked events always sit in one "Selected" list at the top, so a search
  // or "show more weeks" never loses them. They are left out of the lists below.
  var sel = st.selected;
  var notSel = function (items) { return (items || []).filter(function (it) { return sel.indexOf(it.id) < 0; }); };
  var params = { q: st.q || '', weeks: String(st.weeks) };

  if (st.justFiled && st.justFiled.length) {
    card.addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph()
      .setText('<font color="#3F7A44"><b>\u2713 Filed.</b></font> It appears on the event within about a minute.')));
  }
  if (ctx.filedOn && ctx.filedOn.length) {
    var on = CardService.newCardSection().setHeader('Already on');
    ctx.filedOn.forEach(function (it) {
      on.addWidget(CardService.newDecoratedText().setText('\u2713 ' + it.label).setBottomLabel(it.sub).setWrapText(true));
    });
    card.addSection(on);
  }
  if (ctx.selectedItems && ctx.selectedItems.length) {
    card.addSection(CardService.newCardSection().setHeader('Selected (' + ctx.selectedItems.length + ')')
      .addWidget(pb_checks_('ev_sel', '', ctx.selectedItems, true)));
  }

  // Search — every event, past or future
  var search = CardService.newCardSection().setHeader('Find any event \u2014 past or future');
  search.addWidget(CardService.newTextInput().setFieldName('q').setTitle('Search').setHint('Client, event #, venue or date')
    .setValue(st.q || '').setOnChangeAction(CardService.newAction().setFunctionName('pb_search').setParameters(params)));
  var sb = CardService.newButtonSet().addButton(CardService.newTextButton().setText('Search')
    .setOnClickAction(CardService.newAction().setFunctionName('pb_search').setParameters(params)));
  if (st.q) sb.addButton(CardService.newTextButton().setText('Clear')
    .setOnClickAction(CardService.newAction().setFunctionName('pb_clearSearch').setParameters(params)));
  search.addWidget(sb);
  if (st.q) {
    var found = pb_call_({ action: 'search', q: st.q });
    var results = notSel((found.ok && found.results) || []);
    if (results.length) search.addWidget(pb_checks_('ev_r', 'Results', results, false));
    else search.addWidget(CardService.newTextParagraph().setText('No other events match \u201c' + pb_esc_(st.q) + '\u201d.'));
  }
  card.addSection(search);

  var sug = notSel(ctx.suggested);
  if (sug.length) {
    card.addSection(CardService.newCardSection().setHeader('Suggested for this email')
      .addWidget(pb_checks_('ev_s', '', sug, false)));
  }

  (ctx.upcoming || []).forEach(function (w, i) {
    var items = notSel(w.items);
    if (!items.length) return;
    var s = CardService.newCardSection().setHeader(w.label + '  (' + items.length + ')');
    s.addWidget(pb_checks_('ev_w' + i, '', items, false));
    if (i >= 2) s.setCollapsible(true).setNumUncollapsibleWidgets(0);
    card.addSection(s);
  });
  var und = notSel(ctx.undated);
  if (und.length) {
    card.addSection(CardService.newCardSection().setHeader('No date yet').setCollapsible(true).setNumUncollapsibleWidgets(0)
      .addWidget(pb_checks_('ev_u', '', und, false)));
  }
  if ((ctx.weeks || 6) < 30) {
    card.addSection(CardService.newCardSection().addWidget(CardService.newTextButton().setText('Show more weeks')
      .setOnClickAction(CardService.newAction().setFunctionName('pb_more').setParameters(params))));
  }

  card.addSection(CardService.newCardSection().setHeader('Options').addWidget(
    CardService.newSelectionInput().setType(CardService.SelectionInputType.CHECK_BOX).setFieldName('opts')
      .addItem('Also file future replies in this conversation', 'follow', true)
      .addItem('Include the earlier messages in this conversation', 'thread', true)));

  card.setFixedFooter(CardService.newFixedFooter().setPrimaryButton(
    CardService.newTextButton().setText('File on selected events').setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setBackgroundColor(PB_WINE)
      .setOnClickAction(CardService.newAction().setFunctionName('pb_file').setParameters(params))));
  return card.build();
}

function pb_checks_(name, title, items, selected) {
  var w = CardService.newSelectionInput().setType(CardService.SelectionInputType.CHECK_BOX).setFieldName(name);
  if (title) w.setTitle(title);
  items.forEach(function (it) {
    w.addItem(it.label + '  ·  ' + it.sub, it.id, selected.indexOf(it.id) >= 0);
  });
  return w;
}

function pb_update_(card) {
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(card)).build();
}

/* ---------- reading the open email ---------- */

function pb_message_(e) {
  var g = e.gmail || {};
  GmailApp.setCurrentMessageAccessToken(g.accessToken);
  var m = GmailApp.getMessageById(g.messageId);
  var mid = String(m.getHeader('Message-ID') || '').trim().replace(/^<|>$/g, '') || ('gmail:' + m.getId());
  var refs = String(m.getHeader('References') || '').match(/<[^>]+>/g) || [];
  var irt = String(m.getHeader('In-Reply-To') || '').match(/<[^>]+>/);
  var root = (refs.length ? refs[0] : (irt ? irt[0] : '<' + mid + '>')).replace(/^<|>$/g, '');
  var from = pb_one_(m.getFrom());
  var to = pb_list_(m.getTo()), cc = pb_list_(m.getCc());
  var me = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  var participants = [from.email].concat(to.map(function (x) { return x.email; }), cc.map(function (x) { return x.email; }))
    .filter(function (a, i, arr) { return a && arr.indexOf(a) === i && a !== me && !/@thepremiercaterer\.com$/i.test(a); });
  var text = String(m.getPlainBody() || '');
  return {
    messageId: mid, root: root, subject: m.getSubject() || '(no subject)', from: from, to: to, cc: cc,
    participants: participants, date: m.getDate().getTime(),
    bodyText: text, bodyHtml: String(m.getBody() || '').replace(/<script[\s\S]*?<\/script>/gi, ''),
    attachmentCount: m.getAttachments({ includeInlineImages: false }).length
  };
}

function pb_one_(s) {
  s = String(s || '');
  var m = s.match(/[A-Z0-9._%+'\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i);
  var email = m ? m[0].toLowerCase() : '';
  var name = s.replace(/<[^>]*>/, '').replace(/"/g, '').trim();
  if (name.toLowerCase() === email) name = '';
  return { name: name, email: email };
}
function pb_list_(s) {
  s = String(s || '');
  if (!s.trim()) return [];
  return (s.match(/("[^"]*"|[^,])+/g) || []).map(pb_one_).filter(function (x) { return !!x.email; });
}

/* ---------- state carried between clicks ---------- */

// Everything ticked anywhere on the card right now.
function pb_state_(e) {
  var p = (e.commonEventObject && e.commonEventObject.parameters) || e.parameters || {};
  var selected = [];
  var fi = (e.commonEventObject && e.commonEventObject.formInputs) || {};
  Object.keys(fi).forEach(function (k) {
    if (k.indexOf('ev_') !== 0) return;
    ((fi[k].stringInputs && fi[k].stringInputs.value) || []).forEach(function (v) { if (v && selected.indexOf(v) < 0) selected.push(v); });
  });
  if (!Object.keys(fi).length && e.formInputs) {
    Object.keys(e.formInputs).forEach(function (k) {
      if (k.indexOf('ev_') !== 0) return;
      [].concat(e.formInputs[k]).forEach(function (v) { if (v && selected.indexOf(v) < 0) selected.push(v); });
    });
  }
  return { q: p.q || '', weeks: Number(p.weeks) || 6, selected: selected };
}

function pb_input_(e, name) {
  var fi = (e.commonEventObject && e.commonEventObject.formInputs) || {};
  if (fi[name] && fi[name].stringInputs) return String((fi[name].stringInputs.value || [])[0] || '').trim();
  if (e.formInput && e.formInput[name] != null) return String(e.formInput[name]).trim();
  return '';
}
function pb_inputList_(e, name) {
  var fi = (e.commonEventObject && e.commonEventObject.formInputs) || {};
  if (fi[name] && fi[name].stringInputs) return fi[name].stringInputs.value || [];
  if (e.formInputs && e.formInputs[name]) return [].concat(e.formInputs[name]);
  return [];
}

/* ---------- talking to the server half ---------- */

function pb_call_(payload) {
  if (!PB_SERVER_URL || PB_SERVER_URL.indexOf('https://') !== 0) return { ok: false, error: 'The web app URL has not been pasted into Button.gs yet.' };
  try {
    var res = UrlFetchApp.fetch(PB_SERVER_URL, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(payload),
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true, followRedirects: true
    });
    var t = res.getContentText();
    if (t.charAt(0) !== '{') return { ok: false, error: 'The server answered with a web page instead of data (code ' + res.getResponseCode() + ').' };
    return JSON.parse(t);
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

function pb_esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}
