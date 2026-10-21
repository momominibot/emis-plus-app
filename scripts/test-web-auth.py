#!/usr/bin/env python3
"""Browser test of EMIS+ web sign-in (Supabase Auth), points, orders and sign-out.

Runs a real web export of the app in headless Chromium with the real
supabase-js. Supabase Auth (/auth/v1: otp, verify, authorize, token, logout)
and the loyalty edge function are stand-ins inside this script. The stand-in
authorize/token pair checks the PKCE S256 challenge the way Supabase does.
Nothing is sent to Supabase or Shopify.

Usage (from the repo root):
  CI=1 EXPO_PUBLIC_SUPABASE_URL=https://emis-test.supabase.co \
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test \
    EXPO_PUBLIC_LOYALTY_ENABLED=true EXPO_PUBLIC_AUTH_PROVIDERS=email,apple,google \
    npx expo export -p web --clear --output-dir /tmp/web-test
  CI=1 npx expo export -p web --clear --output-dir /tmp/web-plain
  python3 scripts/test-web-auth.py /tmp/web-test /tmp/web-plain

Needs the Python Playwright package with Chromium installed.
"""

import base64
import hashlib
import json
import os
import sys
import threading
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright

BASE = "/emis-plus-app"
SUPABASE = "https://emis-test.supabase.co"
USER_ID = "6f9619ff-8b86-4011-b42d-00c04fc964ff"
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
}
SHOTS = os.environ.get("SHOTS_DIR")


def serve(root):
    """Static server for the export under /emis-plus-app/, SPA fallback like GitHub Pages' 404.html."""

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=root, **kw)

        def log_message(self, *a):
            pass

        def translate_path(self, path):
            path = urllib.parse.urlsplit(path).path
            if path.startswith(BASE):
                path = path[len(BASE):] or "/"
            full = super().translate_path(path)
            if not os.path.exists(full) or os.path.isdir(full) and not os.path.exists(os.path.join(full, "index.html")):
                return os.path.join(root, "index.html")
            return full

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://localhost:{httpd.server_address[1]}"


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def jwt(claims):
    return f"{b64url(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())}.{b64url(json.dumps(claims).encode())}.sig"


class FakeSupabase:
    def __init__(self):
        self.otp = []
        self.verify = []
        self.authorize = None
        self.exchanges = []
        self.logouts = 0
        self.loyalty_auth = []
        self.claimed = None

    def session(self, email):
        now = int(time.time())
        token = jwt({"sub": USER_ID, "email": email, "aud": "authenticated", "role": "authenticated", "exp": now + 3600, "iat": now})
        return {
            "access_token": token, "token_type": "bearer", "expires_in": 3600, "expires_at": now + 3600,
            "refresh_token": "refresh-1",
            "user": {
                "id": USER_ID, "aud": "authenticated", "role": "authenticated", "email": email,
                "email_confirmed_at": "2026-10-21T00:00:00Z", "app_metadata": {"provider": "email"},
                "user_metadata": {"given_name": "Pat"}, "created_at": "2026-10-21T00:00:00Z",
            },
        }

    def route(self, route):
        req = route.request
        url = urllib.parse.urlsplit(req.url)
        q = dict(urllib.parse.parse_qsl(url.query))
        if req.method == "OPTIONS":
            return route.fulfill(status=204, headers=CORS)
        body = json.loads(req.post_data) if req.post_data else {}
        if url.path == "/auth/v1/otp":
            self.otp.append(body)
            return route.fulfill(json={}, headers=CORS)
        if url.path == "/auth/v1/verify":
            self.verify.append(body)
            if body.get("token") != "123456":
                return route.fulfill(status=403, json={"code": 403, "error_code": "otp_expired", "msg": "Token has expired or is invalid"}, headers=CORS)
            return route.fulfill(json=self.session(body["email"]), headers=CORS)
        if url.path == "/auth/v1/authorize":
            self.authorize = q
            assert q.get("code_challenge") and q.get("code_challenge_method", "").lower() == "s256", q
            loc = q["redirect_to"] + ("&" if "?" in q["redirect_to"] else "?") + "code=pkce-code-1"
            return route.fulfill(status=302, headers={"Location": loc})
        if url.path == "/auth/v1/token" and q.get("grant_type") == "pkce":
            self.exchanges.append(body)
            ok = body.get("auth_code") == "pkce-code-1" and self.authorize and \
                b64url(hashlib.sha256(body.get("code_verifier", "").encode()).digest()) == self.authorize["code_challenge"]
            if not ok:
                return route.fulfill(status=400, json={"code": 400, "error_code": "bad_code_verifier", "msg": "bad verifier"}, headers=CORS)
            return route.fulfill(json=self.session("pat@example.com"), headers=CORS)
        if url.path == "/auth/v1/logout":
            self.logouts += 1
            return route.fulfill(status=204, headers=CORS)
        if url.path.startswith("/functions/v1/loyalty"):
            self.loyalty_auth.append(req.headers.get("authorization", ""))
            if not req.headers.get("authorization", "").startswith("Bearer ey"):
                return route.fulfill(status=401, json={"error": "sign_in_required"}, headers=CORS)
            if url.path.endswith("/referral"):
                self.claimed = body.get("code")
                return route.fulfill(json={"outcome": "pending"}, headers=CORS)
            return route.fulfill(json={"member": {
                "memberId": USER_ID, "email": "pat@example.com", "points": 345, "tier": "silver", "totalSpentCents": 34500,
                "referralCode": "ABCD2345", "referralsCompleted": 1, "referralsPending": 0,
                "referredStatus": "pending" if self.claimed else None,
                "transactions": [{"id": "1", "date": "2026-10-01T03:00:00Z", "kind": "order", "points": 123,
                                  "balanceAfter": 345, "description": "Order #1042"}],
                "orders": [{"orderId": "1042", "name": "#1042", "processedAt": "2026-10-01T03:00:00Z",
                            "amountCents": 12345, "refundedCents": 0, "points": 123}],
            }}, headers=CORS)
        return route.fulfill(status=404, json={"msg": "not mocked: " + url.path}, headers=CORS)


