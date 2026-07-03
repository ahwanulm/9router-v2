#!/usr/bin/env python3
"""Standalone script to automate Canva invite enrollment & Leonardo login using Playwright/Camoufox.
Outputs step logs and final results to stdout as JSON lines.
"""

import sys
import json
import argparse
import time
import logging
import re
import sqlite3
import socket
from pathlib import Path
from urllib.parse import urlparse

# Patch Playwright's Locator.is_visible to support the timeout argument
try:
    from playwright.sync_api import Locator
    _orig_is_visible = Locator.is_visible
    def _patched_is_visible(self, *args, **kwargs):
        timeout = kwargs.pop("timeout", None)
        if timeout is None and len(args) > 0:
            timeout = args[0]
            args = args[1:]
        if timeout is not None:
            try:
                self.wait_for(state="visible", timeout=float(timeout))
                return True
            except Exception:
                return False
        return _orig_is_visible(self, *args, **kwargs)
    Locator.is_visible = _patched_is_visible
except ImportError:
    pass

_dns_cache = {}

def dns_query_udp(hostname, dns_server="8.8.8.8"):
    try:
        packet = bytearray()
        packet.extend(b"\xaa\xbb\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00")
        for part in hostname.split("."):
            packet.append(len(part))
            packet.extend(part.encode())
        packet.append(0)
        packet.extend(b"\x00\x01\x00\x01")
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(2.0)
        sock.sendto(packet, (dns_server, 53))
        data, _ = sock.recvfrom(512)
        idx = len(packet)
        while idx < len(data) - 16:
            if data[idx+2:idx+6] == b"\x00\x01\x00\x01":
                rdlength = int.from_bytes(data[idx+10:idx+12], "big")
                if rdlength == 4:
                    return ".".join(str(b) for b in data[idx+12:idx+16])
            idx += 1
    except Exception:
        pass
    return None

original_getaddrinfo = socket.getaddrinfo

def patched_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    if host in ["mail.pixelnest.pro", "tempmail-9router.ahwancules.workers.dev"]:
        if host not in _dns_cache:
            ip = dns_query_udp(host)
            if not ip:
                ip = "104.21.71.228" if host == "mail.pixelnest.pro" else "172.67.188.186"
            _dns_cache[host] = ip
        return original_getaddrinfo(_dns_cache[host], port, family, type, proto, flags)
    return original_getaddrinfo(host, port, family, type, proto, flags)

socket.getaddrinfo = patched_getaddrinfo

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger("leonardo_signup")

CANVA_HOME_URL = "https://www.canva.com/"
CANVA_LOGIN_URL = "https://www.canva.com/login"
LEONARDO_LOGIN_URL = "https://app.leonardo.ai/auth/login"
LEONARDO_SESSION_URL = "https://app.leonardo.ai/api/auth/session"
LEONARDO_GET_SESSION_URL = "https://app.leonardo.ai/api/auth/get-session"

def log_step(msg, *args):
    txt = msg % args if args else msg
    sys.stdout.write(json.dumps({"step": txt}, ensure_ascii=False) + "\n")
    sys.stdout.flush()

# Lightweight debug screenshot utility
_debug_page = None
_DEBUG_PATH = "/tmp/9router_debug.png"

def update_debug_screenshot(page):
    """Safely update /tmp/9router_debug.png."""
    if page:
        try:
            page.screenshot(path=_DEBUG_PATH, timeout=2000)
        except Exception:
            pass

_orig_sleep = time.sleep

def _patched_sleep(seconds):
    global _debug_page
    if _debug_page is None:
        _orig_sleep(seconds)
        return
    
    end_time = time.time() + seconds
    while time.time() < end_time:
        remaining = end_time - time.time()
        chunk = min(0.4, remaining)
        if chunk <= 0:
            break
        _orig_sleep(chunk)
        try:
            update_debug_screenshot(_debug_page)
        except Exception:
            pass

time.sleep = _patched_sleep

def start_debug_screenshots(page):
    """Start capturing screenshots synchronously."""
    global _debug_page
    _debug_page = page
    update_debug_screenshot(page)

def stop_debug_screenshots():
    """Stop capturing screenshots and clean up temp screenshot file."""
    global _debug_page
    _debug_page = None
    try:
        import os
        if os.path.exists(_DEBUG_PATH):
            os.remove(_DEBUG_PATH)
    except Exception:
        pass

def safe_email_to_dirname(email: str) -> str:
    cleaned = (email or "").strip().lower()
    cleaned = cleaned.replace("@", "_at_")
    cleaned = re.sub(r"[^a-z0-9._-]+", "_", cleaned)
    cleaned = cleaned.strip("._-")
    return cleaned or "account"

def normalize_cookies(cookies_list) -> str:
    pairs = []
    seen = set()
    for item in sorted(cookies_list or [], key=lambda c: (c.get("name") or "").lower()):
        name = (item.get("name") or "").strip()
        value = item.get("value", "")
        if not name or value is None:
            continue
        if not isinstance(value, str):
            value = str(value)
        if name in seen:
            continue
        seen.add(name)
        pairs.append(f"{name}={value}")
    return "; ".join(pairs)

def get_db_path() -> Path:
    # Respect DATA_DIR env var, same logic as Node.js src/lib/dataDir.js
    import os
    data_dir_env = os.environ.get("DATA_DIR", "").strip()
    if data_dir_env:
        p = Path(data_dir_env) / "db" / "data.sqlite"
        if p.exists():
            return p
    # Fallback: ~/.9router/db/data.sqlite
    return Path.home() / ".9router-v2" / "db" / "data.sqlite"

from datetime import datetime
import urllib.request
import urllib.error

def iso_to_unix(iso_str: str) -> int:
    try:
        clean = iso_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean)
        return int(dt.timestamp())
    except Exception as e:
        logger.warning(f"Error parsing date {iso_str}: {e}")
        return int(time.time())

def extract_otp_py(text: str, html: str = "", subject: str = "") -> tuple:
    parts = [subject or "", text or "", html or ""]
    haystack = "\n".join(filter(None, parts))
    
    clean_text = re.sub(r"<style[\s\S]*?</style>", " ", haystack, flags=re.IGNORECASE)
    clean_text = re.sub(r"<script[\s\S]*?</script>", " ", clean_text, flags=re.IGNORECASE)
    clean_text = re.sub(r"<[^>]+>", " ", clean_text)
    clean_text = re.sub(r"\s+", " ", clean_text).strip()
    
    labeled_pattern = r"(?:verification\s*code|verify\s*code|security\s*code|one[-\s]?time\s*(?:password|code|pin)|\bOTP\b|\bPIN\b|\bcode\s*(?:is|:)|\bcode\b)\s*[:#-]?\s*([0-9]{4,8})\b"
    match = re.search(labeled_pattern, clean_text, re.IGNORECASE)
    if match:
        code = match.group(1)
    else:
        loose_pattern = r"(?<![0-9])([0-9]{4,8})(?![0-9])"
        match_loose = re.search(loose_pattern, clean_text)
        code = match_loose.group(1) if match_loose else ""
        
    verify_url = ""
    url_pattern = r"\bhttps?://[^\s<>'\"`]+"
    urls = re.findall(url_pattern, haystack)
    for url in urls:
        url_lower = url.lower()
        if not any(x in url_lower for x in ["w3.org", "xml"]) and not url_lower.endswith((".dtd", ".xsd", ".woff", ".woff2", ".png", ".jpg", ".jpeg", ".gif", ".css", ".js")):
            if not any(x in url_lower for x in ["utm_content=logo", "help.figma.com", "static.figma.com", "x.com", "instagram.com", "youtube.com", "linkedin.com"]):
                verify_url = url
                break
                
    if verify_url:
        verify_url = verify_url.replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'")
        
    return code, verify_url

