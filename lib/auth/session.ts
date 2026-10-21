// EMIS+ sign-in on Supabase Auth: 6-digit email code, Sign in with Apple
// and Google. The steps live in flows.ts; this file plugs in the platform
// pieces and exposes the signed-in user to screens.

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { appleSignIn } from './apple';
import { redirectUri } from './config';
import * as flows from './flows';

export type { FlowResult, RedirectParams } from './flows';

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
}

export class NotSignedInError extends Error {
  constructor() {
    super('Please sign in again.');
  }
}

function deps(): flows.FlowDeps {
  if (!supabase) throw new Error('Sign-in is not available yet.');
  return {
    auth: supabase.auth,
    platform: Platform.OS,
    redirectUri,
    appleSignIn,
    openAuthSession: (url, redirect) => WebBrowser.openAuthSessionAsync(url, redirect),
  };
}

async function run(step: () => Promise<flows.FlowResult>): Promise<flows.FlowResult> {
  try {
    return await step();
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Sign-in failed. Please try again.' };
  }
}

export const sendEmailCode = (email: string) => run(() => flows.sendEmailCode(deps(), email));
export const verifyEmailCode = (email: string, code: string) => run(() => flows.verifyEmailCode(deps(), email, code));
export const signInWithApple = () => run(() => flows.signInWithApple(deps()));
export const signInWithGoogle = () => run(() => flows.signInWithGoogle(deps()));
export const completeOAuthRedirect = (params: flows.RedirectParams) => run(() => flows.completeOAuthRedirect(deps(), params));

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

/** The current access token (kept fresh by supabase-js), or null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Called when the loyalty service rejects our token: sign out on this device. */
export async function expireSession(): Promise<void> {
  await supabase?.auth.signOut({ scope: 'local' });
}

function toUser(session: Session | null): SessionUser | null {
  const u = session?.user;
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name = [meta.given_name, meta.full_name, meta.name].find((v): v is string => typeof v === 'string' && v.trim() !== '');
  return { id: u.id, email: u.email ?? null, name: name ? name.trim().split(/\s+/)[0] : null };
}

export function useSession(): { user: SessionUser | null; ready: boolean } {
  const [state, setState] = useState<{ user: SessionUser | null; ready: boolean }>({ user: null, ready: !supabase });
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => alive && setState({ user: toUser(data.session), ready: true }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setState({ user: toUser(session), ready: true });
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return state;
}
