// ============================================================
// PREMIER CATERERS — MENU TEMPLATE AUTOMATION
// File: MenuAutomation.gs
// ============================================================

var PARENT_FOLDER_ID = '1bawWkXr7GLguhGGaQ140VnjysTg-rO8z';

var NOTIFY_EMAILS = [
  'kenny@thepremiercaterer.com',
  'shelley@thepremiercaterer.com'
];

// Every real client email the app sends (menus, proposals, follow-ups) is
// silently BCC'd here, so you always have a copy in your own inbox — no matter
// which account the app sends as. Texts and print jobs are skipped automatically.
var BCC_ON_SENDS = 'kenny@thepremiercaterer.com';

var TEMPLATES = {
  1:  { id: '1ohJr6bpoL56OD8TriPd0oib86YjZ6aL0_iDGQzz3gXQ', name: 'Drop off catering worksheet', type: 'sheet' },
  2:  { id: '19FKDgMrefka9PTaIvHSwMZ2-r6BpD8j4N0MK_KgI3yw',  name: 'Sample breakfast menu',       type: 'doc'   },
  3:  { id: '11qnF5WWfEI_roywzr7llS55amy14HTqoE_ciFhYLKMA',  name: 'Sample buffet menus',         type: 'doc'   },
  4:  { id: '1JENSh6SDKOKVV7t_iB3Zx1MVV61LW6Qrbh6iIQDeI0Q', name: 'Sample brunch menu',          type: 'doc'   },
  5:  { id: '1VO7waNuW5QcQtKvybdfhMMs5uuqPo9zg4c0PmyVcWoU', name: 'Conference menu template',    type: 'doc'   },
  6:  { id: '1Eel6oK7fAYHJXxCTpAc7XaxMxGfxSfmJO2NZlKOkCVs', name: 'Bris menu',                  type: 'doc'   },
  7:  { id: '1UQUOr1WYnrWQXXGuRElV1Q_TMCrZKKROUWduUNMzk50', name: 'Sample wedding template',     type: 'doc'   },
  8:  { id: '1awA0dSMnBXPexbo-jBTSPL7geAvYQXX-l0wMhnZDZwA', name: 'Shabbos meals and kiddush',   type: 'doc'   },
  9:  { id: '1tsAmWUCMUFkJ5VB4PsFFbARM0mSvUmtdGh64iOaC_48', name: 'Sample engagement party',     type: 'doc'   },
  10: { id: '1bYfbtUTbpuICMw7gkfGzIZfUDfaUGKGkL0tzpLBIcac', name: 'Sample shalosh seudah',       type: 'doc'   }
};

var TEMPLATE_MAP = {
  'Bar Mitzvah:Yes':   [8, 10],
  'Bar Mitzvah:No':    [3, 4],
  'Bar Mitzvah:Both':  [3, 4, 8, 10],
  'Bat Mitzvah:Yes':   [8, 10],
  'Bat Mitzvah:No':    [3, 4],
  'Bat Mitzvah:Both':  [3, 4, 8, 10],
  'Wedding:No':        [7],
  'Kiddush:Yes':       [8],
  'Aufruf':            [8],
  'Bris:Yes':          [8],
  'Bris:No':           [6],
  'Sheva Brachos:Yes': [8, 10],
  'Sheva Brachos:No':  [3],
  'Vort:No':           [9],
  'Shloshim:No':       [3],
  'Corporate:No':      [5],
  'Drop off catering': [1],
  'Breakfast':         [2],
  'Brunch':            [4]
};


// ── ENTRY POINTS ─────────────────────────────────────────────

function doPost(e) {
  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  try { var _b = JSON.parse(e.postData.contents); if (_b && _b.action === 'gmailSend') return _pcJson(pcGmailSend_(_b)); } catch (_err) {}
  try { var _b2 = JSON.parse(e.postData.contents); if (_b2 && _b2.action === 'parseInvoice') return _pcJson(pcParseInvoice_(_b2)); } catch (_err) {}
  try { var _b3 = JSON.parse(e.postData.contents); if (_b3 && _b3.action === 'aiParseInquiry') return _pcJson(pcAiParseInquiry_(_b3)); } catch (_err) {}
  try {
    var data = JSON.parse(e.postData.contents);
    var result = processInquiry(data);
    output.setContent(JSON.stringify({ success: true, result: result }));
  } catch(err) {
    Logger.log('doPost error: ' + err.message);
    output.setContent(JSON.stringify({ success: false, error: err.message }));
  }
  return output;
}

function doGet(e) {
    // Old app tabs (before Oct 1) ask for 200 emails every 2 minutes, which
  // used up events@'s daily Gmail allowance. Answer them without touching Gmail.
  var _p = (e && e.parameter) || {};
  if (_p.action === 'gmailList' && String(_p.max) === '100' && (_p.q === 'in:inbox' || _p.q === 'in:sent')) {
    return ContentService.createTextOutput(JSON.stringify({ ok: true, messages: [] })).setMimeType(ContentService.MimeType.JSON);
  }
  var params = e && e.parameter ? e.parameter : {};
  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  if (params.action === 'followupAction') return pcFollowupAction_(params);
  if (params.action === 'processFollowups') return _pcJson(pcProcessFollowupReminders_());
  if (params.action === 'followupApi') return pcFollowupApi_(params);
  if (params.action === 'gmailList')    return _pcJson(pcGmailList_(params.q, params.max));
  if (params.action === 'gmailGet')     return _pcJson(pcGmailGet_(params.id));
  if (params.action === 'gmailProfile') return _pcJson(pcGmailProfile_());
  if (params.action === 'smsSend')     return _pcJson(pcAlloSms_(params.to, params.body));
  if (params.action === 'calAdd')      return _pcJson(pcCalAdd_(params));
  if (params.action === 'calMark')     return _pcJson(pcCalMark_(params));
  if (params.action === 'aiSummarizeClient') return _pcJson(pcAiSummarizeClient_(params));
  if (params.action === 'generateSuggestions') return _pcJson(pcGenerateFollowupSuggestions_());
  // Make the automatic menu(s) for ONE inquiry right now — the app calls this the
  // moment a lead is saved. Same templates + email as the 5-minute timer; the
  // timer stays as the backup and the two can never make the same menus twice.
  if (params.action === 'makeMenusNow') return _pcJson(pcMakeMenusNow_(params.id));

if (params.action === 'generateGrocery') return _pcJson(pcGroceryGenerate_(params));
if (params.action === 'menuGrocery') return pcgMenuGroceryPage_(params);

  // Manually create ONE menu from a chosen template (overrides auto event-type pick).
  // Params: action=copyOneTemplate, templateNum, plus client fields (organization,
  // firstName, lastName, eventType, eventDate, shabbos, guests, venue, etc.)
  if (params.action === 'copyOneTemplate') {
    try {
      var num  = parseInt(params.templateNum, 10);
      var tmpl = TEMPLATES[num];
      if (!tmpl) throw new Error('Unknown template number: ' + params.templateNum);
      var year       = getEventYear(params.eventDate || '');
      var yearFolder = getOrCreateYearFolder(year);
      var fileLabel  = buildFileLabel(params.organization, params.lastName, params.firstName, params.eventType, params.eventDate);
      var copied = copyTemplate(tmpl, fileLabel, yearFolder, params);
      output.setContent(JSON.stringify({ success: true, templateNum: num, name: tmpl.name,
        title: copied.title, url: copied.url, fileId: copied.fileId, type: tmpl.type }));
    } catch(err) {
      Logger.log('copyOneTemplate error: ' + err.message);
      output.setContent(JSON.stringify({ success: false, error: err.message }));
    }
    return output;
  }
  // Return the list of available templates (for the manual picker in the app)
  if (params.action === 'listTemplates') {
    var list = [];
    for (var k in TEMPLATES) { if (TEMPLATES.hasOwnProperty(k)) list.push({ num: parseInt(k,10), name: TEMPLATES[k].name, type: TEMPLATES[k].type }); }
    list.sort(function(a,b){ return a.num - b.num; });
    output.setContent(JSON.stringify({ success: true, templates: list }));
    return output;
  }

  // Handle PDF export request — accepts fileId or docUrl
  if (params.action === 'getPdf') {
    try {
      var fileId = params.fileId || '';
      if (!fileId && params.docUrl) {
        var match = decodeURIComponent(params.docUrl).match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match) fileId = match[1];
      }
      if (!fileId) throw new Error('No file ID provided');
      var pdfBlob = DriveApp.getFileById(fileId).getAs('application/pdf');
      var pdfBase64 = Utilities.base64Encode(pdfBlob.getBytes());
      output.setContent(JSON.stringify({ success: true, pdfBase64: pdfBase64 }));
    } catch(err) {
      Logger.log('getPdf error: ' + err.message);
      output.setContent(JSON.stringify({ success: false, error: err.message }));
    }
    return output;
  }

  // Handle file deletion from Drive
  if (params.action === 'deleteFile' && params.fileId) {
    try {
      var result = deleteFileFromDrive(params.fileId);
      output.setContent(JSON.stringify({ success: true, result: result }));
    } catch(err) {
      Logger.log('deleteFile error: ' + err.message);
      output.setContent(JSON.stringify({ success: false, error: err.message }));
    }

    return output;
  }
  // Handle getting document text for AI grocery generator
  if (params.action === 'getDocText' && params.fileId) {
    try {
      var doc = DocumentApp.openById(params.fileId);
      output.setContent(JSON.stringify({ success: true, text: doc.getBody().getText() }));
    } catch(err) {
      Logger.log('getDocText error: ' + err.message);
      output.setContent(JSON.stringify({ success: false, error: err.message, text: '' }));
    }
    return output;
  }

  // Handle direct menu email sending (avoids CORS PDF transfer)
  if (params.action === 'sendMenuEmail') {
    try {
      var result = sendMenuEmailDirect(params);
      output.setContent(JSON.stringify({ success: true, result: result }));
    } catch(err) {
      Logger.log('sendMenuEmail error: ' + err.message);
      output.setContent(JSON.stringify({ success: false, error: err.message }));
    }
    return output;
  }

  // Handle inquiry data
  if (params.data) {
    try {
      var data = JSON.parse(decodeURIComponent(params.data));
      var result = processInquiry(data);
      output.setContent(JSON.stringify({ success: true, result: result }));
    } catch(err) {
      output.setContent(JSON.stringify({ success: false, error: err.message }));
    }
    return output;
  }

  output.setContent(JSON.stringify({ status: 'Menu Automation running' }));
  return output;
}