def sync_ammail_messages(email: str, since_ts: int):
    """Sync messages directly from Ammail API and store in SQLite."""
    db_path = get_db_path()
    if not db_path.exists():
        return

    settings = {}
    try:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT data FROM settings WHERE id = 1")
        row = cursor.fetchone()
        conn.close()
        if row:
            settings = json.loads(row["data"])
    except Exception as e:
        logger.warning(f"Error loading settings for Ammail sync: {e}")
        return

    api_key = settings.get("ammail_api_key")
    base_url = settings.get("ammail_base_url")
    fallback_url = settings.get("ammail_cf_workers_dev_url")

    if not api_key or (not base_url and not fallback_url):
        return

    alias = email.split("@")[0]
    domain = email.split("@")[1] if "@" in email else ""

    urls_to_try = []
    if base_url:
        urls_to_try.append(base_url.rstrip("/"))
    if fallback_url:
        urls_to_try.append(fallback_url.rstrip("/"))

    messages = []
    for base in urls_to_try:
        url = f"{base}/api/inboxes/{alias}/messages"
        req = urllib.request.Request(
            url,
            headers={
                "X-API-Key": api_key,
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                data = json.loads(res.read().decode("utf-8"))
                messages = data.get("messages", [])
                if messages:
                    break
        except Exception as e:
            logger.warning(f"Failed to fetch inbox messages from {url}: {e}")

    if not messages:
        return

    for msg in messages:
        msg_id = msg.get("id")
        if not msg_id:
            continue

        try:
            conn = sqlite3.connect(str(db_path))
            cursor = conn.cursor()
            cursor.execute("SELECT 1 FROM ammailOtps WHERE messageShortId = ?", (msg_id,))
            exists = cursor.fetchone()
            conn.close()
            if exists:
                continue
        except Exception as e:
            logger.warning(f"Error checking message existence: {e}")
            continue

        full_msg = None
        for base in urls_to_try:
            url = f"{base}/api/messages/{msg_id}"
            req = urllib.request.Request(
                url,
                headers={
                    "X-API-Key": api_key,
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            )
            try:
                with urllib.request.urlopen(req, timeout=10) as res:
                    data = json.loads(res.read().decode("utf-8"))
                    full_msg = data.get("message")
                    if full_msg:
                        break
            except Exception as e:
                logger.warning(f"Failed to fetch full message {msg_id} from {url}: {e}")

        if not full_msg:
            continue

        body_text = str(full_msg.get("text") or msg.get("snippet") or "")
        body_html = str(full_msg.get("html") or "")
        from_data = full_msg.get("from") or msg.get("from") or {}
        sender = str(from_data.get("address") or from_data.get("name") or "")
        subject = str(full_msg.get("subject") or msg.get("subject") or "")
        received_at_str = full_msg.get("receivedAt") or msg.get("receivedAt") or ""
        received_at = iso_to_unix(received_at_str)

        otp_code, verify_url = extract_otp_py(body_text, body_html, subject)

        try:
            conn = sqlite3.connect(str(db_path))
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO ammailOtps (
                    address, alias, domain, sender, subject, otpCode, verifyUrl, 
                    bodyText, bodyHtml, messageShortId, rawEventJson, receivedAt, usedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (
                    email, alias, domain, sender, subject, otp_code, verify_url,
                    body_text, body_html, msg_id, json.dumps(full_msg), received_at
                )
            )
            conn.commit()
            conn.close()
            log_step(f"Sync: Tersinkronisasi email baru dari API: {subject} (OTP: {otp_code})")
        except Exception as e:
            logger.warning(f"Error storing synced OTP to SQLite: {e}")

def wait_for_otp_from_db(email: str, since_ts: int, timeout: int = 180) -> tuple:
    """Poll the sqlite database and Ammail API for the latest unused OTP code for email."""
    db_path = get_db_path()
    if not db_path.exists():
        log_step(f"Database file tidak ditemukan di {db_path}, menunggu OTP dialihkan...")
        return "", ""

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            sync_ammail_messages(email, since_ts)
        except Exception as e:
            logger.warning(f"Error syncing Ammail messages: {e}")

        try:
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, otpCode, verifyUrl FROM ammailOtps WHERE LOWER(address) = ? AND receivedAt >= ? AND usedAt = 0 ORDER BY receivedAt DESC LIMIT 1",
                (email.lower(), since_ts)
            )
            row = cursor.fetchone()
            if row:
                otp_id = row["id"]
                otp_code = row["otpCode"]
                verify_url = row["verifyUrl"]
                now_unix = int(time.time())
                cursor.execute("UPDATE ammailOtps SET usedAt = ? WHERE id = ?", (now_unix, otp_id))
                conn.commit()
                conn.close()
                return otp_code, verify_url
            conn.close()
        except Exception as e:
            logger.warning(f"Error querying SQLite: {e}")
        time.sleep(2)
    return "", ""

def click_first(page, selectors, timeout_ms: int = 8000) -> bool:
    deadline = time.time() + (timeout_ms / 1000.0)
    while time.time() < deadline:
        for sel in selectors:
            try:
                loc = page.locator(sel).first
                if loc.count() > 0 and loc.is_visible(timeout=300):
                    try:
                        loc.click(timeout=1000)
                        return True
                    except Exception:
                        pass
                    try:
                        handle = loc.element_handle(timeout=300)
                        if handle:
                            page.evaluate("(el) => el.click()", handle)
                            return True
                    except Exception:
                        pass
            except Exception:
                continue
        time.sleep(0.3)
    return False

def fill_first(page, selectors, value: str, timeout_ms: int = 8000) -> bool:
    deadline = time.time() + (timeout_ms / 1000.0)
    while time.time() < deadline:
        for sel in selectors:
            try:
                loc = page.locator(sel).first
                if loc.count() > 0 and loc.is_visible(timeout=300):
                    loc.fill(value, timeout=1000)
                    return True
            except Exception:
                continue
        time.sleep(0.3)
    return False

def enroll_canva_via_email(page, invite_link: str, email: str, password: str) -> bool:
    log_step("Membuka Canva invite link...")
    page.goto(invite_link, wait_until="domcontentloaded", timeout=60000)
    time.sleep(2)

    # Click cookie banner if any
    click_first(page, [
        "button:has-text('Accept all cookies')",
        "button:has-text('Terima semua')",
        "button:has-text('Accept')"
    ], timeout_ms=3000)

    # Continue with email button
    email_btn_selectors = [
        "button[aria-label='Continue with email']",
        "button[aria-label='Sign up with email']",
        "button:has-text('Continue with email')",
        "button:has-text('Sign up with email')",
        "button:has-text('Use email')"
    ]
    log_step("Mencari tombol daftar dengan email...")
    if not click_first(page, email_btn_selectors, timeout_ms=15000):
        # Maybe already logged in or layout different, check if email input is directly on page
        pass

    email_input_selectors = [
        "input[name='username'][inputmode='email']",
        "input[type='email']",
        "input[name='email']",
        "input[placeholder*='email' i]"
    ]
    log_step("Mengisi email...")
    if not fill_first(page, email_input_selectors, email, timeout_ms=10000):
        log_step("Form email Canva tidak ditemukan. Cek apakah sudah terdaftar / terlogin.")
        if "canva.com" in page.url and "/signup" not in page.url and "/login" not in page.url:
            return True
        raise RuntimeError("Gagal menemukan form input email Canva")

    otp_since_ts = int(time.time()) - 5
    log_step("Mengklik tombol Continue setelah email...")
    click_first(page, ["button[type='submit']", "button:has-text('Continue')"], timeout_ms=5000)
    time.sleep(3)

    # Polling OTP or Password screen
    deadline = time.time() + 180
    otp_filled = False
    password_filled = False
    name_filled = False

    while time.time() < deadline:
        cur_url = page.url.lower()
        if "/signup" not in cur_url and "/signin" not in cur_url and "/login" not in cur_url and "/verify" not in cur_url:
            log_step("Pendaftaran Canva sukses (berhasil melewati form auth)")
            break

        # Check if password field is visible (existing account)
        pw_input = page.locator("input[type='password']").first
        if pw_input.count() > 0 and pw_input.is_visible(timeout=300) and not password_filled:
            log_step("Akun Canva sudah terdaftar, mengisi password...")
            pw_input.fill(password)
            click_first(page, ["button[type='submit']", "button:has-text('Log in')", "button:has-text('Masuk')"])
            password_filled = True
            time.sleep(3)
            continue

        # Check if Name field is visible (new account)
        name_selectors = [
            "input[name='firstName']",
            "input[autocomplete='given-name']",
            "input[name='name']",
            "input[name='fullName']",
            "input[name='displayName']",
            "input[placeholder*='name' i]",
            "input[placeholder*='nama' i]",
            "input[aria-label*='name' i]",
        ]
        name_input = page.locator(", ".join(name_selectors)).first
        if name_input.count() > 0 and name_input.is_visible(timeout=300) and not name_filled:
            log_step("Mengisi nama untuk akun baru...")
            name_input.fill("User")
            # Set canvas password as well if prompted
            pw_input_new = page.locator("input[name='password'], input[type='password']").first
            if pw_input_new.count() > 0 and pw_input_new.is_visible(timeout=300):
                pw_input_new.fill(password)
            click_first(page, ["button[type='submit']", "button:has-text('Create account')", "button:has-text('Continue')", "button:has-text('Get started')"])
            name_filled = True
            time.sleep(3)
            continue

        # Check if OTP field is visible
        otp_boxes = page.locator("input[maxlength='1']")
        otp_single = page.locator("input[name='code'], input[name='otp'], input[autocomplete='one-time-code']").first
        
        is_otp_screen = (otp_boxes.count() >= 4 and otp_boxes.first.is_visible(timeout=200)) or (otp_single.count() > 0 and otp_single.is_visible(timeout=200))

        if is_otp_screen and not otp_filled:
            log_step("Halaman OTP Canva aktif, polling kode OTP dari database...")
            otp_code, verify_url = wait_for_otp_from_db(email, otp_since_ts, timeout=180)
            if not otp_code and not verify_url:
                raise RuntimeError("Timeout menunggu OTP Canva dari Ammail")

            if otp_code:
                log_step(f"OTP Canva didapat: {otp_code}, mengisi...")
                digits = re.sub(r"\D", "", otp_code)
                if otp_boxes.count() >= 4:
                    for i in range(min(otp_boxes.count(), len(digits))):
                        otp_boxes.nth(i).press_sequentially(digits[i], delay=100)
                else:
                    otp_single.click()
                    otp_single.press_sequentially(digits, delay=100)
                otp_filled = True
                time.sleep(1.5)
                click_first(page, ["button[type='submit']", "button:has-text('Verify')", "button:has-text('Continue')"])
            elif verify_url:
                log_step(f"Link verifikasi didapat: {verify_url}, membuka...")
                page.goto(verify_url)
                otp_filled = True
            time.sleep(4)
            continue

        # If OTP was filled but we're still on signup, try clicking any visible button (ONE TIME ONLY)
        if otp_filled and "/signup" in cur_url and not getattr(enroll_canva_via_email, '_post_otp_clicked', False):
            enroll_canva_via_email._post_otp_clicked = True  # type: ignore
            time.sleep(2)  # Wait for any form to render
            # Try clicking any continue/submit button that may have appeared
            clicked_any = click_first(page, [
                "button[type='submit']",
                "button:has-text('Continue')",
                "button:has-text('Get started')",
                "button:has-text('Create account')",
                "button:has-text('Lanjutkan')",
                "button:has-text('Mulai')",
            ], timeout_ms=1000)
            if clicked_any:
                log_step("Mengklik tombol lanjut setelah OTP...")
                time.sleep(3)
                continue

        # Check for Canva security block error
        try:
            for err_text in ["can't sign you up", "security reasons", "can't log you in"]:
                err_loc = page.locator(f"text={err_text}").first
                if err_loc.count() > 0 and err_loc.is_visible(timeout=300):
                    raise RuntimeError(f"Canva security block: '{err_text}'. Coba matikan VPN, ganti IP, atau gunakan browser non-headless.")
        except RuntimeError:
            raise
        except Exception:
            pass

        time.sleep(1)
        # Periodic status log so we can see what's happening
        if int(time.time()) % 10 == 0:
            log_step(f"Menunggu transisi auth... URL: {page.url[:80]}")
            # One-shot screenshot after OTP for diagnostics
            if otp_filled and not hasattr(enroll_canva_via_email, '_post_otp_ss'):
                try:
                    debug_dir = Path("profiles") / "canva_debug"
                    debug_dir.mkdir(parents=True, exist_ok=True)
                    ts = int(time.time())
                    page.screenshot(path=str(debug_dir / f"post_otp_stuck_{ts}.png"), full_page=True, timeout=10000)
                    log_step(f"Screenshot post-OTP disimpan: profiles/canva_debug/post_otp_stuck_{ts}.png")
                    enroll_canva_via_email._post_otp_ss = True  # type: ignore
                except Exception:
                    pass

    # Accept team invitation if prompt appears
    log_step("Memastikan masuk ke dalam Canva Team...")
    click_first(page, [
        "button:has-text('Join the team')",
        "button:has-text('Gabung ke tim')",
        "button:has-text('Got it')",
        "button:has-text('Understood')"
    ], timeout_ms=8000)
    time.sleep(3)
    return True

def do_google_login(page, email: str, password: str) -> bool:
    GOOGLE_EMAIL_SELECTORS = ["input[type='email']", "input[name='identifier']"]
    GOOGLE_PASSWORD_SELECTORS = ["input[type='password']"]
    GOOGLE_NEXT_SELECTORS = [
        "#identifierNext button",
        "#passwordNext button",
        "button:has-text('Next')",
        "button:has-text('Berikutnya')",
        "button:has-text('Berikut')",
        "button:has-text('Lanjutkan')"
    ]

    log_step("Mengisi email Google...")
    has_email_field = fill_first(page, GOOGLE_EMAIL_SELECTORS, email, timeout_ms=8000)
    if not has_email_field:
        # Maybe accounts page displays account list
        account_sel = f"div[data-identifier='{email.lower()}']"
        if page.locator(account_sel).count() > 0:
            page.locator(account_sel).click()
            log_step(f"Memilih akun Google {email}")
            time.sleep(2)
        else:
            log_step("Field email Google tidak ditemukan dan tidak ada account chooser.")
    else:
        click_first(page, GOOGLE_NEXT_SELECTORS, timeout_ms=5000)
        time.sleep(2)

    # Check if password field is visible
    pw_input = page.locator("input[type='password']").first
    if pw_input.count() > 0 and pw_input.is_visible(timeout=5000):
        log_step("Mengisi password Google...")
        pw_input.fill(password)
        click_first(page, GOOGLE_NEXT_SELECTORS, timeout_ms=5000)
        log_step("Google credentials disubmit.")
        time.sleep(3)
    else:
        log_step("Field password Google tidak muncul, mungkin session Google sudah aktif.")

    # Handle Google OAuth consent screen if visible
    log_step("Memeriksa Google Consent Screen...")
    consent_buttons = [
        "button:has-text('I understand')",
        "button:has-text('Saya mengerti')",
        "button:has-text('Understand')",
        "button:has-text('Continue')",
        "button:has-text('Lanjutkan')",
        "button:has-text('Allow')",
        "button:has-text('Izinkan')",
        "button:has-text('Agree')",
        "button:has-text('Setuju')",
    ]
    for _ in range(10):
        found_consent = False
        for sel in consent_buttons:
            try:
                loc = page.locator(sel).first
                if loc.count() > 0 and loc.is_visible(timeout=500):
                    log_step(f"Google Consent Screen terdeteksi, mengklik {sel}...")
                    loc.click(timeout=3000)
                    found_consent = True
                    time.sleep(3)
                    break
            except Exception:
                pass
        if not found_consent:
            # Check if we already redirected away from Google
            if "google.com" not in page.url.lower():
                break
            time.sleep(1)
        
    return True

def enroll_canva_via_google(page, invite_link: str, email: str, password: str) -> bool:
    log_step("Membuka Canva invite link...")
    page.goto(invite_link, wait_until="domcontentloaded", timeout=60000)
    time.sleep(2)

    click_first(page, ["button:has-text('Accept all cookies')", "button:has-text('Accept')"], timeout_ms=3000)

    # Listen for Google OAuth popup
    popup_holder = {}
    def _on_popup(p):
        popup_holder["page"] = p
        log_step(f"Popup Google OAuth terdeteksi: {p.url[:80]}")
    page.on("popup", _on_popup)

    # Click Google button
    google_btn_selectors = [
        "button[aria-label*='Google' i]",
        "button:has-text('Google')",
        "button:has-text('google')",
        "button[aria-label='Continue with Google']",
        "button[aria-label='Sign up with Google']",
        "button:has-text('Continue with Google')",
        "button:has-text('Sign up with Google')"
    ]
    log_step("Mengklik Continue with Google di Canva...")
    if not click_first(page, google_btn_selectors, timeout_ms=15000):
        raise RuntimeError("Tombol Google di Canva tidak ditemukan")

    # Wait for popup or redirect to load google.com
    auth_page = page
    deadline = time.time() + 15.0
    while time.time() < deadline:
        p_cand = popup_holder.get("page")
        if p_cand is not None:
            auth_page = p_cand
            break
        if "google.com" in page.url:
            auth_page = page
            break
        page.wait_for_timeout(300)

    time.sleep(3)
    # Wait for google.com URL on either main page or popup
    if "google.com" in auth_page.url:
        do_google_login(auth_page, email, password)

    # Wait to get back to Canva
    log_step("Menunggu redirect kembali ke Canva...")
    try:
        page.wait_for_url("**/canva.com/**", timeout=30000)
    except Exception:
        pass

    # Accept team invitation
    click_first(page, [
        "button:has-text('Join the team')",
        "button:has-text('Gabung ke tim')",
        "button:has-text('Got it')"
    ], timeout_ms=10000)
    time.sleep(3)
    return True

# Canva session cookie markers — must match leoapi-main
CANVA_SESSION_MARKERS = [
    "cna_user_id",
    "_user_id",
    "auth_token",
    "cna_session",
    "__Host-canva-session",
    "__Secure-canva-session",
    "canva-session",
    "CID",
    "csid",
]

def has_canva_session(cookies_list) -> bool:
    """Check if Canva session cookies indicate an active login."""
    names_lower = [(c.get("name") or "").lower() for c in (cookies_list or [])]
    markers_lower = [m.lower() for m in CANVA_SESSION_MARKERS]
    return any(any(m in n for m in markers_lower) for n in names_lower)

def get_canva_cookies(context) -> list:
    """Query origin-specific Canva cookies, matching leoapi-main."""
    try:
        cookies = context.cookies("https://www.canva.com")
    except Exception:
        cookies = context.cookies()
    return [
        c for c in (cookies or [])
        if "canva.com" in (c.get("domain") or "").lower()
    ]

def has_leonardo_session(cookies_list) -> bool:
    names_lower = [(c.get("name") or "").lower() for c in (cookies_list or [])]
    markers = [
        "better-auth.session_token",
        "better-auth.session-token",
        "__secure-better-auth.session_token",
        "__secure-better-auth.session-token",
        "next-auth.session-token",
        "__secure-next-auth.session-token",
        "authjs.session-token",
        "__secure-authjs.session-token",
    ]
    for name in names_lower:
        for marker in markers:
            if marker in name and "oauth_state" not in name and "csrf" not in name:
                return True
    return False

def wait_for_leo_session(context, timeout_ms: int = 25000) -> list:
    deadline = time.time() + (timeout_ms / 1000.0)
    last_cookies = []
    while time.time() < deadline:
        try:
            cookies = context.cookies("https://app.leonardo.ai")
        except Exception:
            cookies = context.cookies()
        
        leo_cookies = [
            c for c in (cookies or [])
            if "leonardo.ai" in (c.get("domain") or "").lower()
        ]
        last_cookies = leo_cookies
        if has_leonardo_session(leo_cookies):
            return leo_cookies
        time.sleep(0.3)
    return last_cookies

def relogin_canva(context, page, email: str, password: str, signup_method: str = "google") -> bool:
    """Re-establish Canva session for an already-enrolled account.
    
    Opens Canva login page in existing profile. If session is still alive,
    returns immediately. Otherwise drives email/Google login flow.
    """
    log_step("Membuka halaman login Canva untuk verifikasi session...")
    page.goto(CANVA_LOGIN_URL, wait_until="domcontentloaded", timeout=60000)
    try:
        page.wait_for_load_state("networkidle", timeout=10000)
    except Exception:
        pass
    time.sleep(2)

    # Accept cookie banner if any
    click_first(page, [
        "button:has-text('Accept all cookies')",
        "button:has-text('Terima semua')",
        "button:has-text('Accept')"
    ], timeout_ms=3000)

    # Check if session is still alive using origin-specific cookies query
    canva_cookies = get_canva_cookies(context)
    cur_url = page.url.lower()
    log_step("Memeriksa session Canva... (URL: %s, cookies: %d)", cur_url[:60], len(canva_cookies))
    
    # Session cookies are the ground truth — if present, session is alive
    if has_canva_session(canva_cookies):
        log_step("Session Canva masih aktif (cookie terdeteksi) — skip re-login.")
        return True
    
    # Also check if URL redirected away from login (session might be alive without markers)
    if "/login" not in cur_url and "/signup" not in cur_url:
        log_step("Session Canva masih aktif (URL bukan login) — skip re-login.")
        return True

    # Session dead → drive login
    log_step("Session Canva expired, memulai re-login...")
    if signup_method == "google":
        log_step("Menjalankan re-login via Google OAuth...")
        
        # Listen for Google OAuth popup
        popup_holder = {}
        def _on_popup(p):
            popup_holder["page"] = p
            log_step(f"Popup Google OAuth terdeteksi: {p.url[:80]}")
        page.on("popup", _on_popup)

        google_btn_selectors = [
            "button[aria-label*='Google' i]",
            "button:has-text('Google')",
            "button:has-text('google')",
            "button[aria-label='Continue with Google']",
            "button[aria-label='Sign up with Google']",
            "button:has-text('Continue with Google')",
            "button:has-text('Sign up with Google')"
        ]
        if not click_first(page, google_btn_selectors, timeout_ms=15000):
            raise RuntimeError("Tombol Google di Canva tidak ditemukan saat re-login (GSuite)")
        
        # Wait for popup or redirect to load google.com
        auth_page = page
        deadline = time.time() + 15.0
        while time.time() < deadline:
            p_cand = popup_holder.get("page")
            if p_cand is not None:
                auth_page = p_cand
                break
            if "google.com" in page.url:
                auth_page = page
                break
            page.wait_for_timeout(300)

        time.sleep(3)
        if "google.com" in auth_page.url:
            do_google_login(auth_page, email, password)
        try:
            page.wait_for_url("**/canva.com/**", timeout=30000)
        except Exception:
            pass
    else:
        log_step("Menjalankan re-login via Email + OTP...")
        _drive_canva_email_login(context, page, email, password="")
    
    # Verify session is now live (check cookies OR URL)
    time.sleep(2)
    canva_cookies = get_canva_cookies(context)
    
    if has_canva_session(canva_cookies):
        log_step("Re-login Canva berhasil (session cookie aktif).")
        return True
    
    final_url = page.url.lower()
    if "/login" in final_url or "/signup" in final_url:
        raise RuntimeError(f"Re-login Canva gagal — masih di halaman login. URL: {page.url}")
    
    log_step("Re-login Canva berhasil.")
    return True

def _drive_canva_email_login(context, page, email: str, password: str = ""):
    """Fill email on Canva login page and handle OTP/password.
    
    Used for re-login (session expired) and OAuth popup re-login.
    Handles 'Jump back in!' screen from cached profile.
    context is needed to check session cookies as success condition.
    """
    # Handle "Jump back in!" screen (cached profile login)
    log_step("Memeriksa halaman login Canva... (URL: %s)", page.url[:80])
    jump_back_selectors = [
        "button:has-text('Continue with another account')",
        "button:has-text('Lanjutkan dengan akun lain')",
        "button:has-text('another account')",
        "button:has-text('akun lain')",
    ]
    jump_back_clicked = False
    for sel in jump_back_selectors:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=1000):
                # Check if our email is shown on the cached account
                try:
                    email_loc = page.locator(f"text={email}").first
                    if email_loc.count() > 0 and email_loc.is_visible(timeout=500):
                        log_step("'Jump back in!' terdeteksi — klik Continue untuk %s...", email[:30])
                        continue_sels = [
                            "button:has-text('Continue')",
                            "button:has-text('Lanjutkan')",
                        ]
                        for c_sel in continue_sels:
                            try:
                                c_loc = page.locator(c_sel).first
                                if c_loc.count() > 0 and c_loc.is_visible(timeout=500):
                                    c_loc.click(timeout=3000)
                                    jump_back_clicked = True
                                    break
                            except Exception:
                                continue
                        if jump_back_clicked:
                            log_step("Continue diklik, menunggu navigasi...")
                            time.sleep(2)
                            break
                except Exception:
                    pass

                if not jump_back_clicked:
                    log_step("'Jump back in!' terdeteksi, klik 'Continue with another account'...")
                    loc.click(timeout=5000)
                    time.sleep(2)
                break
        except Exception:
            continue

    if not jump_back_clicked:
        # Click 'Continue with email' if needed
        log_step("Mencari tombol 'Continue with email'...")
        clicked_email_btn = click_first(page, [
            "button[aria-label='Continue with email']",
            "button[aria-label='Log in with email']",
            "button[aria-label='Masuk dengan email']",
            "button:has-text('Continue with email')",
            "button:has-text('Log in with email')",
            "button:has-text('Use email')",
            "button:has-text('Masuk dengan email')",
        ], timeout_ms=8000)
        
        if clicked_email_btn:
            log_step("Tombol email diklik, menunggu form...")
        else:
            log_step("Tombol email tidak ditemukan, mencoba langsung isi email...")
        time.sleep(1)

        # Fill email
        log_step("Mengisi email: %s...", email[:30])
        email_input_selectors = [
            "input[name='username'][inputmode='email']",
            "input[autocomplete='username'][inputmode='email']",
            "input[type='email']",
            "input[name='email']",
            "input[inputmode='email']",
            "input[placeholder*='email' i]"
        ]
        if not fill_first(page, email_input_selectors, email, timeout_ms=10000):
            raise RuntimeError(f"Form email Canva tidak ditemukan. URL: {page.url}")

        log_step("Email diisi, klik Continue...")
        click_first(page, ["button[type='submit']", "button:has-text('Continue')", "button:has-text('Lanjutkan')"], timeout_ms=5000)
        time.sleep(3)

    otp_since_ts = int(time.time()) - 5

    # Polling OTP or Password screen
    deadline = time.time() + 180
    otp_filled = False
    password_filled = False
    name_filled = False
    poll_count = 0

    while time.time() < deadline:
        cur_url = page.url.lower()
        if "/signup" not in cur_url and "/signin" not in cur_url and "/login" not in cur_url and "/verify" not in cur_url:
            log_step("Re-login Canva berhasil (URL melewati form auth)")
            break

        # Also check session cookies — Canva might stay on /login/onboarding
        if context is not None:
            try:
                canva_cookies = get_canva_cookies(context)
                if has_canva_session(canva_cookies):
                    log_step("Re-login Canva berhasil (session cookie terdeteksi)")
                    break
            except Exception:
                pass

        # Log progress every 10 iterations so UI knows it's alive
        poll_count += 1
        if poll_count % 10 == 0:
            remaining = int(deadline - time.time())
            log_step("Menunggu respons Canva... (timeout: %ds, URL: %s)", remaining, cur_url[:60])

        # Check if Name field is visible (new/incomplete account — "Create your account")
        # On re-login, Canva pre-fills the name — just click Continue without password
        name_input = page.locator("input[name='firstName'], input[autocomplete='given-name'], input[name='name']").first
        if name_input.count() > 0 and name_input.is_visible(timeout=300) and not name_filled:
            log_step("Form 'Create your account' terdeteksi, klik Continue...")
            # Canva usually pre-fills the name, just ensure it's not empty
            try:
                val = name_input.input_value(timeout=1000)
                if not val.strip():
                    name_guess = email.split("@")[0].replace("_", " ").replace(".", " ").title()
                    name_input.fill(name_guess)
            except Exception:
                pass
            click_first(page, ["button[type='submit']", "button:has-text('Continue')", "button:has-text('Create account')"])
            name_filled = True
            time.sleep(3)
            continue

        # Check password field
        pw_input = page.locator("input[type='password']").first
        if pw_input.count() > 0 and pw_input.is_visible(timeout=300) and not password_filled:
            if password:
                log_step("Mengisi password Canva...")
                pw_input.fill(password)
                click_first(page, ["button[type='submit']", "button:has-text('Log in')", "button:has-text('Masuk')"])
                password_filled = True
                time.sleep(3)
                continue
            else:
                log_step("Form password Canva muncul tapi password kosong. Mencoba tombol 'Log in with code'...")
                clicked_code = click_first(page, [
                    "button:has-text('Log in with code')",
                    "button:has-text('Use code')",
                    "button:has-text('Log in with a code')",
                    "button:has-text('Masuk dengan kode')",
                    "button:has-text('Gunakan kode')"
                ], timeout_ms=3000)
                if clicked_code:
                    log_step("Tombol masuk dengan kode diklik, menunggu halaman OTP...")
                    time.sleep(3)
                    continue
                else:
                    log_step("Form password Canva muncul tapi tidak ada tombol code fallback.")

        # Check OTP field
        otp_boxes = page.locator("input[maxlength='1']")
        otp_single = page.locator("input[name='code'], input[name='otp'], input[autocomplete='one-time-code']").first
        is_otp_screen = (otp_boxes.count() >= 4 and otp_boxes.first.is_visible(timeout=200)) or \
                        (otp_single.count() > 0 and otp_single.is_visible(timeout=200))

        if is_otp_screen and not otp_filled:
            log_step("Halaman OTP Canva terdeteksi, polling kode OTP dari Ammail...")
            otp_code, verify_url = wait_for_otp_from_db(email, otp_since_ts, timeout=180)
            if not otp_code and not verify_url:
                raise RuntimeError("Timeout menunggu OTP Canva dari Ammail (re-login)")

            if otp_code:
                log_step("OTP Canva didapat: %s, mengisi...", otp_code)
                digits = re.sub(r"\D", "", otp_code)
                if otp_boxes.count() >= 4:
                    for i in range(min(otp_boxes.count(), len(digits))):
                        otp_boxes.nth(i).press_sequentially(digits[i], delay=100)
                else:
                    otp_single.click()
                    otp_single.press_sequentially(digits, delay=100)
                otp_filled = True
                time.sleep(1.5)
                log_step("OTP diisi, memverifikasi...")
                click_first(page, ["button[type='submit']", "button:has-text('Verify')", "button:has-text('Continue')"])
            elif verify_url:
                log_step("Link verifikasi didapat, membuka...")
                page.goto(verify_url)
                otp_filled = True
            time.sleep(4)
            continue

        # Check for Canva security block error
        try:
            error_selectors = [
                "text=We can't sign you up for security reasons",
                "text=can't sign you up",
                "text=security reasons",
                "text=We can't log you in",
                "text=can't log you in",
            ]
            for err_sel in error_selectors:
                err_loc = page.locator(err_sel).first
                if err_loc.count() > 0 and err_loc.is_visible(timeout=300):
                    raise RuntimeError(f"Canva security block: '{err_sel}'. Coba matikan VPN, ganti IP, atau gunakan browser non-headless.")
        except RuntimeError:
            raise
        except Exception:
            pass

        # No known field detected — try generic Continue/submit as fallback (ONE TIME ONLY)
        if not getattr(_drive_canva_email_login, '_fallback_clicked', False) and poll_count >= 5:
            # Log what's visible on the page for debugging
            try:
                body_text = page.inner_text("body", timeout=2000)[:200]
                log_step("Halaman tidak dikenali. Body: %s", body_text.replace("\n", " ")[:120])
            except Exception:
                pass
            # Try clicking any Continue/submit button
            fallback_clicked = click_first(page, [
                "button[type='submit']",
                "button:has-text('Continue')",
                "button:has-text('Lanjutkan')",
                "button:has-text('Next')",
                "button:has-text('Got it')",
                "button:has-text('OK')",
                "button:has-text('Skip')",
            ], timeout_ms=2000)
            if fallback_clicked:
                log_step("Klik fallback button berhasil, menunggu navigasi...")
                _drive_canva_email_login._fallback_clicked = True  # type: ignore
                time.sleep(3)
                continue

        time.sleep(1)
    return True

def _canva_relogin_in_popup(context, auth_page, email: str, password: str):
    """Handle Canva re-login inside Leonardo OAuth popup.
    
    When Leonardo OAuth opens a Canva popup that shows a login form
    instead of the Allow button, this fills the credentials and OTP.
    After login completes in the popup, it clicks the Allow button.
    """
    log_step("Re-login Canva di popup OAuth Leonardo...")
    _drive_canva_email_login(context, auth_page, email, password)
    time.sleep(3)

    # After re-login, the popup may show the Allow button or redirect
    auth_url = auth_page.url.lower()
    if "canva.com" in auth_url:
        log_step("Mencari tombol Allow di popup setelah re-login...")
        allow_selectors = [
            "button:has-text('Allow')",
            "button:has-text('Authorize')",
            "button:has-text('Izinkan')",
            "button:has-text('Setuju')",
            "button[type='submit']"
        ]
        click_first(auth_page, allow_selectors, timeout_ms=15000)
    log_step("Re-login di popup OAuth selesai.")

def _click_canva_authorize(page, email: str) -> bool:
    """Klik tombol Allow/Authorize di halaman OAuth Canva.
    
    Strategi: coba standard click, force click, coordinate click, 
    pointer events dispatch, React internal fiber handlers,
    keyboard fallback, dan fetch API call fallback.
    """
    primary_selectors = [
        "button:has-text('Allow'):not(:has-text('Cancel'))",
        "button[aria-label='Allow']",
        "button:has-text('Authorize'):not(:has-text('Cancel'))",
        "button:has-text('Continue'):not(:has-text('Cancel'))",
        "button:has-text('Izinkan'):not(:has-text('Batal'))",
        "button:has-text('Lanjutkan'):not(:has-text('Batal'))",
        "[data-testid*='allow']",
        "[data-testid*='authorize']",
    ]

    target_locator = None
    for sel in primary_selectors:
        try:
            loc = page.locator(sel).first
            loc.wait_for(state="visible", timeout=5000)
            target_locator = loc
            log_step(f"Authorize: target tombol ditemukan via {sel}")
            break
        except Exception:
            continue

    if target_locator is None:
        log_step("Authorize: tidak ada tombol target visible.")
        return False

    try:
        target_locator.scroll_into_view_if_needed(timeout=3000)
    except Exception:
        pass
    time.sleep(1.5)

    url_before = page.url

    # Step 1: Standard click
    try:
        target_locator.click(timeout=5000)
        log_step("Authorize: standard click dispatched.")
        time.sleep(2.5)
        if "leonardo.ai" in (urlparse(page.url).hostname or "").lower():
            log_step(f"Authorize: click berhasil, URL berubah ke {page.url[:60]}")
            return True
        log_step("Authorize: standard click tidak trigger navigation, lanjut fallback.")
    except Exception as exc:
        log_step(f"Authorize: standard click error: {str(exc)[:60]}")

    # Step 2: Force click
    try:
        target_locator.click(force=True, timeout=3000)
        log_step("Authorize: force click dispatched.")
        time.sleep(2.5)
        if "leonardo.ai" in (urlparse(page.url).hostname or "").lower():
            log_step(f"Authorize: force click berhasil, URL={page.url[:60]}")
            return True
    except Exception as exc:
        log_step(f"Authorize: force click error: {str(exc)[:60]}")

    # Step 3: Coordinate click via page.mouse
    try:
        box = target_locator.bounding_box(timeout=2000)
        if box:
            x = box["x"] + box["width"] / 2
            y = box["y"] + box["height"] / 2
            page.mouse.move(x, y)
            time.sleep(0.2)
            page.mouse.down()
            time.sleep(0.05)
            page.mouse.up()
            log_step(f"Authorize: coordinate click di ({x:.0f},{y:.0f})")
            time.sleep(2.5)
            if "leonardo.ai" in (urlparse(page.url).hostname or "").lower():
                log_step(f"Authorize: coordinate click berhasil, URL={page.url[:60]}")
                return True
    except Exception as exc:
        log_step(f"Authorize: coordinate click error: {str(exc)[:60]}")

    # Step 4: JS pointer events dispatch
    try:
        js_result = page.evaluate(
            """
            () => {
                const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                const allowBtn = buttons.find(el => {
                    const t = (el.innerText || '').trim();
                    const l = el.getAttribute('aria-label') || '';
                    if (/Cancel|Batal/i.test(t) || /Cancel|Batal/i.test(l)) return false;
                    return /^(Allow|Authorize|Continue|Izinkan|Lanjutkan)$/i.test(t)
                        || /Allow|Authorize|Izinkan|Lanjutkan/i.test(l);
                });
                if (!allowBtn) return { ok: false };
                const r = allowBtn.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                const opts = { bubbles: true, cancelable: true, composed: true,
                               clientX: cx, clientY: cy, button: 0, view: window };
                ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(t => {
                    try {
                        const ev = t.startsWith('pointer')
                            ? new PointerEvent(t, opts)
                            : new MouseEvent(t, opts);
                        allowBtn.dispatchEvent(ev);
                    } catch(e) {}
                });
                try { allowBtn.click(); } catch(e) {}
                return { ok: true, text: (allowBtn.innerText||'').trim().slice(0, 40) };
            }
            """
        )
        if js_result and js_result.get("ok"):
            log_step(f"Authorize: JS event dispatch (text={js_result.get('text')})")
            time.sleep(2.5)
            if "leonardo.ai" in (urlparse(page.url).hostname or "").lower():
                log_step(f"Authorize: JS dispatch berhasil, URL={page.url[:60]}")
                return True
    except Exception as exc:
        log_step(f"Authorize: JS dispatch error: {str(exc)[:60]}")

    # Step 5: React fiber direct handler invocation + form submit fallback
    try:
        js_result = page.evaluate(
            """
            () => {
                const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'));
                const allowBtn = buttons.find(el => {
                    const t = (el.innerText || '').trim();
                    const l = el.getAttribute('aria-label') || '';
                    if (/Cancel|Batal/i.test(t) || /Cancel|Batal/i.test(l)) return false;
                    return /^(Allow|Authorize|Continue|Izinkan|Lanjutkan)$/i.test(t)
                        || /Allow|Authorize|Izinkan|Lanjutkan/i.test(l);
                });
                if (!allowBtn) return { ok: false, reason: 'no-button' };

                const fiberKey = Object.keys(allowBtn).find(k =>
                    k.startsWith('__reactFiber$') ||
                    k.startsWith('__reactInternalInstance$')
                );
                const propsKey = Object.keys(allowBtn).find(k =>
                    k.startsWith('__reactProps$')
                );

                let invoked = [];
                if (propsKey) {
                    const props = allowBtn[propsKey];
                    if (props) {
                        for (const handlerName of ['onClick', 'onPointerDown', 'onMouseDown', 'onSubmit']) {
                            if (typeof props[handlerName] === 'function') {
                                try {
                                    const fakeEvent = {
                                        preventDefault: () => {},
                                        stopPropagation: () => {},
                                        nativeEvent: { type: handlerName.toLowerCase().replace('on', '') },
                                        target: allowBtn,
                                        currentTarget: allowBtn,
                                        type: handlerName.toLowerCase().replace('on', ''),
                                        bubbles: true,
                                        cancelable: true,
                                    };
                                    props[handlerName](fakeEvent);
                                    invoked.push(handlerName);
                                } catch(e) {
                                    invoked.push(handlerName + ':error:' + e.message.slice(0, 50));
                                }
                            }
                        }
                    }
                }

                if (invoked.length === 0 && fiberKey) {
                    let fiber = allowBtn[fiberKey];
                    let depth = 0;
                    while (fiber && depth < 8) {
                        if (fiber.memoizedProps) {
                            for (const handlerName of ['onClick', 'onPointerDown']) {
                                if (typeof fiber.memoizedProps[handlerName] === 'function') {
                                    try {
                                        const fakeEvent = {
                                            preventDefault: () => {},
                                            stopPropagation: () => {},
                                            nativeEvent: { type: 'click' },
                                            target: allowBtn,
                                            currentTarget: allowBtn,
                                            type: 'click',
                                            bubbles: true,
                                        };
                                        fiber.memoizedProps[handlerName](fakeEvent);
                                        invoked.push('fiber:' + handlerName + ':depth=' + depth);
                                    } catch(e) {
                                        invoked.push('fiber:error:' + e.message.slice(0, 50));
                                    }
                                }
                            }
                            if (invoked.length > 0) break;
                        }
                        fiber = fiber.return;
                        depth++;
                    }
                }

                let formSubmitted = false;
                const form = allowBtn.closest('form');
                if (form && invoked.length === 0) {
                    try {
                        if (allowBtn.tagName === 'BUTTON' && !allowBtn.type) {
                            allowBtn.type = 'submit';
                        }
                        form.requestSubmit ? form.requestSubmit(allowBtn) : form.submit();
                        formSubmitted = true;
                    } catch(e) {
                        invoked.push('form:error:' + e.message.slice(0, 50));
                    }
                }

                return {
                    ok: invoked.length > 0 || formSubmitted,
                    invoked: invoked,
                    formSubmitted: formSubmitted,
                    hasFiber: !!fiberKey,
                    hasProps: !!propsKey,
                    text: (allowBtn.innerText||'').trim().slice(0, 40),
                    outerHTML: allowBtn.outerHTML.slice(0, 200)
                };
            }
            """
        )
        if js_result:
            log_step(f"Authorize: React fiber result: {js_result}")
            if js_result.get("ok"):
                time.sleep(3.0)
                if "leonardo.ai" in (urlparse(page.url).hostname or "").lower():
                    log_step(f"Authorize: React fiber/form berhasil, URL={page.url[:60]}")
                    return True
    except Exception as exc:
        log_step(f"Authorize: React fiber error: {str(exc)[:60]}")

    # Step 6: Keyboard focus + Space/Enter fallback
    try:
        target_locator.focus(timeout=2000)
        time.sleep(0.3)
        page.keyboard.press("Space")
        log_step("Authorize: focus + Space pressed.")
        time.sleep(2.5)
        if "leonardo.ai" in (urlparse(page.url).hostname or "").lower():
            log_step(f"Authorize: Space berhasil, URL={page.url[:60]}")
            return True
        page.keyboard.press("Enter")
        log_step("Authorize: Enter pressed.")
        time.sleep(2.5)
        if "leonardo.ai" in (urlparse(page.url).hostname or "").lower():
            log_step(f"Authorize: Enter berhasil, URL={page.url[:60]}")
            return True
    except Exception as exc:
        log_step(f"Authorize: keyboard fallback error: {str(exc)[:60]}")

    # Step 7: API CALL FALLBACK via page.evaluate fetch
    try:
        current_url = page.url
        log_step(f"Authorize Step 7: Coba API call fallback dari URL {current_url[:80]}")
        api_result = page.evaluate(
            """
            async (currentUrl) => {
                try {
                    const u = new URL(currentUrl);
                    const params = u.searchParams;
                    const clientId = params.get('client_id');
                    const redirectUri = params.get('redirect_uri');
                    const state = params.get('state');
                    const codeChallenge = params.get('code_challenge');
                    const codeChallengeMethod = params.get('code_challenge_method');
                    const scope = params.get('scope');
                    if (!clientId || !redirectUri) {
                        return { ok: false, reason: 'missing-params' };
                    }

                    const candidates = [
                        '/api/oauth/authorize/grant',
                        '/api/oauth/authorize/approve',
                        '/_ajax/oauth/authorize',
                        '/api/oauth/grant',
                    ];

                    const body = {
                        client_id: clientId,
                        redirect_uri: redirectUri,
                        state: state,
                        code_challenge: codeChallenge,
                        code_challenge_method: codeChallengeMethod,
                        scope: scope,
                        response_type: 'code',
                        approve: true,
                        allow: true,
                    };

                    for (const endpoint of candidates) {
                        try {
                            const res = await fetch(endpoint, {
                                method: 'POST',
                                credentials: 'include',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Accept': 'application/json',
                                    'X-Requested-With': 'XMLHttpRequest',
                                },
                                body: JSON.stringify(body),
                            });
                            const text = await res.text();
                            if (res.ok) {
                                let data;
                                try { data = JSON.parse(text); } catch { data = text; }
                                return {
                                    ok: true,
                                    endpoint: endpoint,
                                    status: res.status,
                                    data: typeof data === 'string' ? data.slice(0, 300) : data,
                                };
                            }
                        } catch(e) {}
                    }
                    return { ok: false, reason: 'all-endpoints-failed' };
                } catch(e) {
                    return { ok: false, reason: 'eval-error', error: e.message };
                }
            }
            """,
            current_url,
        )
        log_step(f"Authorize Step 7 API result: {api_result}")
        if api_result and api_result.get("ok"):
            data = api_result.get("data") or {}
            redirect_url = None
            if isinstance(data, dict):
                redirect_url = data.get("redirect_url") or data.get("redirectUrl") or data.get("location")
            if redirect_url:
                log_step(f"Authorize Step 7: Navigate ke {redirect_url[:80]}")
                page.goto(redirect_url, wait_until="domcontentloaded", timeout=30000)
                time.sleep(2.5)
                if "leonardo" in (page.url or "").lower():
                    log_step(f"Authorize Step 7: API + redirect berhasil, URL={page.url[:60]}")
                    return True
    except Exception as exc:
        log_step(f"Authorize Step 7 API error: {str(exc)[:60]}")

    return False

def get_leonardo_balance(jwt: str) -> int:
    try:
        import requests
        gql_url = "https://api.leonardo.ai/v1/graphql"
        gql_headers = {
            "accept": "*/*",
            "content-type": "application/json",
            "origin": "https://app.leonardo.ai",
            "referer": "https://app.leonardo.ai/",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "authorization": f"Bearer {jwt}"
        }
        query = {
            "operationName": "GetTokenBalance",
            "variables": {},
            "query": "query GetTokenBalance { user_details { subscriptionTokens paidTokens rolloverTokens __typename } }"
        }
        res = requests.post(gql_url, headers=gql_headers, json=query, timeout=10)
        if res.ok:
            gql_data = res.json()
            user_details = gql_data.get("data", {}).get("user_details", [])
            if user_details:
                details = user_details[0]
                return (details.get("subscriptionTokens") or 0) + (details.get("paidTokens") or 0) + (details.get("rolloverTokens") or 0)
    except Exception as e:
        logger.warning(f"Error fetching Leonardo balance: {e}")
    return 150

def leave_canva_team(page):
    log_step("Mencoba keluar dari Canva team...")
    try:
        # Try multiple Canva settings URLs in order of likelihood
        # "Team profile" page is where the "Leave team" button lives
        settings_urls = [
            "https://www.canva.com/settings/team-profile",
            "https://www.canva.com/settings/team-details",
            "https://www.canva.com/settings/your-account",
            "https://www.canva.com/settings",
        ]

        leave_btn_selectors = [
            "button:has-text('Leave team')",
            "button:has-text('Leave Team')",
            "button:has-text('Keluar dari tim')",
            "button:has-text('Keluar Dari Tim')",
            "button:has-text('leave team')",
            # Broader: any clickable element with "Leave" + "team" text
            "[role='button']:has-text('Leave team')",
            "[role='button']:has-text('Keluar dari tim')",
            # Link-style leave
            "a:has-text('Leave team')",
            "a:has-text('Keluar dari tim')",
        ]

        btn_clicked = False

        for url in settings_urls:
            if btn_clicked:
                break
            log_step(f"Navigasi ke {url}...")
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=25000)
            except Exception as nav_err:
                log_step(f"Gagal navigasi ke {url}: {nav_err}")
                continue
            time.sleep(4)

            # On the account/settings page, check sidebar for team links first
            if "your-account" in url or url.endswith("/settings"):
                sidebar_selectors = [
                    "a[href*='team-profile']",
                    "a[href*='team-details']",
                    "a:has-text('Team profile')",
                    "a:has-text('Team details')",
                    "a:has-text('Profil tim')",
                    "a:has-text('Detail tim')",
                ]
                for sel in sidebar_selectors:
                    try:
                        if page.locator(sel).count() > 0:
                            log_step(f"Membuka link team via sidebar: {sel}")
                            page.locator(sel).first.click()
                            time.sleep(4)
                            break
                    except Exception:
                        continue

            # Scroll down to find leave button (it's often below the fold)
            try:
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                time.sleep(1)
            except Exception:
                pass

            # Try each leave button selector
            for btn_sel in leave_btn_selectors:
                try:
                    locator = page.locator(btn_sel)
                    if locator.count() > 0:
                        locator.first.scroll_into_view_if_needed()
                        time.sleep(0.5)
                        locator.first.click()
                        log_step(f"Tombol 'Leave team' diklik: {btn_sel} (di {url})")
                        btn_clicked = True
                        break
                except Exception:
                    continue

        if not btn_clicked:
            # Save diagnostic screenshot and HTML dump
            log_step("Tombol 'Leave team' tidak ditemukan. Menyimpan diagnostik...")
            try:
                debug_dir = Path("profiles") / "canva_debug"
                debug_dir.mkdir(parents=True, exist_ok=True)
                ts = int(time.time())
                page.screenshot(path=str(debug_dir / f"leave_team_not_found_{ts}.png"), full_page=True, timeout=10000)
                (debug_dir / f"leave_team_not_found_{ts}.html").write_text(page.content() or "", encoding="utf-8")
                log_step(f"Diagnostik disimpan di profiles/canva_debug/leave_team_not_found_{ts}.*")
            except Exception as diag_err:
                log_step(f"Gagal menyimpan diagnostik: {diag_err}")
            log_step("Tombol 'Leave team' tidak ditemukan pada semua halaman settings. Mungkin user bukan member tim atau UI berubah.")
            return False

        time.sleep(2)

        # Wait for confirmation dialog and confirm button
        confirm_btn_selectors = [
            "div[role='dialog'] button:has-text('Leave team')",
            "div[role='dialog'] button:has-text('Leave Team')",
            "div[role='dialog'] button:has-text('Keluar dari tim')",
            "div[role='dialog'] button:has-text('Leave')",
            "[role='dialog'] button:has-text('Leave team')",
            "[role='dialog'] button:has-text('Leave')",
            # Fallback: any second "Leave team" button that appeared after clicking
            "button:has-text('Leave team')",
            "button:has-text('Leave Team')",
            "button:has-text('Keluar dari tim')",
        ]

        confirm_clicked = False
        # Wait a bit for the dialog to animate in
        time.sleep(1)
        for conf_sel in confirm_btn_selectors:
            try:
                locator = page.locator(conf_sel)
                if locator.count() > 0:
                    locator.last.click()  # Use .last to get the confirmation button (not the trigger)
                    log_step(f"Konfirmasi 'Leave team' diklik: {conf_sel}")
                    confirm_clicked = True
                    break
            except Exception:
                continue

        if confirm_clicked:
            time.sleep(3)
            # Verify we actually left — check if redirected to personal account or team-less settings
            cur_url = page.url.lower()
            if "team-details" not in cur_url:
                log_step("Berhasil keluar dari Canva team! (URL berubah dari team-details)")
            else:
                log_step("Berhasil keluar dari Canva team!")
            return True
        else:
            log_step("Gagal menemukan tombol konfirmasi 'Leave team'. Dialog mungkin tidak muncul.")
            return False

    except Exception as e:
        log_step(f"Gagal saat mencoba keluar dari Canva team: {e}")
        return False

