// Health Points API for the EMIS+ app.
//
// The app sends the user's Supabase Auth access token. We never trust an id
// or email from the client: Supabase Auth resolves the token to the user,
// and only a confirmed email is used to match Shopify orders.
//
//   GET  /loyalty/me        -> membership, balance, history, orders, referral code
//   POST /loyalty/referral  -> { code } claim a friend's code (new customers only)

import { normalizeEmail } from './parse.ts';
import type { LoyaltyDb, Member } from './types.ts';

export interface AuthUser {
  id: string;
  /** The user's email as Supabase Auth has it now (from getUser). */
  email: string | null;
  emailConfirmed: boolean;
  /** The email claim of the access token used for this request. */
  tokenEmail: string | null;
  /** How this session was signed in: the access token's amr entries (unix seconds). */
  amr: { method: string; timestamp: number }[];
  /** Identity providers linked to the user (app_metadata.providers: email, google, apple, ...). */
  providers: string[];
}

// Sign-in methods that prove the person read the mailbox at that moment.
const MAILBOX_METHODS = new Set(['otp', 'magiclink', 'email/signup', 'email_change', 'invite', 'recovery']);
// Addresses the identity provider itself runs, so its word is final.
const PROVIDER_DOMAINS: Record<string, string[]> = {
  google: ['gmail.com', 'googlemail.com'],
  apple: ['privaterelay.appleid.com'],
};

/**
 * When this session proved control of `email`, or null. A provider's
 * "verified" flag is not enough on its own: a Google account can keep an
 * address on another domain after that mailbox changes hands, and Supabase
 * links such a sign-in to whoever holds the address now. The database also
 * ignores proof older than an unconfirmed move of the address by Auth.
 */
export function mailboxProofAt(user: AuthUser, email: string): string | null {
  // A token issued for another address proves nothing about this one.
  if (normalizeEmail(user.tokenEmail) !== email) return null;
  const at = (entries: { timestamp: number }[]) => {
    const latest = Math.max(...entries.map((e) => e.timestamp).filter((t) => Number.isFinite(t) && t > 0));
    return Number.isFinite(latest) ? new Date(latest * 1000).toISOString() : null;
  };
  const mailbox = user.amr.filter((a) => MAILBOX_METHODS.has(a.method));
  if (mailbox.length > 0) return at(mailbox);
  const domain = email.split('@')[1] ?? '';
  if (user.providers.some((p) => (PROVIDER_DOMAINS[p] ?? []).includes(domain))) return at(user.amr);
  return null;
}

export interface ApiConfig {
  db: LoyaltyDb;
  /** The user behind a Supabase access token; null if the token is not valid. Throws if Auth is unreachable. */
  getUser: (accessToken: string) => Promise<AuthUser | null>;
  /** Browser origins allowed to call the API (native apps send no Origin). */
  allowedOrigins: string[];
  log?: (event: Record<string, unknown>) => void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function corsHeaders(origin: string | null, cfg: ApiConfig): Record<string, string> {
  if (!origin || !cfg.allowedOrigins.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export async function handleLoyaltyRequest(req: Request, cfg: ApiConfig): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, cfg);
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

  if (origin && !cors['Access-Control-Allow-Origin']) return reply(403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  const route = path.endsWith('/me') ? 'me' : path.endsWith('/referral') ? 'referral' : null;
  if (!route) return reply(404, { error: 'not_found' });
  if (route === 'me' && req.method !== 'GET') return reply(405, { error: 'method_not_allowed' });
  if (route === 'referral' && req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token || token.length > 8192 || /\s/.test(token)) return reply(401, { error: 'sign_in_required' });

  let code = '';
  if (route === 'referral') {
    const text = await req.text();
    if (text.length > 1024) return reply(413, { error: 'payload_too_large' });
    try {
      const parsed = JSON.parse(text);
      code = typeof parsed?.code === 'string' ? parsed.code : '';
    } catch {
      return reply(400, { error: 'invalid_json' });
    }
    if (!code.trim()) return reply(400, { error: 'code_required' });
  }

  try {
    let user: AuthUser | null;
    try {
      user = await cfg.getUser(token);
    } catch (err) {
      cfg.log?.({ level: 'error', route, upstream: 'auth', error: err instanceof Error ? err.message : String(err) });
      return reply(502, { error: 'auth_unavailable' });
    }
    if (!user || !UUID.test(user.id)) return reply(401, { error: 'sign_in_required' });
    const email = normalizeEmail(user.email);
    if (!email || !user.emailConfirmed) return reply(403, { error: 'email_not_confirmed' });
    const member: Member = { memberId: user.id.toLowerCase(), email, proofAt: mailboxProofAt(user, email) };

    if (route === 'me') {
      return reply(200, { member: await cfg.db.getMember(member) });
    }
    const result = await cfg.db.claimReferral(member, code);
    return reply(result.outcome === 'pending' ? 200 : 422, { outcome: result.outcome });
  } catch (err) {
    cfg.log?.({ level: 'error', route, error: err instanceof Error ? err.message : String(err) });
    return reply(500, { error: 'server_error' });
  }
}
