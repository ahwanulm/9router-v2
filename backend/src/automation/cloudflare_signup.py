#!/usr/bin/env python3
"""Cloudflare account auto-signup via Camoufox (anti-fingerprint) + Ammail email verification.

Outputs JSON lines to stdout:
  {"step": "..."} — progress update
  {"status": "success", "api_key": "...", "account_id": "...", "email": "..."} — final result
  {"status": "error", "error": "..."} — failure
"""

import sys
import json
import argparse
import time
import random
import string
import re
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

# ── Stdout JSON helpers ────────────────────────────────────────────────────────
def emit(obj):
    print(json.dumps(obj), flush=True)

def log_step(msg):
    emit({"step": msg})

def success(api_key, account_id, email):
    emit({"status": "success", "api_key": api_key, "account_id": account_id, "email": email})

def die(msg):
    emit({"status": "error", "error": msg})
    sys.exit(1)

# ── Ammail helpers ─────────────────────────────────────────────────────────────
def ammail_request(base_url, api_key, path, method="GET", data=None):
    url = base_url.rstrip("/") + path
    req = urllib.request.Request(url, method=method)
    req.add_header("X-API-Key", api_key)
    req.add_header("Content-Type", "application/json")
    if data:
        req.data = json.dumps(data).encode()
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())

def create_ammail_inbox(base_url, api_key, email):
    try:
        ammail_request(base_url, api_key, "/inboxes", method="POST", data={"email": email})
    except Exception:
        pass  # might already exist

def wait_for_cf_verify_email(base_url, api_key, email, timeout=120):
    log_step(f"Menunggu email verifikasi Cloudflare ({email})...")
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            data = ammail_request(base_url, api_key, f"/inboxes/{urllib.parse.quote(email)}/messages")
            messages = data.get("messages", [])
            for msg in messages:
                subject = msg.get("subject", "")
                body = msg.get("body", msg.get("html", msg.get("text", "")))
                if "cloudflare" in subject.lower() or "verify" in subject.lower() or "confirm" in subject.lower():
                    # Extract verification link
                    patterns = [
                        r'https://[^\s\'"<>]*confirm[^\s\'"<>]*',
                        r'https://[^\s\'"<>]*verify[^\s\'"<>]*',
                        r'https://dash\.cloudflare\.com/[^\s\'"<>]+',
                    ]
                    for pat in patterns:
                        links = re.findall(pat, body)
                        if links:
                            link = links[0].rstrip(".")
                            log_step(f"Link verifikasi ditemukan!")
                            return link
        except Exception as e:
            pass
        time.sleep(5)
    return None

# ── Turnstile bypass (ported from weavy_signup.py) ─────────────────────────────
def is_on_turnstile_page(page) -> bool:
    try:
        title = page.title() or ""
        if "just a moment" in title.lower() or "security verification" in title.lower():
            return True
    except Exception:
        pass
    try:
        token = page.evaluate("() => { const el = document.getElementsByName('cf-turnstile-response')[0] || document.getElementById('cf-turnstile-response'); return el ? el.value : null; }")
        if token is not None:
            return len(token.strip()) == 0
    except Exception:
        pass
    for sel in ["text=Just a moment", "text=Verifying you are human", "#challenge-form", "#cf-challenge-running"]:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=300):
                return True
        except Exception:
            continue
    try:
        for f in page.frames:
            url = f.url or ""
            if ("challenges.cloudflare.com" in url or "turnstile" in url) and "challenge-platform" in url:
                token = page.evaluate("() => { const el = document.getElementsByName('cf-turnstile-response')[0]; return el ? el.value : ''; }")
                if token and len(token.strip()) > 0:
                    return False
                return True
    except Exception:
        pass
    return False

def try_click_turnstile_checkbox(page) -> bool:
    target_frame = None
    try:
        for f in page.frames:
            url = f.url or ""
            if "challenges.cloudflare.com" in url or "turnstile" in url:
                target_frame = f
                break
    except Exception:
        pass

    if target_frame:
        try:
            frame_element = page.locator("iframe[src*='challenges.cloudflare.com'], iframe[src*='turnstile']").first
            if frame_element.count() > 0 and not frame_element.is_visible(timeout=500):
                return False
        except Exception:
            pass
        for cb_sel in ["input[type='checkbox']", "[role='checkbox']", "div.ctp-checkbox-label"]:
            try:
                box = target_frame.locator(cb_sel).first
                if box.count() > 0:
                    box.click(timeout=3000)
                    return True
            except Exception:
                continue
        try:
            handle = target_frame.frame_element()
            bbox = handle.bounding_box() if handle else None
            if bbox:
                x = bbox["x"] + 28
                y = bbox["y"] + 32
                page.mouse.move(x, y, steps=10)
                time.sleep(0.3)
                page.mouse.click(x, y)
                return True
        except Exception:
            pass
    for iframe_sel in ["iframe[src*='challenges.cloudflare.com']", "iframe[src*='turnstile']"]:
        for cb_sel in ["input[type='checkbox']", "[role='checkbox']"]:
            try:
                box = page.frame_locator(iframe_sel).locator(cb_sel).first
                if box.count() > 0:
                    box.click(timeout=3000)
                    return True
            except Exception:
                continue
    return False

