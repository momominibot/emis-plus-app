// EMIS+ sign-in steps on Supabase Auth, written against a small slice of the
// supabase-js auth client so they can be tested with a mock. No React
// Native or Expo imports here: lib/auth/session.ts supplies the platform
// pieces (Apple's native sheet, the in-app browser, the redirect URL).
//
// Methods (Supabase docs, Oct 2026):
//   * Email: signInWithOtp sends a 6-digit code (the project's Magic Link
//     email template must show {{ .Token }}), verifyOtp({ type: 'email' }).
//   * Apple on iOS: native Sign in with Apple, identity token passed to
//     signInWithIdToken({ provider: 'apple' }).
//   * Google everywhere, Apple on Android and web: signInWithOAuth (PKCE).
//     Native opens the in-app browser and exchanges the returned code; web
//     navigates away and app/auth/callback exchanges it on return.

type AuthError = { message: string; status?: number; code?: string } | null;

export interface AuthClientLike {
  signInWithOtp(args: { email: string; options?: { shouldCreateUser?: boolean } }): Promise<{ error: AuthError }>;
  verifyOtp(args: { email: string; token: string; type: 'email' }): Promise<{ data: { session: unknown | null }; error: AuthError }>;
  signInWithIdToken(args: { provider: 'apple' | 'google'; token: string; nonce?: string }): Promise<{ data: { session: unknown | null }; error: AuthError }>;
  signInWithOAuth(args: {
    provider: 'apple' | 'google';
    options?: { redirectTo?: string; skipBrowserRedirect?: boolean };
  }): Promise<{ data: { url: string | null }; error: AuthError }>;
  exchangeCodeForSession(code: string): Promise<{ data: { session: unknown | null }; error: AuthError }>;
  updateUser(attrs: { data: Record<string, unknown> }): Promise<{ error: AuthError }>;
}

export interface AppleCredential {
  identityToken: string | null;
  fullName?: { givenName?: string | null; middleName?: string | null; familyName?: string | null } | null;
}

export interface FlowDeps {
  auth: AuthClientLike;
  platform: 'ios' | 'android' | 'web' | string;
  /** Where Supabase sends the browser back to (registered in Supabase Auth > URL Configuration). */
  redirectUri: () => string;
  /** iOS only: Apple's native sheet. Throws { code: 'ERR_REQUEST_CANCELED' } when closed. */
  appleSignIn?: () => Promise<AppleCredential>;
  /** Native only: in-app browser that returns the redirect URL. */
  openAuthSession?: (url: string, redirectUri: string) => Promise<{ type: string; url?: string }>;
}

/** ok, a message to show, or null when there is nothing to say (cancelled, or the page is navigating away). */
export type FlowResult = { ok: true } | { ok: false; message: string } | null;

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

function explain(error: NonNullable<AuthError>, fallback: string): string {
  switch (error.code) {
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Please wait a minute before asking for another code.';
    case 'otp_expired':
      return 'That code is not right or has expired. Check the email or ask for a new code.';
    case 'email_address_invalid':
      return 'Please check the email address.';
    case 'signup_disabled':
    case 'otp_disabled':
    case 'provider_disabled':
      return 'This sign-in method is not available yet.';
  }
  if (error.status === 429) return 'Please wait a minute before trying again.';
  return fallback;
}

export async function sendEmailCode(deps: FlowDeps, rawEmail: string): Promise<FlowResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, message: 'Please enter a valid email address.' };
  const { error } = await deps.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) return { ok: false, message: explain(error, 'We could not send a code. Please try again.') };
  return { ok: true };
}

export async function verifyEmailCode(deps: FlowDeps, rawEmail: string, rawCode: string): Promise<FlowResult> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\s/g, '');
  if (!email) return { ok: false, message: 'Please enter a valid email address.' };
  if (!/^\d{6}$/.test(code)) return { ok: false, message: 'Enter the 6-digit code from the email.' };
  const { data, error } = await deps.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error || !data.session) {
    return { ok: false, message: explain(error ?? { message: 'no session' }, 'That code did not work. Please try again.') };
  }
  return { ok: true };
}

