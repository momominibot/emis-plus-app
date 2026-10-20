// EMIS+ sign-in with the customer's emis.asia account (Shopify Customer
// Account API, public client, PKCE). Native opens Shopify's login in an
// in-app browser session; web does a full-page redirect and finishes on
// /auth/callback. Only the customer's own tokens are stored on the device.

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { authStorage } from './storage';
import { CLIENT_ID, SIGN_IN_AVAILABLE, getDiscovery, redirectUri, webLogoutRedirectUri } from './config';
import { fetchCustomerSummary } from './customerApi';
import {
  base64ToBase64Url,
  buildAuthorizeUrl,
  bytesToBase64Url,
  checkIdToken,
  checkRedirect,
  decodeJwtPayload,
  formBody,
  parseRedirect,
  type PendingSignIn,
  type RedirectParams,
} from './pkce';

const KEYS = {
  access: 'emis.auth.access',
  refresh: 'emis.auth.refresh',
  id: 'emis.auth.id',
  meta: 'emis.auth.meta',
  pending: 'emis.auth.pending',
};

export interface CustomerSummary {
  id: string;
  firstName: string | null;
  email: string | null;
}

export interface Session {
  accessToken: string;
  refreshToken: string | null;
  idToken: string;
  expiresAt: number;
  customer: CustomerSummary | null;
}

export type SignInResult = { ok: true } | { ok: false; message: string };

let current: Session | null = null;
let loaded: Promise<void> | null = null;
let ready = false;
// Bumped on every sign-in, sign-out and session change. Async work (refresh,
// sign-in completion) only commits if the generation it started under is
// still current, so a late response can never restore a signed-out account
// or overwrite a different one.
let generation = 0;
const listeners = new Set<(s: Session | null) => void>();

function emit() {
  for (const l of listeners) l(current);
}

async function readStored(): Promise<Session | null> {
  try {
    const [access, refresh, id, meta] = await Promise.all([
      authStorage.get(KEYS.access),
      authStorage.get(KEYS.refresh),
      authStorage.get(KEYS.id),
      authStorage.get(KEYS.meta),
    ]);
    if (!access || !id || !meta) return null;
    const m = JSON.parse(meta);
    return { accessToken: access, refreshToken: refresh, idToken: id, expiresAt: Number(m.expiresAt) || 0, customer: m.customer ?? null };
  } catch {
    return null;
  }
}

export async function loadSession(): Promise<Session | null> {
  if (!loaded) {
    loaded = (async () => {
      if (!SIGN_IN_AVAILABLE) return;
      const gen = generation;
      const stored = await readStored();
      if (gen === generation) current = stored;
    })().finally(() => {
      ready = true;
    });
  }
  await loaded;
  return current;
}

// Storage writes run one after another in the order the state changed, so
// a sign-out can never be overtaken by an earlier, slower write.
let writes: Promise<void> = Promise.resolve();

function writeStored(next: Session | null): Promise<void> {
  writes = writes
    .catch(() => {})
    .then(async () => {
      if (next) {
        await authStorage.set(KEYS.access, next.accessToken);
        if (next.refreshToken) await authStorage.set(KEYS.refresh, next.refreshToken);
        else await authStorage.remove(KEYS.refresh);
        await authStorage.set(KEYS.id, next.idToken);
        await authStorage.set(KEYS.meta, JSON.stringify({ expiresAt: next.expiresAt, customer: next.customer }));
      } else {
        for (const k of [KEYS.meta, KEYS.access, KEYS.refresh, KEYS.id]) await authStorage.remove(k);
      }
    });
  return writes;
}

/** Replaces the session. With `ifGeneration`, only if nothing changed since that generation. */
async function commit(next: Session | null, ifGeneration?: number): Promise<boolean> {
  if (ifGeneration !== undefined && ifGeneration !== generation) return false;
  generation++;
  current = next;
  emit();
  await writeStored(next);
  return true;
}

/** Takes on a session another tab wrote, without writing it back. */
function adopt(stored: Session | null) {
  generation++;
  current = stored;
  emit();
}

/**
 * Web: one tab at a time may refresh or finish a sign-in (Web Locks API).
 * Sign-out and expiry never wait for it; instead every refresh re-reads
 * storage before writing, so it cannot write back an account another tab
 * just signed out of. Native has one JS context and needs no lock.
 */
function withAuthLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = Platform.OS === 'web' && typeof navigator !== 'undefined'
    ? (navigator as unknown as { locks?: { request(name: string, cb: () => Promise<T>): Promise<T> } }).locks
    : undefined;
  return locks ? locks.request('emis.auth', fn) : fn();
}