// ── MAIN ─────────────────────────────────────────────────────

function processInquiry(data) {
  var eventType = data.eventType || '';
  var shabbos   = data.shabbos   || 'No';

  var templateNums = TEMPLATE_MAP[eventType + ':' + shabbos]
                  || TEMPLATE_MAP[eventType]
                  || [];

  if (templateNums.length === 0) {
    return { templatesCopied: [], message: 'No templates for this event type' };
  }

  var year       = getEventYear(data.eventDate);
  var yearFolder = getOrCreateYearFolder(year);
  var fileLabel  = buildFileLabel(data.organization, data.lastName, data.firstName, eventType, data.eventDate);

  var copiedFiles = [];
  var multi = templateNums.length > 1;
  for (var i = 0; i < templateNums.length; i++) {
    var num  = templateNums[i];
    var tmpl = TEMPLATES[num];
    if (!tmpl) continue;
    try {
      var copied = copyTemplate(tmpl, fileLabel, yearFolder, data, multi ? cleanTemplateTag(tmpl.name) : '');
      copiedFiles.push({ templateNum: num, name: tmpl.name, title: copied.title, url: copied.url, fileId: copied.fileId, type: tmpl.type });
      Logger.log('Copied template ' + num + ': ' + copied.title);
    } catch(err) {
      Logger.log('Error copying template ' + num + ': ' + err.message);
    }
  }

  if (copiedFiles.length > 0) {
    // The menus are already copied — a failed email (e.g. the daily Gmail allowance
    // ran out) must not stop the links being written back to the card.
    try { sendNotificationEmail(data, copiedFiles, year); }
    catch (mailErr) { Logger.log('Notification email failed (menus still created): ' + mailErr.message); }
  }

  return { templatesCopied: copiedFiles, yearFolder: year, fileLabel: fileLabel };
}


// ── COPY & FILL ───────────────────────────────────────────────

function copyTemplate(tmpl, fileLabel, yearFolder, clientData, tag) {
  var base = fileLabel + (tag ? ' — ' + tag : '');
  var newTitle = uniqueTitleInFolder(yearFolder, base);
  var sourceFile = DriveApp.getFileById(tmpl.id);
  var newFile   = sourceFile.makeCopy(newTitle, yearFolder);
  var url = '';

  if (tmpl.type === 'doc') {
    url = 'https://docs.google.com/document/d/' + newFile.getId() + '/edit';
    fillDocPlaceholders(newFile.getId(), clientData);
  } else if (tmpl.type === 'sheet') {
    url = 'https://docs.google.com/spreadsheets/d/' + newFile.getId() + '/edit';
    addClientInfoToSheet(newFile.getId(), clientData);
  }

  return { title: newTitle, url: url, fileId: newFile.getId() };
}

function fillDocPlaceholders(docId, d) {
  var doc  = DocumentApp.openById(docId);
  var body = doc.getBody();

  var plannerLine = d.plannerName || 'N/A';

  var replacements = [
    ['{{Event Name}}',                       d.eventName || (((d.organization||'').trim() || (d.firstName + ' ' + d.lastName)) + ' ' + d.eventType)],
    ['{{Event Type Of Events}}',             d.eventType || ''],
    ['{{Event Date Of Event}}',              formatDateNice(d.eventDate)],
    ['{{Contact # Of Guests}}',              d.guestCount || ''],
    ['{{Event Venue Name}}',                 d.venueName || ''],
    ['{{Event Venue Location}}',             d.venueLocation || ''],
    ['{{Contact First Name}}',               d.firstName || ''],
    ['{{Contact Last Name}}',                d.lastName || ''],
    ['{{Contact Email}}',                    d.email || ''],
    ['{{Contact Phone Number}}',             formatPhone(d.phone)],
    ['{{Event Who Is Your Party Planner?}}', plannerLine],
    ['{{Event Questions / Comments}}',       d.comments || '']
  ];

  // Build escaped patterns once
  var patterns = replacements.map(function(r) {
    return r[0]
      .replace(/\\/g, '\\\\')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\?/g, '\\?')
      .replace(/\./g, '\\.')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  });

  // Replace in body
  for (var i = 0; i < replacements.length; i++) {
    try { body.replaceText(patterns[i], replacements[i][1]); }
    catch(err) { Logger.log('Body replaceText error for "' + replacements[i][0] + '": ' + err.message); }
  }

  // Replace in header (this is where the placeholders live)
  try {
    var header = doc.getHeader();
    if (header) {
      for (var j = 0; j < replacements.length; j++) {
        try { header.replaceText(patterns[j], replacements[j][1]); }
        catch(err) { Logger.log('Header replaceText error for "' + replacements[j][0] + '": ' + err.message); }
      }
    }
  } catch(err) {
    Logger.log('Header access error: ' + err.message);
  }

  // Replace in footer too just in case
  try {
    var footer = doc.getFooter();
    if (footer) {
      for (var k = 0; k < replacements.length; k++) {
        try { footer.replaceText(patterns[k], replacements[k][1]); }
        catch(err) {}
      }
    }
  } catch(err) {}

  doc.saveAndClose();
}

function addClientInfoToSheet(sheetId, d) {
  try {
    var ss    = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheets()[0];

    sheet.insertRowBefore(1);
    sheet.insertRowBefore(1);

    var infoText = 'CLIENT: ' + d.firstName + ' ' + d.lastName
      + '  |  EVENT: ' + d.eventType
      + '  |  DATE: ' + formatDateNice(d.eventDate)
      + '  |  GUESTS: ' + (d.guestCount || 'TBD')
      + '  |  VENUE: ' + (d.venueName || 'TBD')
      + '  |  PHONE: ' + (d.phone || '')
      + '  |  EMAIL: ' + (d.email || '');

    var lastCol = Math.max(sheet.getLastColumn(), 6);
    sheet.getRange(1, 1, 1, lastCol).merge()
         .setValue('Premier Caterers — Drop Off Catering')
         .setFontWeight('bold').setFontSize(12)
         .setBackground('#8B1A1A').setFontColor('#FFFFFF');
    sheet.getRange(2, 1, 1, lastCol).merge()
         .setValue(infoText)
         .setFontSize(10).setBackground('#FFF3F3');

    SpreadsheetApp.flush();
  } catch(err) {
    Logger.log('Sheet client info error: ' + err.message);
  }
}


// ── EMAIL ─────────────────────────────────────────────────────

function sendNotificationEmail(d, copiedFiles, year) {
  var org = (d.organization||'').trim();
  var clientName = org || (d.firstName + ' ' + d.lastName).trim();
  var contactName = org ? (d.firstName + ' ' + d.lastName).trim() : '';
  var eventDate  = formatDateNice(d.eventDate);
  var subject    = 'New Inquiry: ' + clientName + ' — ' + (d.eventType || '') + ' (' + eventDate + ')';

  var fileLinks = copiedFiles.map(function(f) {
    return '<li><a href="' + f.url + '">' + f.title + '</a></li>';
  }).join('');

  var htmlBody = '<div style="font-family:Arial,sans-serif;max-width:600px">'
    + '<div style="background:#8B1A1A;padding:16px 20px;border-radius:6px 6px 0 0">'
    + '<h2 style="color:#fff;margin:0;font-size:18px">New Client Inquiry — Premier Caterers</h2></div>'
    + '<div style="background:#fff;border:1px solid #ddd;padding:20px;border-radius:0 0 6px 6px">'
    + '<table style="width:100%;border-collapse:collapse;font-size:14px">'
    + erow('Client',       clientName)
    + (contactName ? erow('Contact', contactName) : '')
    + erow('Event type',   (d.eventType||'') + (d.shabbos ? ' — ' + d.shabbos : ''))
    + erow('Event date',   eventDate)
    + erow('Guests',       d.guestCount || 'TBD')
    + erow('Venue',        (d.venueName||'') + (d.venueLocation ? ', ' + d.venueLocation : ''))
    + erow('Phone',        d.phone || '')
    + erow('Email',        d.email || '')
    + (d.plannerName ? erow('Party planner', d.plannerName) : '')
    + (d.comments ? erow('Notes',         d.comments)    : '')
    + '</table>'
    + '<hr style="border:none;border-top:1px solid #eee;margin:20px 0">'
    + '<h3 style="color:#8B1A1A;margin:0 0 10px">Menu Templates Copied (' + year + ')</h3>'
    + '<ul style="margin:0;padding-left:20px;font-size:14px">' + fileLinks + '</ul>'
    + '<p style="margin:20px 0 0;font-size:12px;color:#999">Automated notification from Premier Caterers Operations App.</p>'
    + '</div></div>';

  var plainBody = 'New Inquiry: ' + clientName + '\nEvent: ' + (d.eventType||'')
    + '\nDate: ' + eventDate + '\nGuests: ' + (d.guestCount||'TBD')
    + '\nVenue: ' + (d.venueName||'') + '\nPhone: ' + (d.phone||'') + '\nEmail: ' + (d.email||'')
    + '\n\nTemplates copied:\n'
    + copiedFiles.map(function(f){ return '- ' + f.title + '\n  ' + f.url; }).join('\n');

  NOTIFY_EMAILS.forEach(function(recipient) {
    try {
      MailApp.sendEmail({ to: recipient, subject: subject, body: plainBody, htmlBody: htmlBody });
    } catch(err) {
      Logger.log('Email error to ' + recipient + ': ' + err.message);
    }
  });
}

