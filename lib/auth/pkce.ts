// Pure helpers for Shopify Customer Account API sign-in (OAuth 2.0
// authorization code + PKCE, public client). No React Native or Expo
// imports, so the backend test suite can exercise them directly.
//
// Docs: https://shopify.dev/docs/api/customer (Authentication)

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_');
}

/** Shopify rejects padded or +/ encoded challenges (invalid_grant). */
export function base64ToBase64Url(b64: string): string {
  return b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlToBytes(text: string): Uint8Array {
  const clean = text.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('Invalid base64');
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let cp = b;
    if (b >= 0xf0) cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    else if (b >= 0xe0) cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    else if (b >= 0xc0) cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    out += String.fromCodePoint(cp);
  }
  return out;
}

/** Reads a JWT's claims. The id_token comes straight from Shopify's token endpoint over TLS. */
export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const payload = JSON.parse(utf8Decode(base64UrlToBytes(parts[1])));
  if (!payload || typeof payload !== 'object') throw new Error('Malformed token');
  return payload as Record<string, unknown>;
}

export interface AuthorizeParams {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  loginHint?: string;
}

export const SCOPES = 'openid email customer-account-api:full';

export function buildAuthorizeUrl(p: AuthorizeParams): string {
  const q: [string, string][] = [
    ['scope', SCOPES],
    ['client_id', p.clientId],
    ['response_type', 'code'],
    ['redirect_uri', p.redirectUri],
    ['state', p.state],
    ['nonce', p.nonce],
    ['code_challenge', p.codeChallenge],
    ['code_challenge_method', 'S256'],
    ['locale', 'en'],
    ['region_country', 'SG'],
  ];
  if (p.loginHint) q.push(['login_hint', p.loginHint]);
  return p.authorizationEndpoint + '?' + q.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
}

export type RedirectParams = { code?: string; state?: string; error?: string; error_description?: string; iss?: string };

/** Query parameters from the redirect URL (code, state, error, iss). */
export function parseRedirect(url: string): RedirectParams {
  const query = url.split('#')[0].split('?')[1] || '';
  const out: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch {
      // ignore malformed pairs
    }
  }
  return out as RedirectParams;
}

export function formBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
}

export interface PendingSignIn {
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  createdAt: number;
}

export const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Checks the redirect against the sign-in we started. Returns the code to
 * exchange, or a message explaining why the sign-in cannot continue.
 */
export function checkRedirect(
  params: RedirectParams,
  pending: PendingSignIn | null,
  issuer: string,
  now: number,
): { ok: true; code: string } | { ok: false; message: string } {
  if (params.error) {
    return { ok: false, message: params.error === 'access_denied' ? 'Sign-in was cancelled.' : 'Sign-in did not complete. Please try again.' };
  }
  if (!pending || now - pending.createdAt > PENDING_MAX_AGE_MS) {
    return { ok: false, message: 'This sign-in link has expired. Please try again.' };
  }
  if (!params.state || params.state !== pending.state) {
    return { ok: false, message: 'Sign-in could not be verified. Please try again.' };
  }
  if (params.iss && params.iss !== issuer) {
    return { ok: false, message: 'Sign-in could not be verified. Please try again.' };
  }
  if (!params.code) return { ok: false, message: 'Sign-in did not complete. Please try again.' };
  return { ok: true, code: params.code };
}

/** id_token claims must match the sign-in we started. */
export function checkIdToken(
  claims: Record<string, unknown>,
  expect: { issuer: string; clientId: string; nonce: string; now: number },
): boolean {
  const aud = claims.aud;
  const audOk = Array.isArray(aud) ? aud.includes(expect.clientId) : aud === expect.clientId;
  const exp = typeof claims.exp === 'number' ? claims.exp * 1000 : 0;
  return claims.iss === expect.issuer && audOk && claims.nonce === expect.nonce && exp > expect.now - 60_000;
}