def login_leonardo(context, page, email: str, password: str = "") -> tuple:
    # Clear Leonardo cookies
    log_step("Membersihkan cookie lama Leonardo...")
    try:
        cookies = context.cookies()
        clean_cookies = [c for c in cookies if "leonardo.ai" not in (c.get("domain") or "").lower()]
        context.clear_cookies()
        context.add_cookies(clean_cookies)
    except Exception:
        pass

    # Open Leonardo login with robust retry to handle transient proxy/DNS resolution issues
    for attempt in range(1, 4):
        try:
            log_step(f"Membuka halaman login Leonardo AI (percobaan {attempt}/3)...")
            page.goto(LEONARDO_LOGIN_URL, wait_until="domcontentloaded", timeout=30000)
            break
        except Exception as e:
            if attempt == 3:
                raise e
            time.sleep(2.5)
    time.sleep(3)

    # Click Canva login button
    canva_btn_selectors = [
        "button:has-text('Canva')",
        "div[role='button']:has-text('Canva')",
        "a:has-text('Canva')"
    ]
    log_step("Mengklik tombol login Canva di Leonardo...")
    
    # Canva OAuth might open a popup
    popup_holder = {}
    def _on_popup(p):
        popup_holder["page"] = p
        try:
            log_step(f"Popup Canva OAuth terdeteksi (via page popup event): {p.url[:80]}")
        except Exception:
            pass
            
    def _on_new_page(p):
        if p == page:
            return
        popup_holder.setdefault("page", p)
        try:
            log_step(f"Popup Canva OAuth terdeteksi (via context page event): {p.url[:80]}")
        except Exception:
            pass

    try:
        page.on("popup", _on_popup)
    except Exception:
        pass
    try:
        context.on("page", _on_new_page)
    except Exception:
        pass

    auth_page = page
    canva_clicked = False
    try:
        # Use robust context.expect_page to capture the new tab/popup
        with context.expect_page(timeout=30000) as page_info:
            if not click_first(page, canva_btn_selectors, timeout_ms=15000):
                raise RuntimeError("Tombol Canva di Leonardo tidak ditemukan")
        auth_page = page_info.value
        canva_clicked = True
        log_step(f"Popup Canva OAuth terdeteksi via expect_page: {auth_page.url[:80]}")
    except Exception as e:
        log_step(f"Gagal menunggu popup via expect_page: {str(e)[:60]}")
        # Fallback to polling popup_holder or checking main page redirects
        deadline = time.time() + 30.0
        while time.time() < deadline:
            p_cand = popup_holder.get("page")
            if p_cand is not None:
                try:
                    p_url = p_cand.url or ""
                    p_host = (urlparse(p_url).hostname or "").lower()
                    if any(domain in p_host for domain in ["canva.com", "google.com"]):
                        auth_page = p_cand
                        canva_clicked = True
                        break
                except Exception:
                    pass
            # Also check if main page redirected to canva.com or google.com
            try:
                m_host = (urlparse(page.url).hostname or "").lower()
                if any(domain in m_host for domain in ["canva.com", "google.com"]):
                    auth_page = page
                    canva_clicked = True
                    break
            except Exception:
                pass
            page.wait_for_timeout(300)

    if not canva_clicked:
        # Fallback to whatever page we got in popup_holder, or default to main page
        auth_page = popup_holder.get("page", page)

    log_step(f"Navigated to auth page. URL: {auth_page.url[:80]}")

    # Wait for DOM content loaded on auth page
    try:
        auth_page.wait_for_load_state("domcontentloaded", timeout=10000)
    except Exception:
        pass

    # Wait for the url to stabilize to authorize page if it's on login/signup transiently
    log_step("Menunggu halaman otorisasi Canva dimuat...")
    deadline_auth = time.time() + 30.0
    google_login_done = False
    google_button_clicked = False
    popup_holder.clear()
    
    while time.time() < deadline_auth:
        cur_url = auth_page.url.lower()
        if "/api/oauth/authorize" in cur_url or "leonardo.ai" in cur_url:
            break
            
        # If we are on Canva login page, check if Google login popup opened
        if "/login" in cur_url and not google_login_done:
            # Check for Google One Tap iframe
            try:
                one_tap_iframe = auth_page.frame_locator("iframe[title='Sign in with Google Dialogue']")
                continue_btn = one_tap_iframe.locator("div[role='button']:has-text('Continue')").first
                if continue_btn.is_visible(timeout=1000):
                    log_step("Google One Tap terdeteksi, mengklik 'Continue'...")
                    continue_btn.click()
                    google_login_done = True
                    time.sleep(3)
                    continue
            except Exception as e:
                log_step(f"Google One Tap check error: {str(e)[:60]}")

            # Click Google button to trigger Google login popup
            if not google_button_clicked and not google_login_done:
                log_step("Mengklik tombol Google login di halaman Canva login...")
                google_btn_selectors = [
                    "button[aria-label*='Google' i]",
                    "button:has-text('Google')",
                    "button:has-text('Lanjutkan dengan Google')",
                    "button:has-text('Masuk dengan Google')",
                ]
                if click_first(auth_page, google_btn_selectors, timeout_ms=5000):
                    google_button_clicked = True
                    log_step("Tombol Google login diklik. Menunggu popup...")
                else:
                    log_step("Gagal menemukan/mengklik tombol Google login di Canva.")

            p_cand = popup_holder.get("page")
            if p_cand is not None and p_cand != auth_page:
                p_url = p_cand.url or ""
                if "google.com" in p_url.lower():
                    log_step("Canva meminta login ulang. Menjalankan Google Sign-in untuk Canva...")
                    do_google_login(p_cand, email, password)
                    google_login_done = True
                    popup_holder.clear()
                    
        # If the auth_page itself is directly on Google Sign-in
        elif "google.com" in cur_url and not google_login_done:
            log_step("Halaman otorisasi terdeteksi langsung sebagai Google Sign-in. Menjalankan Google Sign-in...")
            do_google_login(auth_page, email, password)
            google_login_done = True
                    
        auth_page.wait_for_timeout(500)

    # Re-check the URL
    auth_url = auth_page.url.lower()
    if "canva.com" in auth_url:
        try:
            auth_page.wait_for_load_state("networkidle", timeout=5000)
        except Exception:
            pass
            
        # Listen for nested Google login popup from Canva auth page
        google_popup_holder = {}
        def _on_google_popup(p):
            google_popup_holder["page"] = p
            log_step(f"Google login popup dari Canva OAuth terdeteksi: {p.url[:80]}")
        
        try:
            auth_page.on("popup", _on_google_popup)
        except Exception:
            pass

        log_step("Menyetujui otorisasi Canva untuk Leonardo via 9-step clicker...")
        # Use our robust 9-step clicker
        _click_canva_authorize(auth_page, email)

        # Wait and handle Google login popup if it opened
        log_step("Menunggu nested Google login popup dari Canva...")
        google_popup = None
        deadline_pop = time.time() + 15.0
        while time.time() < deadline_pop:
            if "google.com" in auth_page.url.lower():
                google_popup = auth_page
                break
            google_popup = google_popup_holder.get("page")
            if google_popup is not None:
                break
            time.sleep(0.5)

        if google_popup is not None:
            log_step("Menjalankan Google Sign-in untuk otorisasi Canva...")
            do_google_login(google_popup, email, password)
        else:
            log_step("Tidak ada Google login popup terdeteksi setelah Canva authorize click.")

    page.wait_for_timeout(4000)
    
    # Wait until redirect back to leonardo.ai
    log_step("Menunggu redirect kembali ke Leonardo...")
    try:
        page.wait_for_url("**/leonardo.ai/**", timeout=30000)
    except Exception:
        pass
    
    # Wait network idle to let Javascript callback complete
    try:
        page.wait_for_load_state("networkidle", timeout=8000)
    except Exception:
        pass
    time.sleep(3)

    # Extract cookies (polling)
    log_step("Mengekstrak cookies...")
    leo_cookies = wait_for_leo_session(context, timeout_ms=25000)
    
    cookie_str = normalize_cookies(leo_cookies)
    if not has_leonardo_session(leo_cookies):
        all_cookies = context.cookies()
        cookie_debug_list = [f"{c.get('name')}@{c.get('domain')}" for c in all_cookies]
        log_step(f"Debug Cookies: {', '.join(cookie_debug_list)}")
        raise RuntimeError("Session cookie Leonardo/better-auth tidak ditemukan")

    # Extract JWT
    jwt_token = ""
    try:
        jwt_token = page.evaluate(
            """
            async () => {
              const endpoints = ['/api/auth/get-session', '/api/auth/session'];
              const visit = (obj, depth = 0) => {
                if (!obj || depth > 5) return null;
                if (typeof obj === 'string') {
                  const parts = obj.split('.');
                  if (parts.length === 3 && parts[0].length > 10) {
                    try {
                      const decoded = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - parts[1].length % 4) % 4)));
                      if (decoded && (decoded.iss || decoded.aud || decoded.token_use)) return obj;
                    } catch (e) {}
                  }
                  return null;
                }
                if (Array.isArray(obj)) {
                  for (const v of obj) { const r = visit(v, depth+1); if (r) return r; }
                  return null;
                }
                if (typeof obj === 'object') {
                  for (const k of Object.keys(obj)) {
                    const r = visit(obj[k], depth+1);
                    if (r) return r;
                  }
                }
                return null;
              };
              for (const ep of endpoints) {
                try {
                  const res = await fetch(ep, { credentials: 'include' });
                  if (!res.ok) continue;
                  const data = await res.json();
                  const candidates = [
                    data?.accessToken, data?.access_token,
                    data?.idToken, data?.id_token,
                    data?.token,
                    data?.session?.accessToken, data?.session?.token,
                  ];
                  const direct = candidates.find(t => typeof t === 'string' && t.split('.').length === 3);
                  if (direct) return direct;
                  const found = visit(data);
                  if (found) return found;
                } catch (e) {}
              }
              return '';
            }
            """
        ) or ""
    except Exception:
        pass

    return cookie_str, jwt_token