function erow(label, value) {
  if (!value) return '';
  return '<tr>'
    + '<td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top">' + label + '</td>'
    + '<td style="padding:6px 0;font-weight:500;color:#222">' + value + '</td>'
    + '</tr>';
}


// ── HELPERS ──────────────────────────────────────────────────

function getOrCreateYearFolder(year) {
  var parent   = DriveApp.getFolderById(PARENT_FOLDER_ID);
  var name     = 'Client Menus ' + year;
  var existing = parent.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : parent.createFolder(name);
}

function getEventYear(dateStr) {
  if (!dateStr) return new Date().getFullYear();
  var parts = dateStr.split('-');
  return parts[0] ? parseInt(parts[0]) : new Date().getFullYear();
}

function buildFileLabel(organization, lastName, firstName, eventType, dateStr) {
  var org = (organization || '').trim();
  var name = org || (lastName || firstName || 'Client').trim();
  var date = formatDateSlash(dateStr);
  return name + ' ' + (eventType || 'Event') + (date ? ' (' + date + ')' : '');
}

function formatDateNice(dateStr) {
  if (!dateStr) return '';
  try {
    var parts  = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10), d = parseInt(parts[2], 10);
    var dow = days[new Date(y, m - 1, d).getDay()];
    return dow + ', ' + months[m - 1] + ' ' + d + ', ' + y;
  } catch(e) { return dateStr; }
}

// Short m/d/yy format used for the menu FILE name (e.g. 6/6/27)
function formatDateSlash(dateStr) {
  if (!dateStr) return '';
  try {
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return parseInt(parts[1], 10) + '/' + parseInt(parts[2], 10) + '/' + parts[0].slice(-2);
  } catch(e) { return dateStr; }
}

// Format a phone number as (xxx) xxx-xxxx when it has 10 digits (or 11 starting
// with a 1). Anything else is left exactly as entered.
function formatPhone(p) {
  var digits = String(p || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
  if (digits.length !== 10) return String(p || '');
  return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
}

// When several menus are made for one event, this short label keeps their
// file names distinct (e.g. "Buffet menus", "Shabbos meals and kiddush").
function cleanTemplateTag(name) {
  var t = String(name || '').replace(/^Sample\s+/i, '').replace(/\s+(template|worksheet)$/i, '').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Guarantees no two files in the same folder share an identical name.
function uniqueTitleInFolder(folder, title) {
  try {
    if (!folder.getFilesByName(title).hasNext()) return title;
    var n = 2;
    while (folder.getFilesByName(title + ' (' + n + ')').hasNext()) { n++; if (n > 50) break; }
    return title + ' (' + n + ')';
  } catch(e) { return title; }
}




// ── SEND MENU EMAIL (called from app via GET) ─────────────────
// Instead of sending PDF base64 back to browser (CORS issues),
// the Apps Script sends the email directly from the server side.

function sendMenuEmailDirect(params) {
  var fileId     = params.fileId || '';
  var toEmail    = params.to || '';
  var subject    = decodeURIComponent(params.subject || '');
  var body       = decodeURIComponent(params.body || '');
  var fileName   = decodeURIComponent(params.fileName || 'Menu');

  if (!fileId || !toEmail) throw new Error('Missing fileId or to email');

  // Get PDF from Drive
  var pdfBlob = DriveApp.getFileById(fileId).getAs('application/pdf');
  pdfBlob.setName(fileName + '.pdf');

  // Send email with PDF attached
  var _opts = {
    from: 'events@thepremiercaterer.com',
    replyTo: 'events@thepremiercaterer.com',
    subject: subject,
    body: body,
    attachments: [pdfBlob]
  };
  if (_pcShouldBcc(toEmail)) _opts.bcc = BCC_ON_SENDS;   // keep a copy in Kenny's inbox
  _opts.to = toEmail;
  MailApp.sendEmail(_opts);

  return { sent: true, to: toEmail };
}


// ── TEST ─────────────────────────────────────────────────────

function testWithSampleData() {
  var sample = {
    firstName: 'Sarah', lastName: 'Cohen',
    email: 'sarah@example.com', phone: '(201) 555-1234',
    eventName: 'Cohen Bar Mitzvah', eventType: 'Bar Mitzvah', shabbos: 'No',
    eventDate: '2026-09-12', guestCount: '150',
    venueName: 'Congregation Beth Sholom', venueLocation: '123 Main St, Teaneck NJ',
    plannerName: '', comments: 'Prefer to speak after 6pm'
  };
  var result = processInquiry(sample);
  Logger.log('Result: ' + JSON.stringify(result));
}


// ── DIAGNOSTIC — run this to see what's in the doc ───────────
// Paste one of the COPIED doc IDs below and run this function
// to see exactly what text the script can find

function diagnosePlaceholders() {
  // PASTE A COPIED DOC ID HERE (from one of the test copies in Drive)
  var docId = 'PASTE_COPIED_DOC_ID_HERE';

  var doc  = DocumentApp.openById(docId);
  var body = doc.getBody();
  var text = body.getText();

  // Log the full text so we can see exactly what's there
  Logger.log('=== FULL BODY TEXT (first 1000 chars) ===');
  Logger.log(text.substring(0, 1000));

  // Also log header text
  try {
    var header = doc.getHeader();
    if (header) {
      Logger.log('=== HEADER TEXT ===');
      Logger.log(header.getText());
    } else {
      Logger.log('=== NO HEADER FOUND ===');
    }
  } catch(err) {
    Logger.log('Header error: ' + err.message);
  }

  // Try to find each placeholder
  var placeholders = [
    '{{Event Name}}',
    '{{Event Type Of Events}}',
    '{{Event Date Of Event}}',
    '{{Contact # Of Guests}}',
    '{{Event Venue Name}}',
    '{{Event Venue Location}}',
    '{{Contact First Name}}',
    '{{Contact Last Name}}',
    '{{Contact Email}}',
    '{{Contact Phone Number}}',
    '{{Event Who Is Your Party Planner?}}',
    '{{Event Questions / Comments}}'
  ];

  Logger.log('=== PLACEHOLDER SEARCH RESULTS ===');
  placeholders.forEach(function(p) {
    var found = text.indexOf(p) !== -1;
    Logger.log((found ? 'FOUND' : 'NOT FOUND') + ': ' + p);

    // Also try without braces to see if the inner text is there
    var inner = p.replace(/\{\{|\}\}/g, '');
    var foundInner = text.indexOf(inner) !== -1;
    Logger.log('  Inner text "' + inner + '": ' + (foundInner ? 'FOUND' : 'NOT FOUND'));
  });

  // Try a test replacement on just one placeholder
  Logger.log('=== TESTING replaceText ===');
  try {
    var pattern = '\\{\\{Event Date Of Event\\}\\}';
    body.replaceText(pattern, 'TEST_DATE_REPLACED');
    doc.saveAndClose();
    Logger.log('replaceText ran without error — check the doc to see if it worked');
  } catch(err) {
    Logger.log('replaceText ERROR: ' + err.message);
  }
}


// ── DELETE FILE FROM DRIVE ────────────────────────────────────
// Called by the app when user deletes a menu doc from the client card

function deleteFileFromDrive(fileId) {
  if (!fileId) throw new Error('No file ID provided');
  DriveApp.getFileById(fileId).setTrashed(true);
  return { deleted: true, fileId: fileId };
}


// ── AUTO-PROCESS NEW INQUIRIES ───────────────────────────────
// This function runs on a time trigger every 5 minutes.
// It checks Firebase for new inquiries that haven't had a menu
// created yet, and runs the menu automation on them.
//
// IMPORTANT (changed): it now processes EVERY new inquiry that has
// an event type, no matter how it was added (website form, the
// "Add inquiry" button on the pipeline, or any future add path).
// Each one is marked done after, so a menu is never created twice.
//
// Setup: Apps Script → Triggers → Add trigger → processNewWebsiteInquiries
//        → Time-driven → Minutes timer → Every 5 minutes

function processNewWebsiteInquiries() {
  var firebaseUrl = 'https://premier-caterers-internal-app-default-rtdb.firebaseio.com/';

  // Use Firestore REST API to query unprocessed inquiries
  var projectId = 'premier-caterers-internal-app';
  var token = ScriptApp.getOAuthToken();

  // Query Firestore for inquiries where menuAutomationTriggered != true
 // Only fetch inquiries that HAVEN'T been processed yet. Uses Firestore's
  // structured query so we don't download the whole collection every minute.
  var queryUrl = 'https://firestore.googleapis.com/v1/projects/' + projectId
    + '/databases/(default)/documents:runQuery';

  var response = UrlFetchApp.fetch(queryUrl, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    payload: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'inquiries' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'menuAutomationTriggered' },
            op: 'EQUAL',
            value: { booleanValue: false }
          }
        }
      }
    }),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    Logger.log('Firestore fetch error: ' + response.getContentText());
    return;
  }

  var data = JSON.parse(response.getContentText());
  // runQuery returns an array of {document:{...}} objects, not {documents:[...]}.
  var documents = (data || []).map(function(row){ return row.document; }).filter(Boolean);

  var processed = 0;

  documents.forEach(function(doc) {
    // Claim-then-make: the instant 'makeMenusNow' request and this timer both go
    // through _pcMakeMenusFor_, which only proceeds if it wins the claim.
    var r = _pcMakeMenusFor_(doc, token);
    if (r && r.made) processed++;
  });

  Logger.log('processNewWebsiteInquiries: checked ' + documents.length + ' inquiries, processed ' + processed);
}


