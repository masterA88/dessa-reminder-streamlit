/*** File: Code.gs ***/
/* global ContentService, SpreadsheetApp, Utilities, MailApp, LockService */

// ========= KONFIGURASI =========
const VERSION_TAG = 'v3-stable-dup-email-status-remove'
const SHEET_ID = '1Knaz_HO6ByHGZDWqhVZeQgKsenXXWqlyx_wLTI-XzEI';
const SHEET_NAME = 'reminders';
const SENDER_NAME = 'Dessa – Asisten Pengingat';
const ORG_NAME = 'Perusahaan Anda';
const DEFAULT_REMINDER_TITLE = 'Settlement Transportasi';
const TIMEZONE = 'Asia/Jakarta';

// ========= HTTP HANDLER =========
function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const data = JSON.parse(raw);
    const action = String(data.action || '').toLowerCase();

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Sheet tidak ditemukan.');

    // (Opsional) Ping untuk debug cepat
    if (action === 'ping') {
      const lastRow = sheet.getLastRow();
      return json({ success:true, version:VERSION_TAG, sheetId:SHEET_ID, sheetName:SHEET_NAME, lastRow });
    }

    // -------- CREATE (tanpa cek duplikasi) --------
    if (action === 'create') {
      const name = String(data.name || '').trim();
      const email = String(data.email || '').trim().toLowerCase();
      if (!/^[\w.+\-]+@([\w\-]+\.)+[A-Za-z]{2,}$/.test(email)) {
        return json({ success:false, message:'Email tidak valid' });
      }

      const id = genId();
      const now = new Date();
      sheet.appendRow([id, now, 'ACTIVE', name, email]);

      const evt = makeDailyNightEvent(); // harian 19:00–23:59 WIB
      const { subject, html, icsBlob } = buildCreateEmail({ id, name, email, event: evt });
      MailApp.sendEmail({ to: email, name: SENDER_NAME, subject, htmlBody: html, attachments: [icsBlob] });

      return json({ success:true, id });
    }

    // -------- STATUS (ID saja) --------
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

    // -------- REMOVE (ID saja) --------
    if (action === 'remove') {
      const id = String(data.id || '').trim();
      if (!id) return json({ success:false, message:'Masukkan ID' });
      const row = findRowById(sheet, id);
      if (row < 0) return json({ success:false, message:'ID tidak ditemukan' });

      const name  = String(sheet.getRange(row, 4).getValue() || 'Pengguna');
      const email = String(sheet.getRange(row, 5).getValue() || '');
      sheet.getRange(row, 3).setValue('CANCELLED'); // kolom C = Status

      // Email konfirmasi hapus (tanpa ICS)
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

// ========= UTIL & HELPERS =========
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
  const values = sheet.getDataRange().getValues(); // termasuk header
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === id) return i + 1; // 1-based index
  }
  return -1;
}

// ========= EVENT & EMAIL =========
// Event harian 19:00–23:59 WIB (recurring)
function makeDailyNightEvent() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(19, 0, 0, 0); // 19:00 WIB
  if (now.getTime() > start.getTime()) start.setDate(start.getDate() + 1); // kalau sudah lewat, besok
  const end = new Date(start); end.setHours(23, 59, 0, 0); // 23:59 WIB
  return { title: DEFAULT_REMINDER_TITLE, start, end, tz: TIMEZONE, rrule: 'FREQ=DAILY' };
}

function buildCreateEmail({ id, name, email, event }) {
  const subject = `[${ORG_NAME}] Reminder dibuat: ${id}`;
  const gLink = googleCalLink(event);
  const html =
  `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px">
    <p>Halo ${escapeHtml(name)},</p>
    <p>Pengingat <strong>${escapeHtml(event.title)}</strong> berhasil dibuat (harian, 19:00–23:59 WIB).</p>
    <p><strong>ID:</strong> ${id}<br/><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p>Tambahkan ke kalender:
      <ul>
        <li><a href="${gLink}">➕ Google Calendar</a></li>
        <li>📎 Outlook/Apple Calendar: pakai lampiran <em>.ics</em>.</li>
      </ul>
    </p>
    <hr/><p style="color:#6b7280">Email otomatis dari ${escapeHtml(ORG_NAME)}.</p>
  </div>`;
  const ics = makeICS(event);
  const icsBlob = Utilities.newBlob(ics, 'text/calendar', `${id}.ics`);
  return { subject, html, icsBlob };
}

function buildRemoveEmail({ id, name, email }) {
  const subject = `[${ORG_NAME}] Konfirmasi penghapusan reminder: ${id}`;
  const html =
  `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px">
    <p>Halo ${escapeHtml(name || '')},</p>
    <p>Reminder dengan <strong>ID:</strong> ${id} telah <strong>dibatalkan</strong> di sistem kami.</p>
    <p><strong>Catatan:</strong> jika event sudah masuk kalender,
    silakan <strong>hapus manual</strong> (Google/Outlook/Apple):</p>
    <ol>
      <li>Google Calendar → cari event “${escapeHtml(DEFAULT_REMINDER_TITLE)}” atau “${id}” → <strong>Hapus</strong>.</li>
      <li>Outlook → Calendar → pilih event → <strong>Delete</strong> (This event/Series).</li>
      <li>Apple Calendar → pilih event → <strong>Delete</strong>.</li>
    </ol>
    <hr/><p style="color:#6b7280">${escapeHtml(ORG_NAME)}</p>
  </div>`;
  return { subject, html };
}

function googleCalLink(evt) {
  const sUtc = toUtcStamp(evt.start);
  const eUtc = toUtcStamp(evt.end);
  const text = encodeURIComponent(evt.title);
  const details = encodeURIComponent('Pengingat settlement transportasi harian (19:00–23:59 WIB).');
  const recur = encodeURIComponent('RRULE:FREQ=DAILY');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${sUtc}/${eUtc}&details=${details}&recur=${recur}`;
}
function toUtcStamp(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,'0');
  const day = String(d.getUTCDate()).padStart(2,'0');
  const h = String(d.getUTCHours()).padStart(2,'0');
  const min = String(d.getUTCMinutes()).padStart(2,'0');
  const s = String(d.getUTCSeconds()).padStart(2,'0');
  return `${y}${m}${day}T${h}${min}${s}Z`;
}
function makeICS(evt) {
  const uid = `${Utilities.getUuid()}@dessa.local`;
  const dtstamp = toUtcStamp(new Date());
  const dtstart = toUtcStamp(evt.start);
  const dtend = toUtcStamp(evt.end);
  const summary = String(evt.title||'').replace(/\n/g,' ');
  const desc = 'Pengingat settlement transportasi harian (19:00–23:59 WIB).';
  const rrule = evt.rrule ? `RRULE:${evt.rrule}` : 'RRULE:FREQ=DAILY';
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dessa//Reminder//ID', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`, `DTSTAMP:${dtstamp}`, `DTSTART:${dtstart}`, `DTEND:${dtend}`,
    rrule, `SUMMARY:${summary}`, `DESCRIPTION:${desc}`,
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/*** Struktur Google Sheet:
A: ID | B: CreatedAt | C: Status | D: Name | E: Email
***/