def cleanup_old_debug_files(profiles_dir: str, email: str):
    try:
        debug_dir = Path(profiles_dir).parent / "canva_debug" / safe_email_to_dirname(email)
        if debug_dir.exists():
            for item in debug_dir.iterdir():
                if item.is_file() and item.suffix in (".png", ".html"):
                    try:
                        item.unlink()
                    except Exception:
                        pass
    except Exception:
        pass

def save_debug_screenshots(context, profiles_dir: str, email: str, prefix="failure"):
    try:
        debug_dir = Path(profiles_dir).parent / "canva_debug" / safe_email_to_dirname(email)
        debug_dir.mkdir(parents=True, exist_ok=True)
        pages = getattr(context, "pages", []) or []
        for i, pg in enumerate(pages):
            try:
                url = pg.url or "empty"
                ts = int(time.time())
                sanitized_url = re.sub(r"[^a-zA-Z0-9.-]", "_", url)[:50]
                screenshot_path = debug_dir / f"{prefix}_page_{i}_{sanitized_url}_{ts}.png"
                html_path = debug_dir / f"{prefix}_page_{i}_{sanitized_url}_{ts}.html"
                
                log_step(f"Mengambil screenshot halaman {i} (URL: {url[:60]})...")
                pg.screenshot(path=str(screenshot_path), full_page=True, timeout=10000)
                try:
                    html_path.write_text(pg.content() or "", encoding="utf-8")
                except Exception:
                    pass
                log_step(f"Screenshot disimpan di: {screenshot_path}")
            except Exception as e:
                logger.warning(f"Failed to screenshot page {i}: {e}")
    except Exception as e:
        logger.warning(f"Error in debug screenshot function: {e}")