/** Which customer a session belongs to (Shopify customer ID, else the id_token subject). */
function accountOf(s: Session): string {
  if (s.customer?.id) return s.customer.id;
  try {
    const sub = decodeJwtPayload(s.idToken).sub;
    if (typeof sub === 'string' && sub) return 'sub:' + sub;
  } catch {
    // fall through
  }
  return 'id:' + s.idToken;
}

// Web: another tab signed in or out. Follow it instead of using stale tokens.
if (Platform.OS === 'web' && typeof window !== 'undefined' && SIGN_IN_AVAILABLE) {
  window.addEventListener('storage', (e) => {
    if (e.key !== null && !e.key.startsWith('emis.auth.')) return;
    if (e.key === KEYS.pending) return;
    generation++;
    const gen = generation;
    readStored().then((stored) => {
      if (gen !== generation) return;
      current = stored;
      emit();
    });
  });
}

class TokenError extends Error {
  constructor(public status: number, public code: string | undefined) {
    super('Token request failed (' + status + (code ? ' ' + code : '') + ')');
  }
}

type TokenResponse = { access_token: string; expires_in: number; id_token?: string; refresh_token?: string };

async function tokenRequest(endpoint: string, fields: Record<string, string>): Promise<TokenResponse> {
  // A stalled request must not hold the cross-tab lock forever.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody(fields),
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.access_token !== 'string' || typeof data.expires_in !== 'number') {
    throw new TokenError(res.status, data.error);
  }
  return data;
}

let signingIn: Promise<SignInResult | null> | null = null;

/**
 * Starts sign-in. On web the page navigates away and this never resolves to
 * a result. A second tap while one is open joins it instead of replacing the
 * pending PKCE state.
 */
export function signIn(): Promise<SignInResult | null> {
  if (!signingIn) signingIn = startSignIn().finally(() => (signingIn = null));
  return signingIn;
}

async function startSignIn(): Promise<SignInResult | null> {
  if (!SIGN_IN_AVAILABLE) return { ok: false, message: 'Sign-in is not available yet.' };
  try {
    const d = await getDiscovery();
    const verifier = bytesToBase64Url(Crypto.getRandomBytes(32));
    const challenge = base64ToBase64Url(
      await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 }),
    );
    const pending: PendingSignIn = {
      state: bytesToBase64Url(Crypto.getRandomBytes(24)),
      nonce: bytesToBase64Url(Crypto.getRandomBytes(24)),
      verifier,
      redirectUri: redirectUri(),
      clientId: CLIENT_ID,
      createdAt: Date.now(),
    };
    await authStorage.set(KEYS.pending, JSON.stringify(pending));
    const url = buildAuthorizeUrl({
      authorizationEndpoint: d.authorizationEndpoint,
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      state: pending.state,
      nonce: pending.nonce,
      codeChallenge: challenge,
    });
    if (Platform.OS === 'web') {
      window.location.assign(url);
      return null;
    }
    const result = await WebBrowser.openAuthSessionAsync(url, pending.redirectUri);
    if (result.type === 'success') return completeSignIn(parseRedirect(result.url));
    return null; // closed by the customer
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Sign-in failed. Please try again.' };
  }
}

const inflight = new Map<string, Promise<SignInResult>>();
let completedState: string | null = null;

/**
 * Finishes sign-in from the redirect. Safe to call twice for the same
 * redirect (Android delivers it to both the auth session and the router).
 */
export function completeSignIn(params: RedirectParams): Promise<SignInResult> {
  const key = params.state || '';
  if (key && key === completedState && current) return Promise.resolve({ ok: true });
  let run = inflight.get(key);
  if (!run) {
    run = finishSignIn(params).finally(() => inflight.delete(key));
    inflight.set(key, run);
  }
  return run;
}

async function finishSignIn(params: RedirectParams): Promise<SignInResult> {
  const gen = generation;
  const raw = await authStorage.get(KEYS.pending);
  let pending: PendingSignIn | null = null;
  try {
    pending = raw ? JSON.parse(raw) : null;
  } catch {
    pending = null;
  }
  try {
    const d = await getDiscovery();
    // One use only, and only by the redirect it belongs to (same state, same
    // issuer): a stray or forged callback must not destroy a sign-in that is
    // still in progress.
    if (pending && params.state === pending.state && (!params.iss || params.iss === d.issuer)) {
      await authStorage.remove(KEYS.pending);
    }
    const check = checkRedirect(params, pending, d.issuer, Date.now());
    if (!check.ok) return check;
    const p = pending as PendingSignIn;
    const t = await tokenRequest(d.tokenEndpoint, {
      grant_type: 'authorization_code',
      client_id: p.clientId,
      redirect_uri: p.redirectUri,
      code: check.code,
      code_verifier: p.verifier,
    });
    if (!t.id_token || !checkIdToken(decodeJwtPayload(t.id_token), { issuer: d.issuer, clientId: p.clientId, nonce: p.nonce, now: Date.now() })) {
      return { ok: false, message: 'Sign-in could not be verified. Please try again.' };
    }
    const session: Session = {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? null,
      idToken: t.id_token,
      expiresAt: Date.now() + t.expires_in * 1000,
      customer: await fetchCustomerSummary(d.graphqlApi, t.access_token).catch(() => null),
    };
    if (!(await withAuthLock(() => commit(session, gen)))) {
      return { ok: false, message: 'Sign-in was interrupted. Please try again.' };
    }
    completedState = params.state || null;
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof TokenError ? 'Sign-in failed. Please try again.' : (err as Error).message };
  }
}