export async function signInWithApple(deps: FlowDeps): Promise<FlowResult> {
  if (deps.platform !== 'ios' || !deps.appleSignIn) return signInWithProvider(deps, 'apple');
  let credential: AppleCredential;
  try {
    credential = await deps.appleSignIn();
  } catch (err) {
    if ((err as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return null;
    return { ok: false, message: 'Sign in with Apple did not finish. Please try again.' };
  }
  if (!credential.identityToken) return { ok: false, message: 'Sign in with Apple did not finish. Please try again.' };
  const { data, error } = await deps.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
  if (error || !data.session) {
    return { ok: false, message: error ? explain(error, 'Sign in with Apple did not finish. Please try again.') : 'Sign in with Apple did not finish. Please try again.' };
  }
  // Apple shares the name only on the first sign-in; keep it (best effort).
  const n = credential.fullName;
  const parts = [n?.givenName, n?.middleName, n?.familyName].filter((p): p is string => !!p);
  if (parts.length) {
    await deps.auth
      .updateUser({ data: { full_name: parts.join(' '), given_name: n?.givenName ?? null, family_name: n?.familyName ?? null } })
      .catch(() => undefined);
  }
  return { ok: true };
}

export function signInWithGoogle(deps: FlowDeps): Promise<FlowResult> {
  return signInWithProvider(deps, 'google');
}

async function signInWithProvider(deps: FlowDeps, provider: 'apple' | 'google'): Promise<FlowResult> {
  const name = provider === 'apple' ? 'Apple' : 'Google';
  const redirectTo = deps.redirectUri();
  if (deps.platform === 'web') {
    // supabase-js stores the PKCE verifier and sends the browser to the provider.
    const { error } = await deps.auth.signInWithOAuth({ provider, options: { redirectTo } });
    return error ? { ok: false, message: explain(error, `Sign in with ${name} did not start. Please try again.`) } : null;
  }
  const { data, error } = await deps.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data.url || !deps.openAuthSession) {
    return { ok: false, message: error ? explain(error, `Sign in with ${name} did not start. Please try again.`) : `Sign in with ${name} did not start. Please try again.` };
  }
  const result = await deps.openAuthSession(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) return null; // closed by the customer
  return completeOAuthRedirect(deps, parseAuthRedirect(result.url));
}

export type RedirectParams = { code?: string; error?: string; error_description?: string };

/** Query (and fragment) parameters of the URL Supabase redirected back to. */
export function parseAuthRedirect(url: string): RedirectParams {
  const out: Record<string, string> = {};
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.split('?')[1] || '';
  for (const part of [query, hash]) {
    for (const pair of part.split('&')) {
      if (!pair) continue;
      const [k, v = ''] = pair.split('=');
      try {
        out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
      } catch {
        // ignore malformed pairs
      }
    }
  }
  return { code: out.code, error: out.error, error_description: out.error_description };
}

const exchanges = new Map<string, Promise<FlowResult>>();

/**
 * Finishes an OAuth sign-in from the redirect. Safe to call twice for the
 * same code (Android delivers the redirect to both the in-app browser and
 * the router): the second call joins the first.
 */
export function completeOAuthRedirect(deps: FlowDeps, params: RedirectParams): Promise<FlowResult> {
  if (params.error) {
    return Promise.resolve(
      params.error === 'access_denied' ? null : { ok: false, message: 'Sign-in did not finish. Please try again.' },
    );
  }
  const code = params.code;
  if (!code) return Promise.resolve({ ok: false, message: 'Sign-in did not finish. Please try again.' });
  let run = exchanges.get(code);
  if (!run) {
    run = deps.auth.exchangeCodeForSession(code).then(({ data, error }) =>
      error || !data.session
        ? { ok: false as const, message: 'This sign-in link has expired or was already used. Please try again.' }
        : { ok: true as const },
    );
    exchanges.set(code, run);
  }
  return run;
}
