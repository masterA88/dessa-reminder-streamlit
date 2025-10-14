import re
import requests
import streamlit as st

API_BASE = st.secrets.get("API_BASE", "").strip()
APP_TITLE = st.secrets.get("APP_TITLE", "Dessa – Asisten Pengingat")

EMAIL_RE = re.compile(r'^[\w.+\-]+@([\w\-]+\.)+[A-Za-z]{2,}$')

if "mode" not in st.session_state:
    st.session_state.mode = "home"  # home | create | status | remove

def api_post(payload: dict):
    if not API_BASE:
        return False, "API_BASE belum diisi di Secrets."
    try:
        r = requests.post(API_BASE, json=payload, timeout=15)
        data = r.json()
        ok = r.ok and bool(data.get("success"))
        return ok, data if ok else data.get("message", "Gagal memproses.")
    except Exception as e:
        return False, f"Kesalahan koneksi: {e}"

def reset_to_home():
    st.session_state.mode = "home"

st.set_page_config(page_title=APP_TITLE, page_icon="🧭", layout="centered")
st.title(APP_TITLE)
st.caption("Hey there! I’m Dessa, H’s loyal AI assistant. What can I do for you today?")
st.divider()

# HOME
# HOME
if st.session_state.mode == "home":
    st.subheader("Halo! Aku Dessa 👋")
    st.markdown(
        """
**Pengingat harian 19:00–23:59 WIB**

- Aplikasi ini membantu karyawan membuat pengingat harian settlement transportasi (19:00–23:59 WIB) dan mengirim konfirmasi lewat email. 
- Tips: Jika tombol tidak merespons, **coba dobel-klik**.
- Nama boleh **samaran**, tapi **email harus asli** agar email konfirmasi & file ICS terkirim.
- Pilih aksi di bawah:
        """
    )
    col1, col2, col3 = st.columns(3)
    with col1:
        if st.button("➕ Set Reminder", use_container_width=True):
            st.session_state.mode = "create"
    with col2:
        if st.button("🔎 Cek Status (ID)", use_container_width=True):
            st.session_state.mode = "status"
    with col3:
        if st.button("🗑️ Hapus (ID)", use_container_width=True):
            st.session_state.mode = "remove"


# CREATE
elif st.session_state.mode == "create":
    st.subheader("Set Reminder")
    with st.form("create_form"):
        name = st.text_input("Nama", placeholder="cth: Sutijo")
        email = st.text_input("Email", placeholder="nama@perusahaan.com")
        submitted = st.form_submit_button("Simpan ✅")
    colA, _ = st.columns(2)
    with colA:
        if st.button("⬅️ Kembali"):
            reset_to_home()
    if submitted:
        if not name.strip():
            st.error("Nama wajib diisi.")
        elif not EMAIL_RE.match(email.strip()):
            st.error("Email tidak valid.")
        else:
            
            with st.spinner("Memproses..."):
                ok, res = api_post({"action":"create", "name":name.strip(), "email":email.strip()})
            if ok:
                st.success(f"Terima kasih, **{name}**! ID kamu: `{res.get('id')}`.")
            else:
                st.error(f"Gagal: {res}")

# STATUS (ID)
elif st.session_state.mode == "status":
    st.subheader("Cek Status (ID)")
    with st.form("status_form"):
        rid = st.text_input("ID Reminder", placeholder="cth: REM-20251014-AB12")
        submitted = st.form_submit_button("Cek 🔎")
    colA, _ = st.columns(2)
    with colA:
        if st.button("⬅️ Kembali"):
            reset_to_home()
    if submitted:
        if not rid.strip():
            st.error("ID wajib diisi.")
        else:
            with st.spinner("Memeriksa..."):
                ok, res = api_post({"action":"status","id":rid.strip()})
            if ok:
                st.success(f"Status: **{res.get('status','UNKNOWN')}**")
                st.caption(f"Nama: {res.get('name','-')} • Email: {res.get('email','-')}")
            else:
                st.error(f"Gagal: {res}")

# REMOVE (ID)
elif st.session_state.mode == "remove":
    st.subheader("Hapus (ID)")
    with st.form("remove_form"):
        rid = st.text_input("ID Reminder", placeholder="cth: REM-20251014-AB12")
        submitted = st.form_submit_button("Hapus ❌")
    colA, _ = st.columns(2)
    with colA:
        if st.button("⬅️ Kembali"):
            reset_to_home()
    if submitted:
        if not rid.strip():
            st.error("ID wajib diisi.")
        else:
            with st.spinner("Memeriksa & membatalkan..."):
                ok, res = api_post({"action":"remove","id":rid.strip()})
            if ok:
                st.success(f"Reminder `{rid}` sudah **dibatalkan**.")
                st.info("Jika event sudah masuk kalender, hapus manual di Google/Outlook/Apple.")
            else:
                st.error(f"Gagal: {res}")

st.divider()
st.caption("© 2025 Dessa • Versi sederhana: Set/Cek/Hapus berbasis ID.")