def wait_for_cf_clearance(page, timeout=45.0):
    if not is_on_turnstile_page(page):
        return True
    log_step("Cloudflare Turnstile terdeteksi, menunggu resolve...")
    deadline = time.time() + timeout
    click_attempts = 0
    next_click_at = time.time() + 4.0
    while time.time() < deadline:
        time.sleep(2.0)
        if not is_on_turnstile_page(page):
            log_step("Turnstile selesai!")
            try:
                page.wait_for_load_state("networkidle", timeout=5000)
            except Exception:
                pass
            return True
        now = time.time()
        if click_attempts < 5 and now >= next_click_at:
            click_attempts += 1
            log_step(f"Klik Turnstile checkbox (attempt {click_attempts}/5)...")
            try_click_turnstile_checkbox(page)
            next_click_at = now + 8.0
            time.sleep(2.0)
    return False

# ── Cloudflare API ─────────────────────────────────────────────────────────────
CF_API = "https://api.cloudflare.com/client/v4"

def cf_api_call(path, global_key, email, method="GET", body=None):
    url = CF_API + path
    req = urllib.request.Request(url, method=method)
    req.add_header("X-Auth-Key", global_key)
    req.add_header("X-Auth-Email", email)
    req.add_header("Content-Type", "application/json")
    if body:
        req.data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise Exception(f"CF API {path} {e.code}: {e.read().decode()}")

def get_account_id_via_api(global_key, email):
    try:
        r = cf_api_call("/accounts?per_page=1", global_key, email)
        if r.get("success") and r.get("result"):
            return r["result"][0]["id"], r["result"][0]["name"]
    except Exception as e:
        log_step(f"get_account_id error: {e}")
    return None, None

def create_workers_ai_token(global_key, email, account_id, token_name="9router Workers AI"):
    """Create Workers AI Read+Edit token via CF API using Global API Key."""
    try:
        # Get permission groups
        r = cf_api_call(f"/accounts/{account_id}/tokens/permission_groups", global_key, email)
        groups = r.get("result", [])
        read_g = next((g for g in groups if "workers ai" in g["name"].lower() and "read" in g["name"].lower()), None)
        edit_g = next((g for g in groups if "workers ai" in g["name"].lower() and "edit" in g["name"].lower()), None)
        if not read_g or not edit_g:
            # fallback: first two that match workers ai
            wa = [g for g in groups if "workers ai" in g["name"].lower()]
            if len(wa) >= 2:
                read_g, edit_g = wa[0], wa[1]
            elif len(wa) == 1:
                read_g = edit_g = wa[0]
            else:
                return None
        payload = {
            "name": token_name,
            "policies": [{
                "effect": "allow",
                "permission_groups": [{"id": read_g["id"]}, {"id": edit_g["id"]}],
                "resources": {f"com.cloudflare.api.account.{account_id}": "*"},
            }],
        }
        r2 = cf_api_call("/user/tokens", global_key, email, method="POST", body=payload)
        if r2.get("success") and r2.get("result", {}).get("value"):
            return r2["result"]["value"]
    except Exception as e:
        log_step(f"create_workers_ai_token error: {e}")
    return None

