#!/usr/bin/env python3
"""Browser test of the EMIS+ web sign-in, orders, points and sign-out.

Runs a real web export of the app in headless Chromium. Shopify's discovery,
authorize, token, logout and Customer Account GraphQL endpoints, and the
loyalty API, are stand-ins inside this script: the stand-in authorize/token
pair checks PKCE (S256), state and nonce the way Shopify does. Nothing is sent
to Shopify or Supabase.

Usage (from the repo root):
  CI=1 EXPO_PUBLIC_SHOPIFY_CA_CLIENT_ID=test-client-id \
    EXPO_PUBLIC_LOYALTY_API_URL=https://loyalty.test/functions/v1/loyalty \
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
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright

BASE = "/emis-plus-app"
ISS = "https://shopify.com/authentication/61337632846"
AUTH = "https://shopify.test/authentication/61337632846"
GRAPHQL = "https://shopify.test/61337632846/account/customer/api/2026-10/graphql"
LOYALTY = "https://loyalty.test/functions/v1/loyalty"
CLIENT_ID = "test-client-id"
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}


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


class FakeShopify:
    def __init__(self):
        self.authorize = None
        self.token_calls = []
        self.loyalty_calls = []
        self.claimed = None
        self.logged_out = False

    def id_token(self, nonce):
        header = b64url(json.dumps({"alg": "RS256"}).encode())
        claims = b64url(json.dumps({"iss": ISS, "aud": CLIENT_ID, "nonce": nonce, "exp": 4102444800, "sub": "x"}).encode())
        return f"{header}.{claims}.sig"

    def route(self, route):
        req = route.request
        url = urllib.parse.urlsplit(req.url)
        if req.method == "OPTIONS":
            return route.fulfill(status=204, headers=CORS)
        if req.url.startswith("https://www.emis.asia/.well-known/openid-configuration"):
            return route.fulfill(json={
                "issuer": ISS, "authorization_endpoint": AUTH + "/oauth/authorize",
                "token_endpoint": AUTH + "/oauth/token", "end_session_endpoint": AUTH + "/logout",
            }, headers=CORS)
        if req.url.startswith("https://www.emis.asia/.well-known/customer-account-api"):
            return route.fulfill(json={"graphql_api": GRAPHQL}, headers=CORS)
        if url.path.endswith("/oauth/authorize"):
            q = dict(urllib.parse.parse_qsl(url.query))
            self.authorize = q
            assert q["client_id"] == CLIENT_ID and q["response_type"] == "code"
            assert q["code_challenge_method"] == "S256" and q["scope"] == "openid email customer-account-api:full"
            loc = q["redirect_uri"] + "?" + urllib.parse.urlencode({"code": "CODE-1", "state": q["state"], "iss": ISS})
            return route.fulfill(status=302, headers={"Location": loc})
        if url.path.endswith("/oauth/token"):
            form = dict(urllib.parse.parse_qsl(req.post_data or ""))
            self.token_calls.append(form)
            if form.get("grant_type") == "authorization_code":
                a = self.authorize or {}
                ok = (
                    form.get("code") == "CODE-1"
                    and form.get("client_id") == CLIENT_ID
                    and form.get("redirect_uri") == a.get("redirect_uri")
                    and b64url(hashlib.sha256(form.get("code_verifier", "").encode()).digest()) == a.get("code_challenge")
                )
                if not ok:
                    return route.fulfill(status=400, json={"error": "invalid_grant"}, headers=CORS)
                return route.fulfill(json={
                    "access_token": "access-1", "expires_in": 3600, "refresh_token": "refresh-1",
                    "id_token": self.id_token(a["nonce"]),
                }, headers=CORS)
            return route.fulfill(status=400, json={"error": "unsupported_grant_type"}, headers=CORS)
        if url.path.endswith("/logout"):
            self.logged_out = True
            q = dict(urllib.parse.parse_qsl(url.query))
            assert q.get("id_token_hint"), "logout needs id_token_hint"
            return route.fulfill(status=302, headers={"Location": q["post_logout_redirect_uri"]})
        if req.url == GRAPHQL:
            if req.headers.get("authorization") != "access-1":
                return route.fulfill(status=401, json={"errors": "Unauthorized"}, headers=CORS)
            query = json.loads(req.post_data)["query"]
            if "EmisCustomer" in query:
                return route.fulfill(json={"data": {"customer": {
                    "id": "gid://shopify/Customer/7012345678901", "firstName": "Pat",
                    "emailAddress": {"emailAddress": "pat@example.com"}}}}, headers=CORS)
            if "EmisOrders" in query:
                return route.fulfill(json={"data": {"customer": {"orders": {"nodes": [{
                    "id": "gid://shopify/Order/1", "name": "#1042", "processedAt": "2026-10-01T03:00:00Z",
                    "financialStatus": "PAID", "fulfillmentStatus": "FULFILLED", "cancelledAt": None,
                    "statusPageUrl": "https://www.emis.asia/orders/status",
                    "totalPrice": {"amount": "123.45", "currencyCode": "SGD"},
                    "lineItems": {"nodes": [{"title": "Foam dressing 10x10", "quantity": 2, "image": None}]},
                    "fulfillments": {"nodes": [{"latestShipmentStatus": "DELIVERED",
                                                "trackingInformation": [{"number": "SG1", "company": "Ninja Van", "url": "https://track.test/SG1"}]}]},
                }]}}}}, headers=CORS)
            return route.fulfill(status=400, json={"errors": [{"message": "unknown query"}]}, headers=CORS)
        if req.url.startswith(LOYALTY):
            self.loyalty_calls.append((req.method, url.path, req.headers.get("authorization")))
            if req.headers.get("authorization") != "Bearer access-1":
                return route.fulfill(status=401, json={"error": "sign_in_required"}, headers=CORS)
            if url.path.endswith("/referral"):
                self.claimed = json.loads(req.post_data)["code"]
                return route.fulfill(json={"outcome": "pending"}, headers=CORS)
            return route.fulfill(json={"member": {
                "customerId": "7012345678901", "points": 345, "tier": "silver", "totalSpentCents": 34500,
                "referralCode": "ABCD2345", "referralsCompleted": 1, "referralsPending": 0,
                "referredStatus": "pending" if self.claimed else None,
                "transactions": [{"id": "1", "date": "2026-10-01T03:00:00Z", "kind": "order", "points": 123,
                                  "balanceAfter": 345, "description": "Order #1042"}],
            }}, headers=CORS)
        return route.continue_()


SHOTS = os.environ.get("SHOTS_DIR")


def shot(page, name):
    if SHOTS:
        page.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=True)


def check(cond, label):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond:
        check.failed += 1


check.failed = 0


def run(web_test, web_plain):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        fake = FakeShopify()
        ctx.route("https://www.emis.asia/.well-known/**", fake.route)
        ctx.route("https://shopify.test/**", fake.route)
        ctx.route("https://loyalty.test/**", fake.route)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        if os.environ.get("DEBUG_NAV"):
            page.on("framenavigated", lambda f: f == page.main_frame and print("NAV", f.url))

        httpd, origin = serve(web_test)
        page.goto(origin + BASE + "/account")
        page.get_by_text("Sign in to EMIS+").wait_for()
        check(True, "signed-out account offers sign-in")
        shot(page, "account-signed-out")

        page.get_by_text("Sign in with emis.asia").click()
        page.get_by_text("Your referral code").wait_for(timeout=15000)
        check(page.url.endswith(BASE + "/account"), "returns to /account after the callback: " + page.url)
        check(fake.authorize["redirect_uri"] == origin + BASE + "/auth/callback", "redirect_uri is the web callback")
        code = [c for c in fake.token_calls if c.get("grant_type") == "authorization_code"]
        check(len(code) == 1 and len(code[0]["code_verifier"]) >= 43, "exactly one code exchange with a PKCE verifier")
        check(page.get_by_text("Pat", exact=True).count() > 0, "shows the customer's first name")
        check(page.get_by_text("pat@example.com").count() > 0, "shows the customer's email")
        check(page.get_by_text("345", exact=True).count() > 0, "shows server Health Points")
        check(page.get_by_text("ABCD2345").count() > 0, "shows the server referral code")
        check(page.get_by_text("Order #1042").count() > 0, "shows ledger history")
        shot(page, "account-signed-in")
        stored = page.evaluate("() => ({ access: localStorage.getItem('emis.auth.access'), pending: sessionStorage.getItem('emis.auth.pending') })")
        check(stored["access"] == "access-1" and stored["pending"] is None, "token stored, pending sign-in consumed")
        check(all(c[2] == "Bearer access-1" for c in fake.loyalty_calls), "loyalty API gets the customer's bearer token only")

        page.get_by_text("Have a referral code?").click()
        page.get_by_placeholder("Enter code").fill("wxyz2345")
        page.get_by_text("Use this code").click()
        page.get_by_text("Code saved.", exact=False).first.wait_for()
        check(fake.claimed == "wxyz2345", "referral code sent to the server")
        page.get_by_text("Your 100 welcome points arrive", exact=False).wait_for()
        check(True, "account shows the pending referral from the server")

        page.goto(origin + BASE + "/orders")
        page.get_by_text("#1042").wait_for()
        check(page.get_by_text("Delivered").count() > 0, "orders show shipment status")
        check(page.get_by_text("S$123.45", exact=False).count() > 0, "orders show the Shopify total")
        check(page.get_by_text("Track parcel").count() > 0, "orders offer tracking")
        shot(page, "orders-signed-in")

        # Replaying the callback (code already used, pending consumed) must not sign anyone in again.
        page.goto(origin + BASE + "/auth/callback?code=CODE-1&state=" + fake.authorize["state"])
        page.get_by_text("Sign-in did not finish").wait_for()
        check(len([c for c in fake.token_calls if c.get("grant_type") == "authorization_code"]) == 1, "replayed callback makes no token request")

        page.goto(origin + BASE + "/account")
        # Local sign-out first, then the browser visits Shopify's logout, which redirects back.
        with page.expect_event("load", timeout=15000):
            with page.expect_request(lambda r: "/logout" in r.url, timeout=15000):
                page.get_by_text("Sign out").click()
        page.get_by_text("Sign in to EMIS+").wait_for(timeout=15000)
        check(fake.logged_out, "sign-out calls Shopify logout with the id_token")
        check(page.evaluate("() => localStorage.getItem('emis.auth.access')") is None, "sign-out clears stored tokens")

        page.goto(origin + BASE + "/")
        page.get_by_text("Sign in to collect Health Points on paid orders.").wait_for()
        check(True, "home shows the signed-out rewards hint")
        httpd.shutdown()

        httpd2, origin2 = serve(web_plain)
        page.goto(origin2 + BASE + "/account")
        page.get_by_text("EMIS+ accounts are coming soon").wait_for()
        check(True, "unconfigured build shows coming soon, no fake points")
        page.goto(origin2 + BASE + "/orders")
        page.get_by_text("Order tracking in the app arrives with EMIS+ sign-in", exact=False).wait_for()
        check(True, "unconfigured build keeps the emis.asia account link for orders")
        page.goto(origin2 + BASE + "/")
        page.get_by_text("Health Points launch soon with EMIS+ accounts.").wait_for()
        check(True, "unconfigured home shows launch-soon hint")
        httpd2.shutdown()

        check(not errors, "no page errors: " + "; ".join(errors[:3]))
        browser.close()
    return check.failed


if __name__ == "__main__":
    sys.exit(1 if run(sys.argv[1], sys.argv[2]) else 0)
