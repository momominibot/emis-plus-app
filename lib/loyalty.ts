// Health Points client. Balances, history and referral codes live on the
// EMIS+ loyalty service (Supabase edge function `loyalty`), keyed to the
// Shopify customer ID. The app only presents the customer's own Shopify
// token; the service asks Shopify who that is. Points come only from paid
// orders, recorded by the service's Shopify webhook.

import { NotSignedInError } from './auth/customerApi';
import { expireSession, getAccessToken } from './auth/session';
import type { Membership } from './types';

const API_URL = (process.env.EXPO_PUBLIC_LOYALTY_API_URL || '').replace(/\/+$/, '');

/** False until the loyalty service is deployed and its URL is configured. */
export const LOYALTY_AVAILABLE = API_URL.length > 0;

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new NotSignedInError();
  const res = await fetch(API_URL + path, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: 'Bearer ' + token },
  });
  if (res.status === 401) {
    await expireSession();
    throw new NotSignedInError();
  }
  return res;
}

export async function fetchMembership(): Promise<Membership> {
  const res = await call('/me');
  if (!res.ok) throw new Error('Could not load your Health Points (HTTP ' + res.status + ')');
  const body = await res.json();
  return body.member as Membership;
}

const REFERRAL_MESSAGES: Record<string, string> = {
  pending: "Code saved. You and your friend each get 100 Health Points when your first order is paid.",
  invalid_code: "We couldn't find that code. Check the letters and try again.",
  self_referral: "That's your own code. Share it with a friend instead.",
  already_claimed: 'You have already used a referral code.',
  not_new_customer: 'Referral codes are for customers placing their first order.',
  mutual_referral: "You can't use the code of someone you referred.",
};

export async function claimReferral(code: string): Promise<{ ok: boolean; message: string }> {
  const res = await call('/referral', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim() }),
  });
  const body = await res.json().catch(() => ({}));
  const outcome = typeof body.outcome === 'string' ? body.outcome : '';
  if (res.ok && outcome === 'pending') return { ok: true, message: REFERRAL_MESSAGES.pending };
  return { ok: false, message: REFERRAL_MESSAGES[outcome] || 'Something went wrong. Please try again.' };
}
