# Dessa – Transport Settlement Reminder (Free stack)

A lightweight, **zero-cost (for development)** reminder system that lets employees set daily reminders for **19:00–23:59 WIB** with a friendly assistant (“Dessa”).

- Backend: **Google Apps Script** + **Google Sheets** + **MailApp** (free)
- Web widget (optional): **Static HTML** (host on GitHub Pages / Netlify)
- Admin/Alt UI (optional): **Streamlit** (free on Streamlit Community Cloud)

> **Note:** This “simple version” uses **ID only** for status checks and deletion (no email-based search, no duplicate checking on create).

---

## Demo workflow

1. **Set Reminder** → user enters **Name** (alias allowed) + **real Email** (must be valid).  
   - Record saved to Google Sheet.  
   - Email sent with **Google Calendar link** and **ICS attachment** (Outlook/Apple).  
2. **Check Status** → enter **ID** (e.g., `REM-20251014-AB12`).  
3. **Remove** → enter **ID** to cancel (status changed to `CANCELLED`) and send a confirmation email with manual calendar removal instructions.

---

## Architecture

```
apps_script/
  Code.gs              # Backend HTTP handler (create/status/remove) + ICS builder
web/
  index.html           # Minimal chat-style widget UI (static, host via GitHub Pages)
streamlit/
  streamlit_app.py     # Optional admin/alt UI (Streamlit Cloud)
  requirements.txt     # streamlit + requests
```

---

## Prerequisites

- A Google account with access to **Google Drive/Sheets**.
- A **Google Sheet** with a sheet/tab named `reminders` and **this header order**:
  - **A:** `ID`
  - **B:** `CreatedAt`
  - **C:** `Status`
  - **D:** `Name`
  - **E:** `Email`
- (Optional) A **Streamlit** account for Streamlit Community Cloud.
- (Optional) A **GitHub** account for hosting `index.html` on GitHub Pages.

---

## 1) Google Apps Script (Backend)

1. Open https://script.google.com and create a **New project**.  
2. In **Project Settings**, set **Time zone** → `Asia/Jakarta`.
3. Create a file `Code.gs` and paste the content from this repo: `apps_script/Code.gs`.
4. Replace `SHEET_ID` with your Google Sheet ID (the long string in the sheet URL).  
   Ensure the target tab is named exactly `reminders`.
5. **Deploy** → **Manage deployments** → **New deployment** → **Web app**:  
   - **Execute as:** Me  
   - **Who has access:** Anyone  
   - Click **Deploy**, copy the **Web App URL** (e.g., `https://script.google.com/macros/s/XXXX/exec`).

> If you update the script later, **Edit → Deploy** the same deployment to keep the **same URL**.

### Quick sanity test

- POST to the Web App URL with body:
  ```json
  {"action":"ping"}
  ```
- Expected response:
  ```json
  {"success":true,"version":"vA-simple-id-only", ...}
  ```

---

## 2) GitHub setup + GitHub Pages (for `index.html`)

1. **Create a repository** on GitHub, e.g., `dessa-reminder`.
2. Add the following structure:
   ```
   web/index.html
   apps_script/Code.gs
   streamlit/streamlit_app.py
   streamlit/requirements.txt
   README.md
   ```
3. Edit `web/index.html` and set:
   ```js
   const API_BASE = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";
   ```
4. Commit and push.

### Enable GitHub Pages

- In the repo → **Settings** → **Pages**:  
  - **Source:** `Deploy from a branch`  
  - **Branch:** `main` (or `master`) → **/root** (or `/docs` if you prefer)  
- Put `index.html` at the repo root **or** set Pages to serve from `/web`.  
- After a minute, GitHub Pages will give you a URL like `https://<user>.github.io/dessa-reminder/`.  
  Open it to use the widget.

> Tip: If you serve from `/web`, set **Pages** Source to that folder or move `index.html` to repo root.

---

## 3) Streamlit (optional admin/alt UI)

If you want a hosted UI that’s easy to use internally:

1. Create a free account on **Streamlit Community Cloud**.
2. Click **New app** → point to your GitHub repo and select `streamlit/streamlit_app.py`.
3. In **Advanced settings → Secrets**, add:
   ```toml
   API_BASE = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
   APP_TITLE = "Dessa – Asisten Pengingat"
   ```
4. Streamlit will read `streamlit/requirements.txt`:
   ```txt
   streamlit==1.38.0
   requests==2.32.3
   ```
5. Deploy. You’ll get a public Streamlit URL for the app.

---

## 4) File references

### `apps_script/Code.gs` (backend essentials)

- Actions:
  - `create`: Validate email, generate `ID`, append row, send email with ICS.
  - `status`: Lookup by `ID` only.
  - `remove`: Lookup by `ID` only, set `Status = CANCELLED`, send confirmation email.
- ICS event:
  - Daily recurrence, **19:00–23:59 WIB**.
- Email:
  - Google Calendar link + ICS for Outlook/Apple.
  - Removal email includes manual calendar deletion instructions.

### `web/index.html`

- Minimal chat-like widget:
  - Buttons: `Set Reminder`, `Check Status (ID)`, `Remove (ID)`.
  - Validates **email** format.
  - Friendly copy (double-click tip, alias allowed, real email required).

### `streamlit/streamlit_app.py`

- Same actions with a simple app layout.
- Configure the backend URL via **Secrets**.

---

## 5) Local testing

You can test the Streamlit app locally:

```bash
cd streamlit
pip install -r requirements.txt
streamlit run streamlit_app.py
```

Create a `.streamlit/secrets.toml` file locally with:
```toml
API_BASE = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
APP_TITLE = "Dessa – Asisten Pengingat"
```

---

## 6) Troubleshooting

- **Buttons feel unresponsive** → Try **double-click** (some free hosts are cold-starting).
- **Emails not received** → Check Gmail spam folder; verify MailApp quotas; confirm email is valid.
- **Apps Script changes not applied** → Use **Manage deployments → Edit → Deploy** (don’t create a new URL).
- **Sheet headers mismatch** → Must be exactly: `ID | CreatedAt | Status | Name | Email`.
- **Time zone mismatch** → Set Apps Script **Project Settings → Time zone: Asia/Jakarta**.
- **GitHub Pages not showing** → Check Pages settings & branch/folder; ensure `index.html` is in the served folder.
- **Streamlit errors** → Verify `API_BASE` in Secrets; restart the app.

---

## 7) Security & limits

- This demo is **unauthenticated** (Web App access = Anyone). For internal use, consider restricting access behind a VPN or switching to Google Workspace + restricted access.
- Google Apps Script **MailApp** and **UrlFetchApp** have **daily quotas** on free accounts. For high volume, consider a transactional email service later.

---

## 8) Credits

Built with ❤️ using Google Apps Script, Google Sheets, GitHub Pages, and Streamlit Community Cloud.
