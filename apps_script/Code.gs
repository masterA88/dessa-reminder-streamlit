/*** File: Code.gs ***/
/* global ContentService, SpreadsheetApp, Utilities, MailApp */

// ========= CONFIG =========
const VERSION_TAG = 'vA-id-only-two-emails';
const SHEET_ID = '1Knaz_HO6ByHGZDWqhVZeQgKsenXXWqlyx_wLTI-XzEI';
const SHEET_NAME = 'reminders';
const SENDER_NAME = 'Dessa – Asisten Pengingat';
const ORG_NAME = 'Perusahaan Anda';
const TIMEZONE = 'Asia/Jakarta';

const TITLE_SETTLEMENT = 'Settlement Transportasi';
const TITLE_TIMESHEET  = 'Timesheet Reminder';

// ========= HTTP HANDLER =========
function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const data = JSON.parse(raw);
    const action = String(data.action || '').toLowerCase();

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Sheet tidak ditemukan.');

    // ping (debug)
    if (action === 'ping') {
      return json({ success:true, version:VERSION_TAG, sheetId:SHEET_ID, sheetName:SHEET_NAME, lastRow:sheet.getLastRow() });
    }

    // ---- CREATE (no duplicate check) ----
    if (action === 'create') {
      const name  = String(data.name  || '').trim();
      const email = String(data.email || '').trim().toLowerCase();
      if (!/^[\w.+\-]+@([\w\-]+\.)+[A-Za-z]{2,}$/.test(email)) {
        return json({ success:false, message:'Email tidak valid' });
      }

      const id = genId();
      const now = new Date();
      sheet.appendRow([id, now, 'ACTIVE', name, email]);

      // Build events
      const evtSettlement = makeSettlementEvent(); // daily 19:00–23:59
      const evtTimesheet  = makeTimesheetEvent();  // 15 & 30 monthly, 09:00–17:00

      // --- Email 1: Settlement only ---
      const mailSet = buildCreateEmailSingle({
        id, name, email, evt: evtSettlement,
        subtitle: 'Harian • 19:00–23:59 WIB',
        filename: `${id}-settlement.ics`
      });
      MailApp.sendEmail({
        to: email, name: SENDER_NAME,
        subject: mailSet.subject,
        htmlBody: mailSet.html,
        attachments: [mailSet.icsBlob]
      });

      // --- Email 2: Timesheet only ---
      const mailTime = buildCreateEmailSingle({
        id, name, email, evt: evtTimesheet,
        subtitle: 'Tanggal 15 & 30 setiap bulan • 09:00–17:00 WIB',
        filename: `${id}-timesheet.ics`
      });
      MailApp.sendEmail({
        to: email, name: SENDER_NAME,
        subject: mailTime.subject,
        htmlBody: mailTime.html,
        attachments: [mailTime.icsBlob]
      });

      return json({ success:true, id });
    }

    // ---- STATUS (ID only) ----
    if (action === 'status') {
      const id = String(data.id || '').trim();
      if (!id) return json({ success:false, message:'Masukkan ID' });
      const row = findRowById(sheet, id);
      if (row < 0) return json({ success:false, message:'ID tidak ditemukan' });

      const status = String(sheet.getRange(row, 3).getValue() || '');
      const name   = String(sheet.getRange(row, 4).getValue() || '');
      const email  = String(sheet.getRange(row, 5).getValue() || '');
      return json({ success:true, status, id, name, email });
    }

    // ---- REMOVE (ID only) ----
    if (action === 'remove') {
      const id = String(data.id || '').trim();
      if (!id) return json({ success:false, message:'Masukkan ID' });
      const row = findRowById(sheet, id);
      if (row < 0) return json({ success:false, message:'ID tidak ditemukan' });

      const name  = String(sheet.getRange(row, 4).getValue() || 'Pengguna');
      const email = String(sheet.getRange(row, 5).getValue() || '');
      sheet.getRange(row, 3).setValue('CANCELLED');

      if (email) {
        const { subject, html } = buildRemoveEmail({ id, name, email });
        try { MailApp.sendEmail({ to: email, name: SENDER_NAME, subject, htmlBody: html }); } catch (_) {}
      }
      return json({ success:true });
    }

    return json({ success:false, message:'Aksi tidak dikenal' });
  } catch (err) {
    return json({ success:false, message: String(err && err.message ? err.message : err) });
  }
}

// ========= UTIL =========
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function genId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  const ab = Math.random().toString(36).slice(2,6).toUpperCase();
  return `REM-${y}${m}${day}-${ab}`;
}
function findRowById(sheet, id) {
  const values = sheet.getDataRange().getValues(); // include header
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === id) return i + 1; // 1-based index
  }
  return -1;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toUtcStamp(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,'0');
  const day = String(d.getUTCDate()).padStart(2,'0');
  const h = String(d.getUTCHours()).padStart(2,'0');
  const min = String(d.getUTCMinutes()).padStart(2,'0');
  const s = String(d.getUTCSeconds()).padStart(2,'0');
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