let refreshing: Promise<void> | null = null;

// OAuth errors that mean the refresh token itself is no longer valid.
const DEAD_GRANT = new Set(['invalid_grant', 'invalid_client', 'unauthorized_client', 'unsupported_grant_type']);

async function refresh(s: Session): Promise<void> {
  await withAuthLock(async () => {
    if (Platform.OS === 'web') {
      // Another tab may have refreshed, signed out or signed in meanwhile.
      const stored = await readStored();
      if (!stored || stored.accessToken !== s.accessToken || stored.refreshToken !== s.refreshToken) {
        adopt(stored);
        return;
      }
    }
    if (current !== s) return; // changed in this tab while we waited
    const gen = generation;
    if (!s.refreshToken) {
      await commit(null, gen);
      return;
    }
    try {
      const d = await getDiscovery();
      const t = await tokenRequest(d.tokenEndpoint, { grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: s.refreshToken });
      // Signing out does not wait for this lock; if the stored session changed
      // while the request was out, keep that change instead of writing ours.
      if (Platform.OS === 'web' && !(await storedStill(s))) return;
      await commit({
        ...s,
        accessToken: t.access_token,
        refreshToken: t.refresh_token ?? s.refreshToken,
        idToken: t.id_token ?? s.idToken,
        expiresAt: Date.now() + t.expires_in * 1000,
      }, gen);
    } catch (err) {
      if (err instanceof TokenError && (err.status === 400 || err.status === 401) && DEAD_GRANT.has(err.code ?? '')) {
        if (Platform.OS === 'web' && !(await storedStill(s))) return;
        await commit(null, gen); // refresh token rejected: signed out
        return;
      }
      throw err; // offline or throttled: keep the session, the caller shows an error
    }
  });
}

/**
 * A valid access token for the account that is signed in when this is
 * called, refreshed if it expires within a minute. Null when signed out, or
 * when the account changed meanwhile: work started for one customer never
 * continues with another customer's token.
 */
export async function getAccessToken(): Promise<string | null> {
  const s = await loadSession();
  if (!s) return null;
  if (s.expiresAt - Date.now() > 60_000) return s.accessToken;
  if (!refreshing) refreshing = refresh(s).finally(() => (refreshing = null));
  await refreshing;
  const now = current as Session | null;
  return now && accountOf(now) === accountOf(s) && now.expiresAt - Date.now() > 60_000 ? now.accessToken : null;
}

/** Web: true if storage still holds exactly this session (no other tab changed it). */
async function storedStill(s: Session): Promise<boolean> {
  const stored = await readStored();
  if (stored && stored.accessToken === s.accessToken && stored.refreshToken === s.refreshToken) return true;
  adopt(stored);
  return false;
}

/** Called when Shopify rejects a token: sign out, unless the session has moved on since. */
export async function expireSession(rejectedToken: string): Promise<void> {
  if (!current || current.accessToken !== rejectedToken) return;
  if (Platform.OS === 'web' && !(await storedStill(current))) return; // another tab already moved on
  if (current && current.accessToken === rejectedToken) await commit(null);
}

/** Signs out at once, locally first; it never waits behind a refresh in progress. */
export async function signOut(): Promise<void> {
  const s = await loadSession();
  await commit(null);
  if (!s) return;
  try {
    const d = await getDiscovery();
    const url = d.endSessionEndpoint + '?id_token_hint=' + encodeURIComponent(s.idToken);
    if (Platform.OS === 'web') {
      window.location.assign(url + '&post_logout_redirect_uri=' + encodeURIComponent(webLogoutRedirectUri()));
      return;
    }
    await fetch(url); // mobile clients call logout as an API (200 OK)
  } catch {
    // Local sign-out already happened; Shopify's session ends on its own.
  }
}

export function useSession(): { session: Session | null; ready: boolean } {
  const [state, setState] = useState({ session: current, ready });
  useEffect(() => {
    let alive = true;
    const listener = (s: Session | null) => alive && setState({ session: s, ready: true });
    listeners.add(listener);
    loadSession().then((s) => alive && setState({ session: s, ready: true }));
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);
  return state;
}
