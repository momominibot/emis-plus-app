// The app's sign-in steps (lib/auth/flows.ts) against a mocked supabase-js
// auth client: email OTP, Apple id token, OAuth with PKCE code exchange.
// lib/auth/session.ts passes the real supabase.auth without a cast, so the
// compiler holds the real client to the same shapes this mock implements.

import { assert, assertEquals } from 'jsr:@std/assert@1.0.13';
import {
  completeOAuthRedirect,
  normalizeEmail,
  parseAuthRedirect,
  sendEmailCode,
  signInWithApple,
  signInWithGoogle,
  verifyEmailCode,
  type AuthClientLike,
  type FlowDeps,
} from '../../lib/auth/flows.ts';

type Call = [string, unknown];
type Err = { message: string; status?: number; code?: string } | null;

function mockAuth(overrides: Partial<Record<keyof AuthClientLike, (arg: never) => unknown>> = {}) {
  const calls: Call[] = [];
  const session = { access_token: 'jwt', user: { id: 'u1' } };
  const ok = <T>(data: T) => Promise.resolve({ data, error: null as Err });
  const base: AuthClientLike = {
    signInWithOtp: (a) => (calls.push(['signInWithOtp', a]), Promise.resolve({ error: null })),
    verifyOtp: (a) => (calls.push(['verifyOtp', a]), ok({ session })),
    signInWithIdToken: (a) => (calls.push(['signInWithIdToken', a]), ok({ session })),
    signInWithOAuth: (a) => (calls.push(['signInWithOAuth', a]), ok({ url: 'https://ref.supabase.co/auth/v1/authorize?provider=x' })),
    exchangeCodeForSession: (c) => (calls.push(['exchangeCodeForSession', c]), ok({ session })),
    updateUser: (a) => (calls.push(['updateUser', a]), Promise.resolve({ error: null })),
  };
  const auth = { ...base, ...(overrides as Partial<AuthClientLike>) };
  for (const key of Object.keys(overrides) as (keyof AuthClientLike)[]) {
    const fn = (overrides as Record<string, (a: unknown) => unknown>)[key];
    (auth as Record<string, unknown>)[key] = (a: unknown) => (calls.push([key, a]), fn(a));
  }
  return { auth, calls };
}

function deps(auth: AuthClientLike, extra: Partial<FlowDeps> = {}): FlowDeps {
  return { auth, platform: 'ios', redirectUri: () => 'emisapp://auth/callback', ...extra };
}

// ------------------------------------------------------------------ email

Deno.test('email code: sends to the normalized address and creates the user if new', async () => {
  const { auth, calls } = mockAuth();
  assertEquals(await sendEmailCode(deps(auth), '  Pat@Example.COM '), { ok: true });
  assertEquals(calls, [['signInWithOtp', { email: 'pat@example.com', options: { shouldCreateUser: true } }]]);
  assertEquals(normalizeEmail('nope'), null);
  const bad = await sendEmailCode(deps(auth), 'not an email');
  assert(bad && !bad.ok);
  assertEquals(calls.length, 1);
});

Deno.test('email code: rate limits and errors become plain messages', async () => {
  const { auth } = mockAuth({
    signInWithOtp: () => Promise.resolve({ error: { message: 'too many', status: 429, code: 'over_email_send_rate_limit' } }),
  });
  assertEquals(await sendEmailCode(deps(auth), 'pat@example.com'), { ok: false, message: 'Please wait a minute before asking for another code.' });
});

Deno.test('email code: only a 6-digit code is verified, as type email', async () => {
  const { auth, calls } = mockAuth();
  const short = await verifyEmailCode(deps(auth), 'pat@example.com', '12345');
  assert(short && !short.ok);
  assertEquals(calls.length, 0);
  assertEquals(await verifyEmailCode(deps(auth), 'Pat@example.com', '123 456'), { ok: true });
  assertEquals(calls, [['verifyOtp', { email: 'pat@example.com', token: '123456', type: 'email' }]]);
});

Deno.test('email code: an expired code or a missing session is not a sign-in', async () => {
  const expired = mockAuth({
    verifyOtp: () => Promise.resolve({ data: { session: null }, error: { message: 'Token has expired or is invalid', status: 403, code: 'otp_expired' } }),
  });
  assertEquals(await verifyEmailCode(deps(expired.auth), 'pat@example.com', '123456'), {
    ok: false, message: 'That code is not right or has expired. Check the email or ask for a new code.',
  });
  const noSession = mockAuth({ verifyOtp: () => Promise.resolve({ data: { session: null }, error: null }) });
  const r = await verifyEmailCode(deps(noSession.auth), 'pat@example.com', '123456');
  assert(r && !r.ok);
});

// ------------------------------------------------------------------ Apple