// ── MAKE MENUS: shared by the 5-minute timer and the instant request ─────

var PC_FS_PROJECT_ = 'premier-caterers-internal-app';

function _pcInquiryFromFields_(fields) {
  function str(key){ return (fields[key] && fields[key].stringValue) || ''; }
  return {
    id:            str('id'),
    firstName:     str('firstName'),
    lastName:      str('lastName'),
    organization:  str('organization'),
    email:         str('email'),
    phone:         str('phone'),
    eventName:     str('eventName'),
    eventType:     str('eventType'),
    shabbos:       str('shabbos'),
    eventDate:     str('eventDate'),
    guestCount:    str('guestCount'),
    venueName:     str('venueName'),
    venueLocation: str('venueLocation'),
    plannerName:   str('plannerName'),
    comments:      str('comments')
  };
}

// Set menuAutomationTriggered on a doc. With requireUpdateTime, the write only
// succeeds if nobody changed the doc since it was read — that is the "claim".
function _pcSetTriggered_(docName, value, token, requireUpdateTime) {
  var url = 'https://firestore.googleapis.com/v1/' + docName
    + '?updateMask.fieldPaths=menuAutomationTriggered'
    + (requireUpdateTime ? '&currentDocument.updateTime=' + encodeURIComponent(requireUpdateTime) : '');
  var res = UrlFetchApp.fetch(url, {
    method: 'PATCH',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    payload: JSON.stringify({ fields: { menuAutomationTriggered: { booleanValue: value } } }),
    muteHttpExceptions: true
  });
  return res.getResponseCode() === 200;
}

// Claim one inquiry, make its menus, write the links back. Returns
// { made, skipped, menus }. Never makes menus for an inquiry another run claimed.
function _pcMakeMenusFor_(doc, token) {
  var fields = doc.fields || {};
  var triggered = (fields.menuAutomationTriggered && fields.menuAutomationTriggered.booleanValue) || false;
  if (triggered) return { made: false, skipped: 'already done' };

  var inquiry = _pcInquiryFromFields_(fields);
  if (!inquiry.eventType) return { made: false, skipped: 'no event type' };

  // Claim it first. If the timer and the instant request arrive together,
  // only one claim succeeds; the other sees the doc changed and backs off.
  if (!_pcSetTriggered_(doc.name, true, token, doc.updateTime)) {
    return { made: false, skipped: 'claimed by another run' };
  }

  Logger.log('Processing inquiry: ' + inquiry.firstName + ' ' + inquiry.lastName + ' (' + inquiry.eventType + ')');
  try {
    var menuResult = processInquiry(inquiry);
    var created = (menuResult && menuResult.templatesCopied) || [];

    // Same shape the app's client card reads: [{ name, url, fileId }].
    // Keep any menus already on the record and append the new ones.
    var existingMenus = (fields.menus && fields.menus.arrayValue && fields.menus.arrayValue.values) || [];
    var newMenuValues = created.map(function(f){
      return { mapValue: { fields: {
        name:   { stringValue: f.name  || 'Menu' },
        url:    { stringValue: f.url   || '' },
        fileId: { stringValue: f.fileId|| '' }
      }}};
    });
    var allMenuValues = existingMenus.concat(newMenuValues);
    var firstUrl = '';
    if (allMenuValues.length) {
      var fv = allMenuValues[0];
      firstUrl = (fv.mapValue && fv.mapValue.fields && fv.mapValue.fields.url && fv.mapValue.fields.url.stringValue) || '';
    }

    UrlFetchApp.fetch('https://firestore.googleapis.com/v1/' + doc.name
      + '?updateMask.fieldPaths=menuAutomationTriggered'
      + '&updateMask.fieldPaths=menus'
      + '&updateMask.fieldPaths=menuLink', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ fields: {
        menuAutomationTriggered: { booleanValue: true },
        menus:    { arrayValue: { values: allMenuValues } },
        menuLink: { stringValue: firstUrl }
      }}),
      muteHttpExceptions: true
    });

    Logger.log('Done processing: ' + inquiry.firstName + ' ' + inquiry.lastName + ' — wrote ' + newMenuValues.length + ' menu link(s) to the card');
    return { made: true, menus: created.map(function(f){ return { name: f.name, url: f.url, fileId: f.fileId }; }) };
  } catch (err) {
    // Hand it back so the next timer run tries again, exactly as before.
    Logger.log('Error processing inquiry ' + inquiry.id + ': ' + err.message);
    try { _pcSetTriggered_(doc.name, false, token, null); } catch (_e) {}
    return { made: false, skipped: 'error: ' + err.message };
  }
}

// Instant request from the app: ?action=makeMenusNow&id=<inquiry id>
function pcMakeMenusNow_(id) {
  if (!id || !/^[A-Za-z0-9_-]{1,80}$/.test(String(id))) return { success: false, error: 'Missing or invalid id' };
  var token = ScriptApp.getOAuthToken();
  var name = 'projects/' + PC_FS_PROJECT_ + '/databases/(default)/documents/inquiries/' + id;
  var res = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/' + name, {
    headers: { 'Authorization': 'Bearer ' + token }, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) return { success: false, error: 'Inquiry not found (' + res.getResponseCode() + ')' };
  var doc = JSON.parse(res.getContentText());
  var f = doc.fields || {};
  // Only inquiries the timer would also pick up (flag explicitly false).
  if (!(f.menuAutomationTriggered && f.menuAutomationTriggered.booleanValue === false)) {
    return { success: true, made: false, skipped: 'already done' };
  }
  var r = _pcMakeMenusFor_(doc, token);
  return { success: true, made: !!r.made, skipped: r.skipped || '', menus: r.menus || [] };
}


// ── SETUP TRIGGER (run this once manually) ───────────────────
// Run this function ONCE to create the every-minute trigger automatically

function createTimeTrigger() {
  // Delete any existing triggers for processNewWebsiteInquiries
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'processNewWebsiteInquiries') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // Create new every-minute trigger
  ScriptApp.newTrigger('processNewWebsiteInquiries')
    .timeBased()
    .everyMinutes(1)
    .create();
  Logger.log('Trigger created — processNewWebsiteInquiries will run every minute');
}