def main():
    parser = argparse.ArgumentParser(description="Leonardo AI Canva-redirect auto login")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--invite-link", required=True)
    parser.add_argument("--signup-method", default="google") # google | email
    parser.add_argument("--profiles-dir", required=True)
    parser.add_argument("--headless", action="store_true", default=False)
    parser.add_argument("--canva-headless", action="store_true", default=False,
                        help="Run Canva step headless (default: non-headless to avoid bot detection)")
    parser.add_argument("--canva-delay", type=int, default=0,
                        help="Extra random delay (seconds) before opening Canva to avoid rate-limiting")
    parser.add_argument("--skip-canva", action="store_true", default=False)
    parser.add_argument("--leave-canva-team", action="store_true", default=False)
    parser.add_argument("--proxy-server")
    parser.add_argument("--proxy-user")
    parser.add_argument("--proxy-pass")
    args = parser.parse_args()
    cleanup_old_debug_files(args.profiles_dir, args.email)
    profiles_root = Path(args.profiles_dir)
    profiles_root.mkdir(parents=True, exist_ok=True)
    profile_dir = profiles_root / safe_email_to_dirname(args.email)

    if not args.skip_canva:
        import shutil
        if profile_dir.exists():
            log_step("Reset/menghapus profile directory Canva untuk pendaftaran baru...")
            try:
                shutil.rmtree(profile_dir)
            except Exception as e:
                log_step("Gagal menghapus profile directory: " + str(e))

        # Apply pre-Canva random delay to reduce rate-limit detection
        if args.canva_delay and args.canva_delay > 0:
            import random
            delay = random.uniform(args.canva_delay * 0.5, args.canva_delay)
            log_step(f"⏳ Pre-Canva cooldown: menunggu {delay:.1f}s untuk menghindari rate-limit...")
            time.sleep(delay)

    try:
        from camoufox.sync_api import Camoufox
        from camoufox.addons import DefaultAddons
    except ImportError:
        sys.stdout.write(json.dumps({"status": "error", "message": "Camoufox package not installed in python environment."}) + "\n")
        sys.exit(1)

    proxy_dict = None
    if args.proxy_server:
        proxy_dict = {"server": args.proxy_server}
        if args.proxy_user:
            proxy_dict["username"] = args.proxy_user
        if args.proxy_pass:
            proxy_dict["password"] = args.proxy_pass

    # Always use the global --headless flag.
    # Non-headless was tried but too RAM-heavy for VPS (only 2GB).
    # Anti-detection is handled via Camoufox fingerprinting + firefox_user_prefs.
    if not args.skip_canva:
        log_step("🥷 Canva step: headless mode + anti-detection prefs aktif...")

    kwargs = dict(
        headless=args.headless,
        persistent_context=True,
        user_data_dir=str(profile_dir),
        humanize=True,
        geoip=True,
        locale="en-US",
        os=("windows", "macos", "linux"),
        exclude_addons=[DefaultAddons.UBO],
        firefox_user_prefs={
            "network.trr.mode": 5,
            # Anti-headless-detection prefs
            "dom.webdriver.enabled": False,
            "useAutomationExtension": False,
            "media.navigator.enabled": True,
            "media.peerconnection.enabled": True,
        }
    )
    if proxy_dict:
        kwargs["proxy"] = {k: v for k, v in proxy_dict.items() if v}
        server = proxy_dict.get("server", "")
        auth = " (auth)" if proxy_dict.get("username") else ""
        log_step(f"🌐 Menggunakan proxy: {server}{auth}")

    log_step("Meluncurkan browser...")
    ctx_manager = None
    try:
        try:
            ctx_manager = Camoufox(**kwargs)
        except TypeError:
            for drop in ("os", "geoip", "humanize", "locale"):
                kwargs.pop(drop, None)
                try:
                    ctx_manager = Camoufox(**kwargs)
                    break
                except TypeError:
                    continue
            if not ctx_manager:
                ctx_manager = Camoufox(**kwargs)

        with ctx_manager as browser:
            context = getattr(browser, "context", None) or browser
            try:
                page = context.new_page()

                # Start debug screenshot thread (only when visible browser)
                if not args.headless:
                    start_debug_screenshots(page)

                # Step 1: Canva enrollment
                if not args.skip_canva:
                    if args.signup_method == "email":
                        enroll_canva_via_email(page, args.invite_link, args.email, args.password)
                    else:
                        enroll_canva_via_google(page, args.invite_link, args.email, args.password)
                    log_step("Pendaftaran Canva sukses")
                    sys.stdout.write(json.dumps({"canva_enrolled": True, "email": args.email}) + "\n")
                    sys.stdout.flush()
                else:
                    log_step("Canva sudah enrolled, memverifikasi session...")
                    sys.stdout.write(json.dumps({"canva_enrolled": True, "email": args.email, "status": "already_enrolled"}) + "\n")
                    sys.stdout.flush()
                    relogin_canva(context, page, args.email, args.password, signup_method=args.signup_method)

                # Step 2: Leonardo Auth login
                cookie, jwt = login_leonardo(context, page, args.email, args.password)

                log_step("Login Leonardo sukses, mengekstrak data...")
                balance = get_leonardo_balance(jwt)

                left_team = False
                if args.leave_canva_team:
                    left_team = leave_canva_team(page)
                    log_step("Melakukan login ulang ke Leonardo setelah mencoba keluar dari Canva team...")
                    cookie, jwt = login_leonardo(context, page, args.email, args.password)
                    log_step("Login ulang Leonardo sukses, mengekstrak data baru...")
                    balance = get_leonardo_balance(jwt)

                result = {
                    "status": "success",
                    "cookie": cookie,
                    "jwt": jwt,
                    "balance": balance
                }
                if args.leave_canva_team:
                    result["left_team"] = left_team
                sys.stdout.write(json.dumps(result) + "\n")
                sys.exit(0)
            except Exception as exc:
                save_debug_screenshots(context, args.profiles_dir, args.email, "fail")
                raise exc

    except Exception as e:
        sys.stdout.write(json.dumps({"status": "error", "message": str(e)}) + "\n")
        sys.exit(1)
    finally:
        stop_debug_screenshots()

if __name__ == "__main__":
    main()
