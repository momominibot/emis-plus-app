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
const listeners = new Set<(s: Session | null) => void>();

function emit() {
  for (const l of listeners) l(current);
}

export async function loadSession(): Promise<Session | null> {
  if (!loaded) {
    loaded = (async () => {
      if (!SIGN_IN_AVAILABLE) return;
      try {
        const [access, refresh, id, meta] = await Promise.all([
          authStorage.get(KEYS.access),
          authStorage.get(KEYS.refresh),
          authStorage.get(KEYS.id),
          authStorage.get(KEYS.meta),
        ]);
        if (access && id && meta) {
          const m = JSON.parse(meta);
          current = { accessToken: access, refreshToken: refresh, idToken: id, expiresAt: Number(m.expiresAt) || 0, customer: m.customer ?? null };
        }
      } catch {
        current = null;
      }
    })().finally(() => {
      ready = true;
    });
  }
  await loaded;
  return current;
}

async function persist(next: Session | null) {
  current = next;
  if (next) {
    await Promise.all([
      authStorage.set(KEYS.access, next.accessToken),
      next.refreshToken ? authStorage.set(KEYS.refresh, next.refreshToken) : authStorage.remove(KEYS.refresh),
      authStorage.set(KEYS.id, next.idToken),
      authStorage.set(KEYS.meta, JSON.stringify({ expiresAt: next.expiresAt, customer: next.customer })),
    ]);
  } else {
    await Promise.all([KEYS.access, KEYS.refresh, KEYS.id, KEYS.meta].map((k) => authStorage.remove(k)));
  }
  emit();
}

class TokenError extends Error {
  constructor(public status: number, public code: string | undefined) {
    super('Token request failed (' + status + (code ? ' ' + code : '') + ')');
  }
}

type TokenResponse = { access_token: string; expires_in: number; id_token?: string; refresh_token?: string };

async function tokenRequest(endpoint: string, fields: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody(fields),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.access_token !== 'string' || typeof data.expires_in !== 'number') {
    throw new TokenError(res.status, data.error);
  }
  return data;
}

/** Starts sign-in. On web the page navigates away and this never resolves to a result. */
export async function signIn(): Promise<SignInResult | null> {
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
  const raw = await authStorage.get(KEYS.pending);
  await authStorage.remove(KEYS.pending); // one use only
  let pending: PendingSignIn | null = null;
  try {
    pending = raw ? JSON.parse(raw) : null;
  } catch {
    pending = null;
  }
  try {
    const d = await getDiscovery();
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
    await persist(session);
    completedState = params.state || null;
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof TokenError ? 'Sign-in failed. Please try again.' : (err as Error).message };
  }
}

let refreshing: Promise<Session | null> | null = null;

async function refresh(s: Session): Promise<Session | null> {
  if (!s.refreshToken) {
    await persist(null);
    return null;
  }
  try {
    const d = await getDiscovery();
    const t = await tokenRequest(d.tokenEndpoint, { grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: s.refreshToken });
    const next: Session = {
      ...s,
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? s.refreshToken,
      idToken: t.id_token ?? s.idToken,
      expiresAt: Date.now() + t.expires_in * 1000,
    };
    await persist(next);
    return next;
  } catch (err) {
    if (err instanceof TokenError && err.status >= 400 && err.status < 500) {
      await persist(null); // refresh token rejected: signed out
      return null;
    }
    throw err; // offline: keep the session, the caller shows an error
  }
}

/** A valid access token, refreshed if it expires within a minute; null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  const s = await loadSession();
  if (!s) return null;
  if (s.expiresAt - Date.now() > 60_000) return s.accessToken;
  if (!refreshing) refreshing = refresh(s).finally(() => (refreshing = null));
  const next = await refreshing;
  return next?.accessToken ?? null;
}

/** Called when Shopify rejects our token: drop it so the UI asks to sign in again. */
export async function expireSession(): Promise<void> {
  if (current) await persist(null);
}

export async function signOut(): Promise<void> {
  const s = await loadSession();
  await persist(null);
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