function getMenuPdf(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    var blob;
    try { blob = file.getAs('application/pdf'); }   // Google Doc/Sheet/Slides
    catch (err) { blob = file.getBlob(); }           // already a PDF
    var b64 = Utilities.base64Encode(blob.getBytes());
    return ContentService.createTextOutput(JSON.stringify({ success: true, base64: b64 }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: String(e) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function _pcJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GOOGLE CALENDAR SYNC ─────────────────────────────────────
// Called by the app (GET). Writes to your DEFAULT Google Calendar, running as
// the script owner — so no browser permission is needed.
//   calAdd  -> creates an all-day event, returns its id (app stores it as gcalId)
//   calMark -> recolors / annotates an existing event (e.g. when booked)
// Colors the app uses: 5 = banana/yellow (menu sent), 9 = blueberry/blue (booked).
function pcCalAdd_(p){
  try{
    if(!p || !p.date) return { success:false, error:'Missing date' };
    var parts = String(p.date).split('-');
    if(parts.length !== 3) return { success:false, error:'Bad date: '+p.date };
    var d = new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1, parseInt(parts[2],10));
    var cal = CalendarApp.getDefaultCalendar();
    var ev = cal.createAllDayEvent(p.title || 'Event', d, { description: p.notes || '' });
    if(p.color){ try{ ev.setColor(String(p.color)); }catch(e){} }
    return { success:true, eventId: ev.getId() };
  }catch(e){ return { success:false, error:String(e) }; }
}
function pcCalMark_(p){
  try{
    if(!p || !p.eventId) return { success:false, error:'Missing eventId' };
    var cal = CalendarApp.getDefaultCalendar();
    var ev = cal.getEventById(p.eventId);
    if(!ev) return { success:false, error:'Calendar event not found' };
    if(p.color){ try{ ev.setColor(String(p.color)); }catch(e){} }
    if(p.note){ var desc = ev.getDescription() || ''; ev.setDescription(desc ? (desc + '\n' + p.note) : p.note); }
    return { success:true };
  }catch(e){ return { success:false, error:String(e) }; }
}

// Decide whether a given recipient should get a silent BCC copy to Kenny.
// We BCC real, human client emails — but NEVER texts (carrier SMS gateways)
// or the office printer, whose addresses are all DIGITS before the @
// (e.g. 2015551234@vtext.com, 47515733707@print.brother.com).
function _pcShouldBcc(to) {
  to = String(to || '').trim().toLowerCase();
  if (!to) return false;
  if (to.indexOf('@') === -1) return false;
  if (to.indexOf('print.brother.com') !== -1) return false;   // office printer
  var local = to.split('@')[0] || '';
  if (/^[0-9]+$/.test(local)) return false;                   // SMS gateway (all-digit address)
  if (to === BCC_ON_SENDS) return false;                      // already going to Kenny — don't double
  return true;
}

// Who is sending (the script owner — events@thepremiercaterer.com)
function pcGmailProfile_() {
  return { ok: true, email: Session.getEffectiveUser().getEmail() };
}

// Send an email (with optional PDF/file attachments)
function pcGmailSend_(b) {
  try {
    var opts = {
      name: 'Premier Caterers',
      htmlBody: b.htmlBody || b.body || ''
    };
    if (b.attachments && b.attachments.length) {
      opts.attachments = b.attachments.map(function (a) {
        return Utilities.newBlob(
          Utilities.base64Decode(a.base64),
          a.mimeType || 'application/pdf',
          a.filename || 'attachment.pdf'
        );
      });
    }
    // Keep a copy of every real client email in Kenny's inbox (skips texts & printer).
    if (_pcShouldBcc(b.to)) opts.bcc = BCC_ON_SENDS;
    // Honor sendAs so the app can send from shelley@ / kenny@ / josh@.
      // Requires Gmail Send-mail-as delegation for that address on events@.
      if (b.sendAs) {
        opts.from = b.sendAs;
      }
      GmailApp.sendEmail(b.to, b.subject || '', b.body || '', opts);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// List recent inbox messages (latest message of each thread)
function pcGmailList_(q, max) {
  try {
    max = parseInt(max || '40', 10);
    if (isNaN(max) || max < 1) max = 40;
    var threads = GmailApp.search(q || 'in:inbox', 0, max);
    var out = [];
    for (var i = 0; i < threads.length; i++) {
      var msgs = threads[i].getMessages();
      var m = msgs[msgs.length - 1];
      out.push({
        id: m.getId(),
        threadId: threads[i].getId(),
        from: m.getFrom(),
        to: m.getTo(),
        subject: m.getSubject(),
        date: m.getDate().toISOString(),
        snippet: m.getPlainBody().slice(0, 140)
      });
    }
    return { ok: true, messages: out };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// Get the full body of one message
function pcGmailGet_(id) {
  try {
    var m = GmailApp.getMessageById(id);
    return {
      ok: true,
      id: id,
      from: m.getFrom(),
      to: m.getTo(),
      subject: m.getSubject(),
      date: m.getDate().toISOString(),
      html: m.getBody(),
      body: m.getPlainBody()
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function pcAuthorizeGmail() {
  // Run this once to grant Gmail permission. You can delete it afterward.
  var addr = Session.getEffectiveUser().getEmail();
  GmailApp.getInboxThreads(0, 1);   // touches Gmail to trigger the permission prompt
  Logger.log('Authorized as: ' + addr);
}


// ── TWILIO SMS RELAY ─────────────────────────────────────────
// Sends a real text message via Twilio from the server side (no browser/CORS
// issues, and your Twilio token stays here — never in the app).
//
// SETUP (one time):
//   1) Run setupTwilio() once (after pasting your credentials into it below).
//   2) Make sure this project is deployed as a Web app and that the app's
//      script URL points to it (Deploy -> Manage deployments -> edit -> New version).

function pcTwilioSms_(to, body){
  try{
    var props = PropertiesService.getScriptProperties();
    var sid   = props.getProperty('TWILIO_SID');
    var token = props.getProperty('TWILIO_TOKEN');
    var from  = props.getProperty('TWILIO_FROM');
    if(!sid || !token || !from) return { ok:false, error:'Twilio not configured (run setupTwilio once)' };
    if(!to || !body)            return { ok:false, error:'Missing to/body' };

    var url = 'https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json';
    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: { 'Authorization': 'Basic ' + Utilities.base64Encode(sid + ':' + token) },
      payload: { To: to, From: from, Body: body },
      muteHttpExceptions: true
    });
    var data = {};
    try { data = JSON.parse(resp.getContentText() || '{}'); } catch(e){}
    if(data.sid && !data.error_code) return { ok:true, sid:data.sid };
    return { ok:false, error:(data.message || ('HTTP ' + resp.getResponseCode())), code:(data.code || data.error_code || '') };
  }catch(e){
    return { ok:false, error:String(e) };
  }
}

function setupTwilio(){
  // ONE TIME: paste your three Twilio values below, then Run this function once.
  // After it runs successfully, blank the three values out again and Save the file,
  // so your credentials are NOT left sitting in the code. They live safely in the
  // project's Script Properties after this.
  var SID   = '';   // starts with AC...
  var TOKEN = '';
  var FROM  = '';              // your Twilio SMS phone number (E.164, e.g. +12015551234)

  var props = PropertiesService.getScriptProperties();
  props.setProperty('TWILIO_SID',   SID);
  props.setProperty('TWILIO_TOKEN', TOKEN);
  props.setProperty('TWILIO_FROM',  FROM);
  Logger.log('Twilio saved. Now blank out SID/TOKEN/FROM above and Save the file again.');
}

function testTwilioSms(){
  // Optional: put your own cell number here and Run to send yourself a test text.
  var MY_NUMBER = '+12012509487';
  Logger.log(JSON.stringify(pcTwilioSms_(MY_NUMBER, 'Premier Caterers test text — it works!')));
}

// ── ALLO SMS RELAY ────────────────────────────────────────────
// In active use while Twilio's A2P 10DLC registration is still pending —
// Allo's number is already approved for texting. smsSend (above) now routes
// here instead of pcTwilioSms_. Twilio's code is untouched, so switching
// back later is just changing that one routing line back.
//
// SETUP (one time):
//   1. In Allo: Settings → API → Create API Key, with the SMS_SEND scope
//      enabled. Copy it — it's only shown once.
//   2. Paste that key and your Allo number into setupAllo() below, Run it
//      once, then blank both back out and Save the file again (same pattern
//      as setupTwilio/setupAnthropic — keeps credentials out of the code).

function pcAlloSms_(to, body){
  try{
    var props = PropertiesService.getScriptProperties();
    var apiKey = props.getProperty('ALLO_API_KEY');
    var fromNumber = props.getProperty('ALLO_FROM_NUMBER');
    if(!apiKey || !fromNumber) return { ok:false, error:'Allo not configured (run setupAllo once)' };
    if(!to || !body) return { ok:false, error:'Missing to/body' };

    var resp = UrlFetchApp.fetch('https://api.withallo.com/v1/api/sms', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': apiKey },
      payload: JSON.stringify({ from: fromNumber, to: to, message: body }),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    var data = {};
    try{ data = JSON.parse(resp.getContentText() || '{}'); } catch(e){}
    if(code >= 200 && code < 300) return { ok:true, data: data.data || data };
    return { ok:false, error: (data.code || ('HTTP ' + code)), details: data.details || null };
  }catch(e){
    return { ok:false, error:String(e) };
  }
}

function setupAllo(){
  // ONE TIME: paste your Allo API key and sending number below, Run this
  // function once, then blank both out and Save the file again.
  var API_KEY = '';       // from Allo Settings → API → Create API Key (needs SMS_SEND scope)
  var FROM_NUMBER = '';   // your Allo number in E.164, e.g. +12019071002

  var props = PropertiesService.getScriptProperties();
  props.setProperty('ALLO_API_KEY', API_KEY);
  props.setProperty('ALLO_FROM_NUMBER', FROM_NUMBER);
  Logger.log('Allo saved. Now blank out API_KEY/FROM_NUMBER above and Save the file again.');
}

function testAlloSms(){
  // Optional: put your own cell number here and Run to send yourself a test text.
  var MY_NUMBER = '+12012509487';
  Logger.log(JSON.stringify(pcAlloSms_(MY_NUMBER, 'Premier Caterers test text via Allo — it works!')));
}


function authorizeAll(){
  CalendarApp.getDefaultCalendar().getName();   // grants Calendar access
  GmailApp.getInboxThreads(0, 1);               // grants Gmail access
  Logger.log('Authorized OK');
}

// ── AI EMAIL SUMMARY (Claude) ────────────────────────────────
// Reads the email conversation with one client and returns a short summary
// plus a list of action items. Called by the app's Activity Log and the
// client-card AI summary.  action=aiSummarizeClient&email=<email>&name=<name>
//
// SETUP (one time): run setupAnthropic() once with your key pasted in, then
// blank it out and save. The key lives safely in Script Properties.
function pcAiSummarizeClient_(p){
  try{
    var email = (p && p.email ? String(p.email) : '').trim();
    if(!email) return { ok:false, error:'No client email provided' };

    var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY');
    if(!key) return { ok:false, error:'Anthropic key not set yet (run setupAnthropic once)' };

    // Gather the conversation with this client (most recent threads first).
    var threads = GmailApp.search('from:'+email+' OR to:'+email, 0, 12);
    var convo = [];
    for(var i=0;i<threads.length;i++){
      var msgs = threads[i].getMessages();
      for(var j=0;j<msgs.length;j++){
        var m = msgs[j];
        var fromClient = (m.getFrom()||'').toLowerCase().indexOf(email.toLowerCase()) >= 0;
        var when = Utilities.formatDate(m.getDate(), Session.getScriptTimeZone(), 'MMM d, yyyy');
        var bodyTxt = (m.getPlainBody()||'').replace(/\r/g,'').slice(0, 1500);
        convo.push('['+(fromClient?'CLIENT':'US')+' \u2014 '+when+'] '+(m.getSubject()||'')+'\n'+bodyTxt);
      }
    }
    if(!convo.length) return { ok:true, summary:'No emails found with this client yet.', tasks:[] };

    var thread = convo.join('\n\n----\n\n');
    if(thread.length > 24000) thread = thread.slice(-24000);   // keep the most recent if very long

    var prompt =
      'You are an assistant for Premier Caterers, a kosher catering company. Below is the email '
      + 'conversation with a client (CLIENT = the customer; US = the caterer). '
      + 'First write a SHORT plain-English summary (3-4 sentences) of where things stand: what the client wants, '
      + 'what was agreed, and anything still open. Then list the concrete action items the CATERER still needs to do, '
      + 'as short imperative phrases (e.g. "Send updated estimate", "Confirm dietary count"). '
      + 'Respond with ONLY JSON, no markdown fences, exactly: {"summary":"...","tasks":["...","..."]}. '
      + 'If there are no outstanding action items, use an empty array.\n\nCONVERSATION:\n' + thread;

    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{ role:'user', content: prompt }]
      }),
      muteHttpExceptions: true
    });

    var data = {};
    try { data = JSON.parse(resp.getContentText() || '{}'); } catch(e){}
    if(data.error) return { ok:false, error:(data.error.message || 'Claude API error') };

    var txt = (data.content && data.content[0] && data.content[0].text) || '';
    txt = txt.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
    var parsed = {};
    try { parsed = JSON.parse(txt); } catch(e){ parsed = { summary: txt, tasks: [] }; }
    return { ok:true, summary: (parsed.summary||''), tasks: (Array.isArray(parsed.tasks)?parsed.tasks:[]) };
  }catch(e){
    return { ok:false, error:String(e) };
  }
}

function setupAnthropic(){
  // ONE TIME: paste your Anthropic API key, Run this once, then blank it out and Save again.
  var KEY = 'PASTE_ANTHROPIC_API_KEY_HERE';   // starts with sk-ant-...
  PropertiesService.getScriptProperties().setProperty('ANTHROPIC_KEY', KEY);
  Logger.log('Anthropic key saved. Now blank out KEY above and save the file again.');
}


// ============================================================
// PARSE VENDOR INVOICE WITH CLAUDE
// Called from the purchasing app's "Scan Invoice" tab.
// Input: { action:'parseInvoice', files:[{filename, mime, base64}, ...],
//          knownVendors:[name, ...], knownProducts:[{name, unit}, ...] }
// Output: { ok:true, result:{ vendorName, invoiceDate, invoiceNumber,
//          lines:[{ourName, useFor, category, unit, vendorItemName,
//                  vendorCode, packDesc, packSize, price, matchedProductKey}] } }
// ============================================================
function pcParseInvoice_OLD(b) {
  try {
    var files = (b && b.files) || [];
    if (!files.length) return { ok:false, error:'No files provided' };
    var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY');
    if (!key) return { ok:false, error:'Anthropic key not set in Script Properties (ANTHROPIC_KEY)' };

    var knownVendors  = (b.knownVendors  || []).slice(0, 200);
    var knownProducts = (b.knownProducts || []).slice(0, 500);

    // Build the message content: a guiding text block + each file as image or document.
    var instructions =
      'You are reading a vendor invoice or price sheet for a kosher catering business.\n' +
      'Extract EVERY line item you can see. For each line item, return a JSON object with these fields:\n' +
      '  ourName         = a clean, short product name (e.g. "Chicken Breast", "Blondie", "Linen Napkin"). If the invoice has a product name, simplify it; if you can match it to a name in KNOWN_PRODUCTS, use that exact name.\n' +
      '  useFor          = optional, what the item is typically used for (leave blank if unclear)\n' +
      '  category        = one of: Meat, Fish, Dairy, Bakery, Frozen, Produce, Dry Goods, Beverages, Cleaning Supplies, Paper Products, Smallwares, Linen, Other. Leave blank if not sure.\n' +
      '  unit            = the basic unit of measurement for comparison ("lb", "each", "dozen", "gallon", "case", etc.). Prefer the most granular unit that lets prices be compared.\n' +
      '  vendorItemName  = the exact item name/description as it appears on the invoice\n' +
      '  vendorCode      = the vendor SKU / item code / product number, if shown\n' +
      '  packDesc        = a free-text description of how it\'s packed (e.g. "40 lb case", "12 × 2 lb bags")\n' +
      '  packSize        = the numeric pack size in the unit above (e.g. 40 for a 40 lb case)\n' +
      '  price           = the pack price in dollars (number, no $ sign)\n' +
      '  matchedProductKey = leave empty (the app will match)\n' +
      '\nAlso return a top-level object:\n' +
      '  vendorName      = the vendor name on the letterhead (try to match against KNOWN_VENDORS)\n' +
      '  invoiceDate     = the invoice date in YYYY-MM-DD if visible\n' +
      '  invoiceNumber   = the invoice/PO/order number if shown\n' +
      '  lines           = the array of line items above\n' +
      '\nRespond ONLY as valid JSON, with no markdown fences, no commentary. If you can\'t read a field, leave it as an empty string or omit it.\n' +
      '\nKNOWN_VENDORS: ' + JSON.stringify(knownVendors) +
      '\nKNOWN_PRODUCTS: ' + JSON.stringify(knownProducts);

    var content = [{ type:'text', text: instructions }];
    files.forEach(function (f) {
      if (!f || !f.base64) return;
      var mime = (f.mime || '').toLowerCase();
      if (mime.indexOf('pdf') >= 0) {
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: f.base64 }
        });
      } else if (mime.indexOf('image/') === 0) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: mime, data: f.base64 }
        });
      }
    });

    var payload = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20000,
      messages: [{ role: 'user', content: content }]
    };

    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    var txt  = resp.getContentText();
    if (code < 200 || code >= 300) return { ok:false, error:'Anthropic API ' + code + ': ' + txt.slice(0, 300) };
    var data = {};
    try { data = JSON.parse(txt); } catch (e) { return { ok:false, error:'Bad response: ' + txt.slice(0,200) }; }
    if (data.error) return { ok:false, error: String(data.error.message || data.error) };

    var modelText = (data.content && data.content[0] && data.content[0].text) || '';
    // Strip any accidental markdown fences just in case
    modelText = modelText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    var parsed;
    try { parsed = JSON.parse(modelText); } catch (e) {
      // Try to recover the JSON object if there's preamble
      var first = modelText.indexOf('{'); var last = modelText.lastIndexOf('}');
      if (first >= 0 && last > first) {
        try { parsed = JSON.parse(modelText.slice(first, last+1)); } catch (e2) {}
      }
      if (!parsed) return { ok:false, error:'Could not parse model JSON: ' + modelText.slice(0,200) };
    }
    if (!parsed.lines) parsed.lines = [];
    return { ok:true, result: parsed };
  } catch (err) {
    return { ok:false, error: String(err && err.message || err) };
  }
}

