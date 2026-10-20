// The app's pure sign-in helpers (lib/auth/pkce.ts), checked against the
// RFC 7636 test vector and the redirect/id_token rules.

import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1.0.13';
import {
  base64ToBase64Url,
  buildAuthorizeUrl,
  bytesToBase64Url,
  checkIdToken,
  checkRedirect,
  decodeJwtPayload,
  parseRedirect,
  PENDING_MAX_AGE_MS,
  type PendingSignIn,
} from '../../lib/auth/pkce.ts';

Deno.test('PKCE matches RFC 7636 appendix B', async () => {
  // Values from RFC 7636 appendix B (challenge cross-checked with `openssl dgst -sha256 -binary | base64`).
  const octets = new Uint8Array([116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121]);
  const verifier = bytesToBase64Url(octets);
  assertEquals(verifier, 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
  // expo-crypto's digestStringAsync(SHA256, ..., BASE64) returns padded standard base64.
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const padded = btoa(String.fromCharCode(...digest));
  assertEquals(base64ToBase64Url(padded), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

Deno.test('bytesToBase64Url agrees with btoa for every length', () => {
  for (let n = 0; n < 50; n++) {
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    const expected = btoa(String.fromCharCode(...bytes)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    assertEquals(bytesToBase64Url(bytes), expected);
  }
});

Deno.test('authorize URL carries PKCE S256, state, nonce and scopes', () => {
  const url = new URL(buildAuthorizeUrl({
    authorizationEndpoint: 'https://shopify.com/authentication/61337632846/oauth/authorize',
    clientId: 'client-123',
    redirectUri: 'shop.61337632846.app://auth/callback',
    state: 'st',
    nonce: 'no',
    codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGzSMw-cM',
  }));
  assertEquals(url.searchParams.get('scope'), 'openid email customer-account-api:full');
  assertEquals(url.searchParams.get('response_type'), 'code');
  assertEquals(url.searchParams.get('client_id'), 'client-123');
  assertEquals(url.searchParams.get('redirect_uri'), 'shop.61337632846.app://auth/callback');
  assertEquals(url.searchParams.get('code_challenge_method'), 'S256');
  assertEquals(url.searchParams.get('code_challenge'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGzSMw-cM');
  assertEquals(url.searchParams.get('state'), 'st');
  assertEquals(url.searchParams.get('nonce'), 'no');
});

Deno.test('parseRedirect reads native and web callback URLs', () => {
  assertEquals(parseRedirect('shop.61337632846.app://auth/callback?code=abc&state=x%2By'), { code: 'abc', state: 'x+y' });
  assertEquals(
    parseRedirect('https://momominibot.github.io/emis-plus-app/auth/callback?error=access_denied&error_description=User+cancelled#frag'),
    { error: 'access_denied', error_description: 'User cancelled' },
  );
  assertEquals(parseRedirect('https://x/cb'), {});
});

const pending: PendingSignIn = {
  state: 'state-1', nonce: 'nonce-1', verifier: 'v', redirectUri: 'r', clientId: 'client-123', createdAt: 1_000_000,
};
const ISS = 'https://shopify.com/authentication/61337632846';

Deno.test('checkRedirect accepts only the sign-in we started', () => {
  const now = pending.createdAt + 1000;
  assertEquals(checkRedirect({ code: 'c', state: 'state-1', iss: ISS }, pending, ISS, now), { ok: true, code: 'c' });
  assertEquals(checkRedirect({ code: 'c', state: 'state-1' }, pending, ISS, now), { ok: true, code: 'c' });
  assert(!checkRedirect({ code: 'c', state: 'other' }, pending, ISS, now).ok);
  assert(!checkRedirect({ code: 'c' }, pending, ISS, now).ok);
  assert(!checkRedirect({ code: 'c', state: 'state-1', iss: 'https://evil.example' }, pending, ISS, now).ok);
  assert(!checkRedirect({ code: 'c', state: 'state-1' }, null, ISS, now).ok);
  assert(!checkRedirect({ code: 'c', state: 'state-1' }, pending, ISS, pending.createdAt + PENDING_MAX_AGE_MS + 1).ok);
  assert(!checkRedirect({ state: 'state-1' }, pending, ISS, now).ok);
  const cancelled = checkRedirect({ error: 'access_denied', state: 'state-1' }, pending, ISS, now);
  assertEquals(cancelled, { ok: false, message: 'Sign-in was cancelled.' });
});

function jwt(claims: Record<string, unknown>) {
  const enc = (o: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return enc({ alg: 'RS256' }) + '.' + enc(claims) + '.sig';
}

Deno.test('id_token claims must match issuer, client, nonce and be unexpired', () => {
  const now = 1_700_000_000_000;
  const good = { iss: ISS, aud: 'client-123', nonce: 'nonce-1', exp: now / 1000 + 3600, name: 'Tân Lê 李' };
  const claims = decodeJwtPayload(jwt(good));
  assertEquals(claims.name, 'Tân Lê 李');
  const expect = { issuer: ISS, clientId: 'client-123', nonce: 'nonce-1', now };
  assert(checkIdToken(claims, expect));
  assert(checkIdToken({ ...good, aud: ['other', 'client-123'] }, expect));
  assert(!checkIdToken({ ...good, nonce: 'replayed' }, expect));
  assert(!checkIdToken({ ...good, aud: 'other-client' }, expect));
  assert(!checkIdToken({ ...good, iss: 'https://evil.example' }, expect));
  assert(!checkIdToken({ ...good, exp: now / 1000 - 3600 }, expect));
  assertThrows(() => decodeJwtPayload('not-a-jwt'));
});