# ── Extract Global API Key from dashboard page ─────────────────────────────────
def extract_global_api_key(page, password):
    """Navigate to API tokens page and extract Global API Key."""
    log_step("Membuka halaman API Tokens...")
    try:
        page.goto("https://dash.cloudflare.com/profile/api-tokens", wait_until="domcontentloaded", timeout=30000)
        wait_for_cf_clearance(page, timeout=20)
        time.sleep(2)

        # Find "View" button for Global API Key
        view_selectors = [
            "button:has-text('View')",
            "button:has-text('Reveal')",
            "span:has-text('View'):visible",
        ]
        for sel in view_selectors:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=2000):
                    btn.click()
                    time.sleep(1)
                    break
            except Exception:
                continue

        # Password confirmation modal
        pw_input = page.locator("input[type='password']").first
        if pw_input.is_visible(timeout=3000):
            log_step("Mengisi password konfirmasi...")
            pw_input.fill(password)
            time.sleep(0.5)
            # Click confirm button
            for sel in ["button:has-text('View')", "button[type='submit']", "button:has-text('Confirm')"]:
                try:
                    btn = page.locator(sel).last
                    if btn.is_visible(timeout=1000):
                        btn.click()
                        break
                except Exception:
                    continue
            time.sleep(2)

        # Extract the key value
        for sel in [
            "input[data-testid='global-api-key']",
            "input[readonly][type='text']",
            "code",
            ".cf-input-code",
        ]:
            try:
                el = page.locator(sel).first
                if el.is_visible(timeout=2000):
                    val = el.input_value() if sel.startswith("input") else el.text_content()
                    if val and len(val) > 20:
                        return val.strip()
            except Exception:
                continue
    except Exception as e:
        log_step(f"extract_global_api_key error: {e}")
    return None

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--ammail-base-url", default="")
    parser.add_argument("--ammail-api-key", default="")
    parser.add_argument("--ammail-domain", default="")
    parser.add_argument("--profiles-dir", default="profiles/cloudflare")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--proxy-server")
    parser.add_argument("--proxy-user")
    parser.add_argument("--proxy-pass")
    args = parser.parse_args()

    # Import Camoufox (same as weavy_signup.py)
    try:
        from camoufox.sync_api import Camoufox
    except ImportError:
        die("Camoufox tidak terinstall. Jalankan: pip install camoufox && python -m camoufox fetch")

    profiles_dir = Path(args.profiles_dir)
    profiles_dir.mkdir(parents=True, exist_ok=True)

    # Pre-create Ammail inbox if we have credentials
    ammail_ok = bool(args.ammail_base_url and args.ammail_api_key and args.ammail_domain)
    if ammail_ok:
        log_step(f"Membuat inbox Ammail untuk {args.email}...")
        try:
            create_ammail_inbox(args.ammail_base_url, args.ammail_api_key, args.email)
        except Exception as e:
            log_step(f"Ammail inbox warning: {e}")

    log_step("Meluncurkan browser Camoufox (anti-fingerprint)...")

    proxy_dict = None
    if args.proxy_server:
        proxy_dict = {"server": args.proxy_server}
        if args.proxy_user:
            proxy_dict["username"] = args.proxy_user
        if args.proxy_pass:
            proxy_dict["password"] = args.proxy_pass

    launch_kwargs = dict(
        headless=args.headless,
        os="windows",
        locale="en-US",
    )
    if proxy_dict:
        launch_kwargs["proxy"] = proxy_dict

    try:
        browser_ctx = Camoufox(**launch_kwargs)
    except TypeError:
        launch_kwargs.pop("os", None)
        try:
            browser_ctx = Camoufox(**launch_kwargs)
        except TypeError:
            launch_kwargs.pop("locale", None)
            browser_ctx = Camoufox(**launch_kwargs)

    with browser_ctx as browser:
        page = browser.new_page()

        # ── Step 1: Open Cloudflare signup ────────────────────────────────────
        log_step("Membuka halaman registrasi Cloudflare...")
        try:
            page.goto("https://dash.cloudflare.com/sign-up", wait_until="domcontentloaded", timeout=30000)
        except Exception:
            page.goto("https://dash.cloudflare.com/sign-up", wait_until="load", timeout=30000)

        wait_for_cf_clearance(page, timeout=30)
        time.sleep(random.uniform(1.5, 2.5))

        # ── Step 2: Fill email ────────────────────────────────────────────────
        log_step("Mengisi email...")
        email_sel = [
            "input[name='email']",
            "input[type='email']",
            "#email",
            "input[placeholder*='email' i]",
        ]
        email_filled = False
        for sel in email_sel:
            try:
                el = page.locator(sel).first
                if el.is_visible(timeout=3000):
                    el.click()
                    time.sleep(0.3)
                    el.fill(args.email)
                    email_filled = True
                    break
            except Exception:
                continue
        if not email_filled:
            die("Tidak bisa menemukan input email di halaman signup Cloudflare")

        # ── Step 3: Fill password ─────────────────────────────────────────────
        log_step("Mengisi password...")
        pw_inputs = page.locator("input[type='password']")
        pw_count = pw_inputs.count()
        if pw_count >= 1:
            pw_inputs.nth(0).fill(args.password)
            time.sleep(0.3)
        if pw_count >= 2:
            pw_inputs.nth(1).fill(args.password)
            time.sleep(0.3)

        # ── Step 4: Handle Turnstile ──────────────────────────────────────────
        log_step("Menunggu Turnstile captcha selesai...")
        time.sleep(3)
        wait_for_cf_clearance(page, timeout=30)

        # ── Step 5: Submit form ───────────────────────────────────────────────
        log_step("Submit form registrasi...")
        submit_selectors = [
            "button[type='submit']",
            "button:has-text('Create Account')",
            "button:has-text('Sign up')",
            "button:has-text('Get started')",
            "input[type='submit']",
        ]
        submitted = False
        for sel in submit_selectors:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=2000):
                    btn.click()
                    submitted = True
                    break
            except Exception:
                continue
        if not submitted:
            die("Tidak bisa menemukan tombol submit registrasi")

        time.sleep(3)

        # Check for errors (email already registered, etc.)
        for err_sel in ["text=already registered", "text=already exists", "text=taken", ".error-message"]:
            try:
                if page.locator(err_sel).first.is_visible(timeout=1000):
                    die(f"Email sudah terdaftar atau error: {args.email}")
            except Exception:
                pass

        # ── Step 6: Email verification ────────────────────────────────────────
        if ammail_ok:
            verify_link = wait_for_cf_verify_email(
                args.ammail_base_url,
                args.ammail_api_key,
                args.email,
                timeout=120,
            )
            if verify_link:
                log_step(f"Membuka link verifikasi...")
                try:
                    page.goto(verify_link, wait_until="domcontentloaded", timeout=30000)
                    wait_for_cf_clearance(page, timeout=20)
                    time.sleep(3)
                except Exception as e:
                    log_step(f"Warning navigasi verify link: {e}")
            else:
                log_step("Email verifikasi tidak diterima dalam 2 menit, lanjut coba login...")
        else:
            log_step("Ammail tidak dikonfigurasi — skip email verification, lanjut login manual...")
            time.sleep(5)

        # ── Step 7: Login if needed ───────────────────────────────────────────
        current_url = page.url
        if "login" in current_url or "sign-in" in current_url or "dash.cloudflare.com" not in current_url:
            log_step("Melakukan login ke Cloudflare Dashboard...")
            try:
                page.goto("https://dash.cloudflare.com/login", wait_until="domcontentloaded", timeout=20000)
                wait_for_cf_clearance(page, timeout=20)
                time.sleep(1)

                for sel in email_sel:
                    try:
                        el = page.locator(sel).first
                        if el.is_visible(timeout=2000):
                            el.fill(args.email)
                            break
                    except Exception:
                        continue

                pw_el = page.locator("input[type='password']").first
                if pw_el.is_visible(timeout=3000):
                    pw_el.fill(args.password)

                time.sleep(0.5)
                for sel in submit_selectors:
                    try:
                        btn = page.locator(sel).first
                        if btn.is_visible(timeout=1000):
                            btn.click()
                            break
                    except Exception:
                        continue

                time.sleep(4)
                wait_for_cf_clearance(page, timeout=20)
            except Exception as e:
                log_step(f"Login error: {e}")

        # ── Step 8: Get to dashboard and extract account ID ───────────────────
        log_step("Memuat Cloudflare Dashboard...")
        try:
            page.goto("https://dash.cloudflare.com/", wait_until="domcontentloaded", timeout=30000)
            wait_for_cf_clearance(page, timeout=20)
            time.sleep(2)
        except Exception as e:
            log_step(f"Dashboard load warning: {e}")

        # Extract account_id from URL
        account_id = ""
        for _ in range(5):
            url_match = re.search(r"/([a-f0-9]{32})(?:/|$)", page.url)
            if url_match:
                account_id = url_match.group(1)
                log_step(f"Account ID: {account_id[:8]}...")
                break
            time.sleep(1)

        # ── Step 9: Extract Global API Key ────────────────────────────────────
        global_key = extract_global_api_key(page, args.password)

        if not global_key:
            log_step("Global API Key tidak bisa diambil, coba ambil via URL account_id...")
            # Try to get from dashboard URL pattern
            try:
                page.goto("https://dash.cloudflare.com/profile/api-tokens", wait_until="domcontentloaded", timeout=20000)
                wait_for_cf_clearance(page, timeout=15)
                time.sleep(2)
                # Check URL for account_id
                url_match = re.search(r"/([a-f0-9]{32})", page.url)
                if url_match and not account_id:
                    account_id = url_match.group(1)
            except Exception:
                pass

        if not global_key and not account_id:
            die("Tidak bisa mengambil API Key atau Account ID. Coba manual.")

        # ── Step 10: Create Workers AI token using Global API Key ──────────────
        workers_ai_token = None
        if global_key and account_id:
            log_step("Membuat Workers AI API Token...")
            workers_ai_token = create_workers_ai_token(global_key, args.email, account_id)
            if workers_ai_token:
                log_step("Workers AI Token berhasil dibuat!")
            else:
                log_step("Gagal buat token via API, gunakan Global API Key sebagai fallback...")

        # Use Workers AI token preferably, fallback to Global API Key
        final_api_key = workers_ai_token or global_key or ""

        if not final_api_key:
            die("Tidak ada API key yang bisa digunakan")

        log_step("Selesai! Menyimpan kredensial ke 9router...")
        success(final_api_key, account_id, args.email)


if __name__ == "__main__":
    main()