// ============================================================
// PARSE VENDOR INVOICE WITH CLAUDE  —  now with statement detection
// Claude now first decides whether the document is an itemized invoice
// or a STATEMENT (a summary listing several separate invoices, with no
// per-product line items). Statements return a different, honest shape
// instead of being forced into fake product lines.
// ============================================================
function pcParseInvoice_(b) {
  try {
    var files = (b && b.files) || [];
    if (!files.length) return { ok:false, error:'No files provided' };
    var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY');
    if (!key) return { ok:false, error:'Anthropic key not set in Script Properties (ANTHROPIC_KEY)' };

    var knownVendors  = (b.knownVendors  || []).slice(0, 200);
    var knownProducts = (b.knownProducts || []).slice(0, 500);

    var instructions =
      'You are reading one or more vendor documents for a kosher catering business.\n\n' +
      'FIRST, decide what KIND of document this is:\n' +
      '  "invoice"   = an itemized bill listing individual products/items purchased, each with its own price — the normal case.\n' +
      '  "statement" = a summary document listing several SEPARATE invoices (each with its own invoice number, date, and total amount) that the vendor sent over a period. A statement does NOT itemize individual products — its rows are whole invoices, not products.\n\n' +
      'IF THIS IS A STATEMENT, respond with ONLY this JSON shape, nothing else:\n' +
      '  {"documentType":"statement","vendorName":"...","statementDate":"YYYY-MM-DD","statementInvoices":[{"invoiceNumber":"...","date":"YYYY-MM-DD","amount":0}, ...]}\n' +
      'Do NOT invent product line items from a statement. List only the invoice numbers/dates/amounts it references. Omit statementDate if not shown.\n\n' +
      'IF THIS IS A NORMAL ITEMIZED INVOICE, extract EVERY line item you can see across all pages. For each line item, return a JSON object with these fields:\n' +
      '  ourName        = a clean, short product name (e.g. "Mini Fancy Pastry", "Coffee Cake", "Linen Napkin"). If you can match it to a name in KNOWN_PRODUCTS, use that exact name.\n' +
      '  category       = one of: Meat, Fish, Dairy, Bakery, Frozen, Produce, Grocery, Dry Goods, Beverages, Cleaning Supplies, Paper Products, Smallwares, Linen, Other. Omit if unsure.\n' +
      '  vendorItemName = the exact item name/description as it appears on the invoice\n' +
      '  vendorCode     = the vendor SKU / item code / product number, if shown\n' +
      '  soldBy         = the unit the vendor SELLS and PRICES this item in — the only thing you can order. Use a single word like: Box, Case, Dozen, Lb, Piece, Each, Gallon, Bag, Tray, Sheet, Roll, Bottle, Can.\n' +
      '  packSize       = HOW MANY are inside one "soldBy" unit (a number). For a box that holds 36 pieces, packSize = 36. If the item is sold individually or by weight (priced per lb/each), packSize = 1.\n' +
      '  price          = the price for ONE "soldBy" unit, in dollars (number, no $ sign). For a $18.00 box, price = 18.00. For an item priced $6.75 per lb, price = 6.75.\n' +
      '  qty            = the quantity ordered/shipped on THIS invoice (a number). For weight-priced items this is the weight (e.g. lbs).\n' +
      '  lineTotal      = the line total in dollars if shown (number, no $ sign). Omit if not shown.\n' +
      '  matchedProductKey = leave empty (the app will match)\n\n' +
      'Two worked examples so you get soldBy vs packSize right:\n' +
      '  • A bakery sells "Mini Fancy Pastry" only by the box; one box holds 36 pieces and costs $18.00; 6 boxes were ordered.\n' +
      '      => soldBy:"Box", packSize:36, price:18.00, qty:6   (this works out to $0.50 per piece)\n' +
      '  • A "Coffee Cake" is priced by weight at $6.75 per lb and the invoice shows 8.55 lb.\n' +
      '      => soldBy:"Lb", packSize:1, price:6.75, qty:8.55\n\n' +
      'For an itemized invoice, also return a top-level object:\n' +
      '  documentType  = "invoice"\n' +
      '  vendorName    = the vendor name on the letterhead (try to match against KNOWN_VENDORS)\n' +
      '  invoiceDate   = the invoice date in YYYY-MM-DD if visible\n' +
      '  invoiceNumber = the invoice / PO / order number if shown\n' +
      '  lines         = the array of line items above\n\n' +
      'Omit any field that would be empty rather than including it with a blank value, to keep the response compact.\n' +
      'Respond ONLY as valid JSON — no markdown fences, no commentary.\n\n' +
      'If the file is a CSV or text export rather than a scan, read it the same way:\n' +
      '  - Skip header/address rows and summary rows (Sub-Total, Tax, Total, Balance, Previous Balance, card payment lines).\n' +
      '  - If a quantity column holds a decimal weight (e.g. 2.98) and the price shown is the LINE TOTAL, the item is weight-priced: set soldBy to "Lb", qty to that weight, and price to lineTotal divided by weight, rounded to cents.\n' +
      '  - If a case-quantity column is 1 while the unit-quantity column is 0, it was bought by the case: soldBy "Case", qty 1, price = the amount shown.\n' +
      '  - Negative amounts are credits or returns - skip those rows.\n' +
      '  - The same item may repeat across several rows (separately weighed packages); keep each row as its own line item.\n\n' +
      'KNOWN_VENDORS: ' + JSON.stringify(knownVendors) +
      '\nKNOWN_PRODUCTS: ' + JSON.stringify(knownProducts);

    var content = [{ type:'text', text: instructions }];
    var attached = 0;
    files.forEach(function (f) {
      if (!f || !f.base64) return;
      var mime = (f.mime || '').toLowerCase();
      var name = (f.filename || '').toLowerCase();
      if (mime.indexOf('pdf') >= 0) {
        content.push({ type:'document', source:{ type:'base64', media_type:'application/pdf', data:f.base64 } });
        attached++;
      } else if (mime.indexOf('image/') === 0) {
        content.push({ type:'image', source:{ type:'base64', media_type:mime, data:f.base64 } });
        attached++;
      } else if (mime.indexOf('csv') >= 0 || mime.indexOf('text/') === 0 ||
                 mime.indexOf('spreadsheet') >= 0 || mime.indexOf('excel') >= 0 ||
                 name.slice(-4) === '.csv' || name.slice(-4) === '.txt' || name.slice(-4) === '.tsv') {
        // CSV / plain-text exports aren't documents or images to the API — decode
        // and pass them through as text. Without this branch they were silently
        // dropped, and Claude replied "I don't see any invoice content provided".
        var txt = '';
        try { txt = Utilities.newBlob(Utilities.base64Decode(f.base64)).getDataAsString(); }
        catch (e) { txt = ''; }
        if (txt) {
          if (txt.length > 60000) txt = txt.slice(0, 60000);
          content.push({ type:'text', text:'FILE: ' + (f.filename || 'invoice.csv') + '\n\n' + txt });
          attached++;
        }
      }
    });
    if (!attached) return { ok:false, error:'None of the uploaded files could be read (supported: PDF, image, CSV/TXT).' };

    var payload = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60000,   // long itemized invoices (30+ lines) overran 20k and came back with blank rows
      messages: [{ role:'user', content: content }]
    };

    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    var txt  = resp.getContentText();
    if (code < 200 || code >= 300) return { ok:false, error:'Anthropic API ' + code + ': ' + txt.slice(0, 300) };

    var data = {};
    try { data = JSON.parse(txt); } catch (e) { return { ok:false, error:'Bad response: ' + txt.slice(0,200) }; }
    if (data.error) return { ok:false, error: String(data.error.message || data.error) };

    var modelText = (data.content && data.content[0] && data.content[0].text) || '';
    modelText = modelText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    var parsed = {};
    try {
      parsed = JSON.parse(modelText);
    } catch (e) {
      return { ok:false, error:'Could not parse model JSON. First 200 chars: ' + modelText.slice(0, 200) };
    }

    if (parsed.documentType === 'statement') {
      parsed.statementInvoices = parsed.statementInvoices || [];
      return { ok:true, result: parsed };
    }

    if (!parsed.documentType) parsed.documentType = 'invoice';
    if (!parsed.lines || !parsed.lines.length) {
      if (parsed.items && parsed.items.length) parsed.lines = parsed.items;
      else if (Array.isArray(parsed)) parsed = { documentType:'invoice', lines: parsed };
    }
    parsed.lines = parsed.lines || [];

    return { ok:true, result: parsed };
  } catch (e) {
    return { ok:false, error: String(e && e.message || e) };
  }
}