// ========= EVENTS =========
// Settlement: daily 19:00–23:59 WIB
function makeSettlementEvent() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(19, 0, 0, 0);
  if (now.getTime() > start.getTime()) start.setDate(start.getDate() + 1);
  const end = new Date(start); end.setHours(23, 59, 0, 0);
  return { title: TITLE_SETTLEMENT, start, end, tz: TIMEZONE, rrule: 'FREQ=DAILY' };
}

// Timesheet: monthly on 15 & 30, 09:00–17:00 WIB
function makeTimesheetEvent() {
  const now = new Date();
  const cand15 = new Date(now.getFullYear(), now.getMonth(), 15, 9, 0, 0, 0);
  const cand30 = new Date(now.getFullYear(), now.getMonth(), 30, 9, 0, 0, 0);

  let start = cand15;
  if (now.getTime() > cand15.getTime()) {
    if (now.getTime() <= cand30.getTime()) {
      start = cand30;
    } else {
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      start = new Date(y, m, 15, 9, 0, 0, 0);
    }
  }
  const end = new Date(start); end.setHours(17, 0, 0, 0);

  // RRULE: 15 & 30 every month (months without day 30 will just skip)
  return { title: TITLE_TIMESHEET, start, end, tz: TIMEZONE, rrule: 'FREQ=MONTHLY;BYMONTHDAY=15,30' };
}

// ========= CAL LINKS & ICS =========
function googleCalLink(evt) {
  const sUtc = toUtcStamp(evt.start);
  const eUtc = toUtcStamp(evt.end);
  const text = encodeURIComponent(evt.title);
  const details = encodeURIComponent(`Pengingat: ${evt.title}`);
  const recur = encodeURIComponent(`RRULE:${evt.rrule || 'FREQ=DAILY'}`);
  const ctz = encodeURIComponent(TIMEZONE);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${sUtc}/${eUtc}&details=${details}&recur=${recur}&ctz=${ctz}`;
}

function makeICS(evt) {
  const uid = `${Utilities.getUuid()}@dessa.local`;
  const dtstamp = toUtcStamp(new Date());
  const dtstart = toUtcStamp(evt.start);
  const dtend   = toUtcStamp(evt.end);
  const summary = String(evt.title||'').replace(/\n/g,' ');
  const desc = `Pengingat: ${evt.title}`;
  const rrule = evt.rrule ? `RRULE:${evt.rrule}` : 'RRULE:FREQ=DAILY';
  return [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Dessa//Reminder//ID','CALSCALE:GREGORIAN','METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,`DTSTAMP:${dtstamp}`,`DTSTART:${dtstart}`,`DTEND:${dtend}`,
    rrule,`SUMMARY:${summary}`,`DESCRIPTION:${desc}`,
    'END:VEVENT','END:VCALENDAR'
  ].join('\r\n');
}

// ========= EMAIL BUILDERS =========
function buildCreateEmailSingle({ id, name, email, evt, subtitle, filename }) {
  const subject = `[${ORG_NAME}] ${evt.title} dibuat: ${id}`;
  const gLink = googleCalLink(evt);
  const html =
  `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px">
    <p>Halo ${escapeHtml(name)},</p>
    <p>Event kalender untuk <strong>${escapeHtml(evt.title)}</strong> telah dibuat.</p>
    <ul>
      <li>Jadwal: ${escapeHtml(subtitle)}</li>
      <li><a href="${gLink}">➕ Add to Google Calendar</a></li>
      <li>Outlook/Apple: gunakan lampiran <code>${escapeHtml(filename)}</code></li>
    </ul>
    <p><strong>ID:</strong> ${id}<br/><strong>Email:</strong> ${escapeHtml(email)}</p>
    <hr/><p style="color:#6b7280">Email otomatis dari ${escapeHtml(ORG_NAME)}.</p>
  </div>`;
  const icsBlob = Utilities.newBlob(makeICS(evt), 'text/calendar', filename);
  return { subject, html, icsBlob };
}

function buildRemoveEmail({ id, name, email }) {
  const subject = `[${ORG_NAME}] Konfirmasi penghapusan: ${id}`;
  const html =
  `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px">
    <p>Halo ${escapeHtml(name || '')},</p>
    <p>Reminder dengan <strong>ID:</strong> ${id} telah <strong>dibatalkan</strong> di sistem kami.</p>
    <p><strong>Catatan:</strong> jika event sudah ditambahkan ke kalender (Settlement atau Timesheet),
    silakan <strong>hapus manual</strong> di Google/Outlook/Apple.</p>
    <hr/><p style="color:#6b7280">${escapeHtml(ORG_NAME)}</p>
  </div>`;
  return { subject, html };
}

/*** Google Sheet columns:
A: ID | B: CreatedAt | C: Status | D: Name | E: Email
***/