Deno.test('Apple on iOS: native identity token goes to signInWithIdToken, the first-time name is kept', async () => {
  const { auth, calls } = mockAuth();
  const apple = () => Promise.resolve({ identityToken: 'apple-id-token', fullName: { givenName: 'Pat', familyName: 'Lee' } });
  assertEquals(await signInWithApple(deps(auth, { appleSignIn: apple })), { ok: true });
  assertEquals(calls, [
    ['signInWithIdToken', { provider: 'apple', token: 'apple-id-token' }],
    ['updateUser', { data: { full_name: 'Pat Lee', given_name: 'Pat', family_name: 'Lee' } }],
  ]);
});

Deno.test('Apple on iOS: cancelling is silent, a missing token or rejected token is reported', async () => {
  const { auth, calls } = mockAuth();
  const cancel = () => Promise.reject(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));
  assertEquals(await signInWithApple(deps(auth, { appleSignIn: cancel })), null);
  const noToken = await signInWithApple(deps(auth, { appleSignIn: () => Promise.resolve({ identityToken: null }) }));
  assert(noToken && !noToken.ok);
  assertEquals(calls.length, 0);
  const rejected = mockAuth({
    signInWithIdToken: () => Promise.resolve({ data: { session: null }, error: { message: 'Unacceptable audience', status: 400 } }),
  });
  const r = await signInWithApple(deps(rejected.auth, { appleSignIn: () => Promise.resolve({ identityToken: 't' }) }));
  assert(r && !r.ok);
});

Deno.test('Apple on Android: browser OAuth with PKCE, code exchanged once', async () => {
  const { auth, calls } = mockAuth();
  const opened: string[][] = [];
  const result = await signInWithApple(deps(auth, {
    platform: 'android',
    openAuthSession: (url, redirect) => (opened.push([url, redirect]), Promise.resolve({ type: 'success', url: 'emisapp://auth/callback?code=abc123' })),
  }));
  assertEquals(result, { ok: true });
  assertEquals(calls, [
    ['signInWithOAuth', { provider: 'apple', options: { redirectTo: 'emisapp://auth/callback', skipBrowserRedirect: true } }],
    ['exchangeCodeForSession', 'abc123'],
  ]);
  assertEquals(opened, [['https://ref.supabase.co/auth/v1/authorize?provider=x', 'emisapp://auth/callback']]);
});

// ------------------------------------------------------------------ Google

Deno.test('Google on web: hands over to Supabase, which navigates away', async () => {
  const { auth, calls } = mockAuth();
  const result = await signInWithGoogle(deps(auth, { platform: 'web', redirectUri: () => 'https://momominibot.github.io/emis-plus-app/auth/callback' }));
  assertEquals(result, null);
  assertEquals(calls, [['signInWithOAuth', { provider: 'google', options: { redirectTo: 'https://momominibot.github.io/emis-plus-app/auth/callback' } }]]);
});

Deno.test('Google on native: closing the browser is silent and exchanges nothing', async () => {
  const { auth, calls } = mockAuth();
  const result = await signInWithGoogle(deps(auth, { platform: 'android', openAuthSession: () => Promise.resolve({ type: 'cancel' }) }));
  assertEquals(result, null);
  assertEquals(calls.map((c) => c[0]), ['signInWithOAuth']);
});

// ------------------------------------------------------------ redirect page

Deno.test('callback: the same code twice is exchanged once; errors are handled', async () => {
  const { auth, calls } = mockAuth();
  const d = deps(auth);
  const [a, b] = await Promise.all([completeOAuthRedirect(d, { code: 'twice' }), completeOAuthRedirect(d, { code: 'twice' })]);
  assertEquals([a, b], [{ ok: true }, { ok: true }]);
  assertEquals(calls.filter((c) => c[0] === 'exchangeCodeForSession').length, 1);
  assertEquals(await completeOAuthRedirect(d, { error: 'access_denied' }), null);
  const missing = await completeOAuthRedirect(d, {});
  assert(missing && !missing.ok);
  const used = mockAuth({
    exchangeCodeForSession: () => Promise.resolve({ data: { session: null }, error: { message: 'invalid flow state', status: 400 } }),
  });
  const r = await completeOAuthRedirect(deps(used.auth), { code: 'stale' });
  assert(r && !r.ok);
});

Deno.test('parseAuthRedirect reads query and fragment', () => {
  assertEquals(parseAuthRedirect('emisapp://auth/callback?code=a%2Bb'), { code: 'a+b', error: undefined, error_description: undefined });
  assertEquals(
    parseAuthRedirect('https://x/auth/callback#error=access_denied&error_description=User+cancelled'),
    { code: undefined, error: 'access_denied', error_description: 'User cancelled' },
  );
});