function pcAiParseInquiry_(b) {
  try {
    var text = (b && b.text ? String(b.text) : '').trim();
    if (!text) return { ok: false, error: 'No text provided' };
    if (text.length > 50000) text = text.slice(0, 50000);
 
    var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY');
    if (!key) return { ok: false, error: 'Anthropic key not set in Script Properties (ANTHROPIC_KEY)' };
 
    var eventTypes = [
      'Wedding', 'Bar Mitzvah', 'Bat Mitzvah', 'Engagement party', 'Vort',
      'Aufruf', 'Sheva Brachos', 'Kiddush', 'Bris', 'Shloshim', 'Shabbos meals',
      'Bar mitzvah party - not shabbos', 'Bas mitzvah party - not shabbos',
      'Bar mitzvah over shabbos', 'Corporate event', 'Organization event',
      'Drop off catering', 'Breakfast', 'Brunch', 'Conference', 'Other'
    ];
 
    var prompt =
      'You are extracting structured inquiry data from an email or notes for a kosher catering company (Premier Caterers). ' +
      'The person may be expressing interest in services, asking about catering, or providing details about an event they want to book.\n\n' +
      'Extract EVERY field you can find from the text. Return ONLY a JSON object (no markdown, no explanation) with these keys:\n' +
      '  firstName        = first name of the contact person\n' +
      '  lastName         = last name of the contact person\n' +
      '  organization     = organization/synagogue/venue name if mentioned\n' +
      '  email            = email address\n' +
      '  phone            = phone number (keep exactly as written)\n' +
      '  eventName        = the name/title of the specific event (e.g. "Sarah\'s Bat Mitzvah")\n' +
      '  eventType        = the type of event. MUST BE ONE OF: ' + JSON.stringify(eventTypes) + '. If the text doesn\'t clearly match one, leave blank.\n' +
      '  eventDate        = the date in YYYY-MM-DD format if visible. If only a partial date (e.g. "March 14"), guess the year as 2026 or 2027 if needed and return the full YYYY-MM-DD. If completely unclear, leave blank.\n' +
      '  venueName        = name of the venue/hall if mentioned\n' +
      '  venueLocation    = venue address or location description\n' +
      '  guestCount       = number of guests as a plain number (e.g. "120", not "120 guests")\n' +
      '  meatDairy        = "Meat", "Dairy", "Parve", or blank if not mentioned\n' +
      '  shabbos          = "Yes" or "No" (whether the event is over Shabbos). Default to "No" if not mentioned.\n' +
      '  howFound         = how they found/heard about the caterer (e.g. "referral", "website", "google", etc.)\n' +
      '  referredBy       = the person\'s name if they were referred by someone\n' +
      '  plannerName      = party planner\'s name if one is mentioned\n' +
      '  cuisine          = style/cuisine preferences (e.g. "Mediterranean", "traditional", etc.)\n' +
      '  comments         = any other details, notes, or special requests\n\n' +
      'Rules:\n' +
      '  • Leave a field blank ("") if you don\'t see it in the text — do NOT guess or make up values.\n' +
      '  • For eventType, match against the list exactly. If unsure, leave blank.\n' +
      '  • For eventDate, if you see "March 14" or similar without a year, pick 2026 or 2027 as reasonable and fill in the full YYYY-MM-DD.\n' +
      '  • For guestCount, extract just the number (e.g. "120", not "120 guests" or "around 120").\n' +
      '  • Do NOT include fields that are empty — keep the JSON clean and minimal.\n' +
      '  • Return ONLY valid JSON. No markdown fences (```), no preamble, no explanation.\n\n' +
      'TEXT TO PARSE:\n' + text;
 
    var payload = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    };
 
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    var txt = resp.getContentText();
    if (code < 200 || code >= 300) return { ok: false, error: 'Anthropic API ' + code + ': ' + txt.slice(0, 300) };
 
    var data = {};
    try { data = JSON.parse(txt); } catch (e) { return { ok: false, error: 'Bad response: ' + txt.slice(0, 200) }; }
    if (data.error) return { ok: false, error: String(data.error.message || data.error) };
 
    var modelText = (data.content && data.content[0] && data.content[0].text) || '';
    modelText = modelText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
 
    var parsed = {};
    try {
      parsed = JSON.parse(modelText);
    } catch (e) {
      return { ok: false, error: 'Could not parse model JSON. First 200 chars: ' + modelText.slice(0, 200) };
    }
 
    return { ok: true, result: parsed };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

// ============================================================
// TRUCK CHECKLIST REMINDER
// Sends Mario the weekly Tuesday reminder — email always, plus text via
// Allo (since Allo's number is already approved for texting, unlike
// Twilio's, which is still pending A2P registration).
//
// SETUP (one time):
//   1. Gear icon → Script Properties → add:
//        DRIVER_EMAIL = mario's email
//        DRIVER_PHONE = +12015199759
//      (Update these anytime without touching code.)
//   2. Also needs ALLO_API_KEY and ALLO_FROM_NUMBER set — see setupAllo()
//      above if you haven't run that yet.
//   3. Clock icon → Add Trigger →
//        Function: sendTruckChecklistReminder
//        Event source: Time-driven
//        Type: Week timer → Every Tuesday → pick a time (e.g. 7am)
//      Save, then manually click Run once from the editor first to
//      approve the Gmail permission prompt if you haven't already.
// ============================================================
function sendTruckChecklistReminder(){
  var props = PropertiesService.getScriptProperties();
  var driverEmail = props.getProperty('DRIVER_EMAIL');
  var driverPhone = props.getProperty('DRIVER_PHONE');
  var checklistUrl = 'https://premier-caterers.github.io/premier-caterers/truck-checklist.html';

  if(driverEmail){
    try{
      MailApp.sendEmail({
        to: driverEmail,
        subject: 'Truck checklist — this week',
        body: 'Hi Mario,\n\nTime for this week\'s truck checklist for the Reefer truck, Large truck, and Van.\n\n'+checklistUrl+'\n\nThanks!\nPremier Caterers',
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:480px">'
          + '<h3 style="color:#7A2E3D">Truck checklist — this week</h3>'
          + '<p>Hi Mario, time for this week\'s truck checklist for the Reefer truck, Large truck, and Van.</p>'
          + '<p><a href="'+checklistUrl+'" style="background:#7A2E3D;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Open checklist</a></p>'
          + '</div>'
      });
    }catch(e){ Logger.log('Truck checklist email failed: '+e.message); }
  } else {
    Logger.log('DRIVER_EMAIL not set yet — skipping email reminder.');
  }

  if(driverPhone){
    var sms = pcAlloSms_(driverPhone, 'Premier Caterers: time for this week\'s truck checklist — '+checklistUrl);
    if(!sms.ok) Logger.log('Truck checklist SMS not sent: '+sms.error);
  } else {
    Logger.log('DRIVER_PHONE not set yet — skipping SMS reminder.');
  }
}

// ============================================================
// ADDITION FOR MenuAutomation.gs — drop-off "order started but not
// finished" follow-up. Paste this whole block onto the END of your
// existing MenuAutomation.gs file, then run createDropOffDraftTrigger()
// once (same one-time setup as createTimeTrigger() already uses).
//
// This does NOT touch, replace, or rename anything already in the file —
// it only adds new functions, reusing your existing NOTIFY_EMAILS and
// MailApp.sendEmail patterns (same as sendNotificationEmail above).
// ============================================================

// Checks the dropOffOrders collection for drafts that have gone idle
// (someone started building an order but never placed it) and emails
// staff so you can follow up directly. Each draft is only ever
// notified once (startNotified flips to true right after).
//
// Setup: Apps Script → Triggers → Add trigger → checkAbandonedDropOffOrders
//        → Time-driven → Minutes timer → Every 15 or 30 minutes
// (or just run createDropOffDraftTrigger() once — see below)

var DROPOFF_IDLE_MINUTES = 20; // how long a draft sits untouched before we flag it

function checkAbandonedDropOffOrders() {
  var projectId = 'premier-caterers-internal-app';
  var token = ScriptApp.getOAuthToken();
  var url = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents/dropOffOrders';

  var response = UrlFetchApp.fetch(url, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    Logger.log('dropOffOrders fetch error: ' + response.getContentText());
    return;
  }

  var data = JSON.parse(response.getContentText());
  var documents = data.documents || [];
  var cutoff = Date.now() - (DROPOFF_IDLE_MINUTES * 60 * 1000);
  var flagged = 0;

  documents.forEach(function(doc) {
    var fields = doc.fields || {};
    function str(key){ return (fields[key] && fields[key].stringValue) || ''; }
    function num(key){ return (fields[key] && fields[key].integerValue) ? parseInt(fields[key].integerValue,10) : ((fields[key] && fields[key].doubleValue) || 0); }
    function bool(key){ return (fields[key] && fields[key].booleanValue) || false; }

    var status = str('status');
    if (status !== 'draft') return;                 // already placed, or not a draft
    if (bool('startNotified')) return;               // already flagged once

    var updatedAt = num('updatedAt');
    if (!updatedAt || updatedAt > cutoff) return;     // still recent — give it more time

    var clientName  = str('clientName');
    var clientEmail = str('clientEmail');
    var total       = num('total');

    // Item lines are an array field — pull out a short summary
    var linesArr = (fields.lines && fields.lines.arrayValue && fields.lines.arrayValue.values) || [];
    var itemSummary = linesArr.map(function(v){
      var f = (v.mapValue && v.mapValue.fields) || {};
      var qty = (f.qty && (f.qty.integerValue || f.qty.doubleValue)) || 0;
      var name = (f.itemName && f.itemName.stringValue) || '';
      var size = (f.sizeLabel && f.sizeLabel.stringValue) || '';
      return qty + 'x ' + name + (size ? ' (' + size + ')' : '');
    }).join('\n');

    var subject = 'Drop-off order started, not finished' + (clientName ? (' — ' + clientName) : '');
    var body = 'Someone started building a drop-off order but hasn\'t placed it yet '
      + '(idle ' + DROPOFF_IDLE_MINUTES + '+ minutes).\n\n'
      + (clientName  ? ('Name so far: ' + clientName + '\n') : '')
      + (clientEmail ? ('Email so far: ' + clientEmail + '\n') : '')
      + (itemSummary ? ('\nItems so far:\n' + itemSummary + '\n') : '\n(No items selected yet.)\n')
      + (total ? ('\nRunning total: $' + total.toFixed(2) + '\n') : '')
      + '\nWorth a quick follow-up if you recognize who this might be.';

    NOTIFY_EMAILS.forEach(function(recipient) {
      try { MailApp.sendEmail({ to: recipient, subject: subject, body: body }); }
      catch(err) { Logger.log('abandoned-order email error to ' + recipient + ': ' + err.message); }
    });

    // Mark it notified so this same draft never emails twice.
    var patchUrl = 'https://firestore.googleapis.com/v1/' + doc.name + '?updateMask.fieldPaths=startNotified';
    UrlFetchApp.fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ fields: { startNotified: { booleanValue: true } } }),
      muteHttpExceptions: true
    });
    flagged++;
  });

  Logger.log('checkAbandonedDropOffOrders: checked ' + documents.length + ' drafts, flagged ' + flagged);
}

// Run this ONCE to set up the recurring check (same pattern as
// createTimeTrigger() above, just for this new function).
function createDropOffDraftTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'checkAbandonedDropOffOrders') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('checkAbandonedDropOffOrders')
    .timeBased()
    .everyMinutes(15)
    .create();
  Logger.log('Trigger created — checkAbandonedDropOffOrders will run every 15 minutes');
}