def check(cond, label):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond:
        check.failed += 1


check.failed = 0


def shot(page, name):
    if SHOTS:
        page.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=True)


def run(web_test, web_plain):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        fake = FakeSupabase()
        ctx.route(SUPABASE + "/**", fake.route)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        httpd, origin = serve(web_test)

        # ---- email code
        page.goto(origin + BASE + "/account")
        page.get_by_text("Sign in to EMIS+").wait_for()
        check(page.get_by_text("Continue with Google").count() == 1 and page.get_by_text("Continue with Apple").count() == 1,
              "Apple and Google offered when switched on")
        shot(page, "account-signed-out")
        page.get_by_placeholder("Email address").fill("  Pat@Example.com ")
        page.get_by_text("Email me a code").click()
        page.get_by_placeholder("6-digit code").wait_for()
        check(len(fake.otp) == 1 and fake.otp[0].get("email") == "pat@example.com", "code requested for the normalized email")
        check(fake.otp[0].get("create_user") is True, "new emails create an account")
        page.get_by_placeholder("6-digit code").fill("999999")
        page.get_by_text("Sign in", exact=True).click()
        page.get_by_text("That code is not right or has expired", exact=False).wait_for()
        check(True, "a wrong code shows a plain message")
        page.get_by_placeholder("6-digit code").fill("123456")
        page.get_by_text("Sign in", exact=True).click()
        page.get_by_text("Your referral code").wait_for(timeout=15000)
        check(fake.verify[-1].get("type") == "email" and fake.verify[-1].get("token") == "123456"
              and fake.verify[-1].get("email") == "pat@example.com", "verified as an email OTP")
        check(page.get_by_text("Pat", exact=True).count() > 0, "shows the first name")
        check(page.get_by_text("345", exact=True).count() > 0, "shows server Health Points")
        check(len(fake.loyalty_auth) > 0 and all(a.startswith("Bearer ey") for a in fake.loyalty_auth),
              "loyalty API gets the Supabase access token")
        shot(page, "account-signed-in")

        # ---- referral and orders
        page.get_by_text("Have a referral code?").click()
        page.get_by_placeholder("Enter code").fill("wxyz2345")
        page.get_by_text("Use this code").click()
        page.get_by_text("Code saved.", exact=False).first.wait_for()
        check(fake.claimed == "wxyz2345", "referral code sent to the server")

        page.goto(origin + BASE + "/orders")
        page.get_by_text("#1042").wait_for()
        check(page.get_by_text("+123 points").count() == 1, "orders show the points each earned")
        check(page.get_by_text("Full order details on emis.asia").count() == 1, "orders link to emis.asia for details")
        shot(page, "orders-signed-in")

        # ---- sign out
        page.goto(origin + BASE + "/account")
        page.get_by_text("Sign out").click()
        page.get_by_text("Sign in to EMIS+").wait_for(timeout=10000)
        check(fake.logouts == 1, "sign-out calls Supabase logout")
        stored = page.evaluate(
            "() => Object.keys(localStorage).filter(k => k.startsWith('sb-') && (localStorage.getItem(k) || '').includes('access_token'))")
        check(stored == [], "sign-out clears the stored session")

        # ---- Google (PKCE redirect)
        with page.expect_navigation(url="**" + BASE + "/account", timeout=20000):
            page.get_by_text("Continue with Google").click()
        page.get_by_text("Your referral code").wait_for(timeout=15000)
        check(fake.authorize is not None and fake.authorize.get("provider") == "google", "Google goes through Supabase authorize")
        check(fake.authorize.get("redirect_to") == origin + BASE + "/auth/callback", "redirect_to is the web callback")
        check(len(fake.exchanges) == 1, "PKCE code exchanged once with a matching verifier")
        httpd.shutdown()

        # ---- unconfigured build
        httpd2, origin2 = serve(web_plain)
        page2 = ctx.new_page()
        page2.on("pageerror", lambda e: errors.append(str(e)))
        page2.goto(origin2 + BASE + "/account")
        page2.get_by_text("EMIS+ accounts are coming soon").wait_for()
        check(True, "unconfigured build shows coming soon, no fake points")
        page2.goto(origin2 + BASE + "/orders")
        page2.get_by_text("Order history in the app arrives with EMIS+ accounts", exact=False).wait_for()
        check(True, "unconfigured build keeps the emis.asia account link for orders")
        page2.goto(origin2 + BASE + "/")
        page2.get_by_text("Health Points launch soon with EMIS+ accounts.").wait_for()
        check(True, "unconfigured home shows launch-soon hint")
        httpd2.shutdown()

        check(not errors, "no page errors: " + "; ".join(errors[:3]))
        browser.close()
    return check.failed


if __name__ == "__main__":
    sys.exit(1 if run(sys.argv[1], sys.argv[2]) else 0)
