// Edge function: Health Points API for the EMIS+ app.
// Deploy with verify_jwt = false: the handler checks every caller's Supabase
// access token with Supabase Auth itself (getUser), which also tells it
// whether the user's email is confirmed.
//
// Secrets: LOYALTY_ALLOWED_ORIGINS (comma separated). SUPABASE_URL,
// SUPABASE_DB_URL and the API keys are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { handleLoyaltyRequest, type AuthUser } from '../_shared/api.ts';
import { createLoyaltyDb } from '../_shared/db.ts';

const db = createLoyaltyDb(Deno.env.get('SUPABASE_DB_URL') ?? '');
const allowedOrigins = (Deno.env.get('LOYALTY_ALLOWED_ORIGINS') ?? 'https://momominibot.github.io')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function publishableKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
    if (typeof keys.default === 'string') return keys.default;
  } catch {
    // fall back to the legacy key
  }
  return Deno.env.get('SUPABASE_ANON_KEY') ?? '';
}

const auth = createClient(Deno.env.get('SUPABASE_URL') ?? '', publishableKey(), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}).auth;

async function getUser(token: string): Promise<AuthUser | null> {
  const { data, error } = await auth.getUser(token);
  if (error) {
    // 401/403: the token is not valid. Anything else: Auth is having trouble.
    if (error.status === 401 || error.status === 403) return null;
    throw error;
  }
  const user = data.user;
  if (!user) return null;
  const providers = Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers.map(String) : [];
  const claims = tokenClaims(token);
  return {
    id: user.id,
    email: user.email ?? null,
    emailConfirmed: Boolean(user.email_confirmed_at),
    tokenEmail: typeof claims.email === 'string' ? claims.email : null,
    amr: Array.isArray(claims.amr)
      ? claims.amr.map((a: { method?: unknown; timestamp?: unknown }) => ({
          method: String(a?.method ?? ''),
          timestamp: Number(a?.timestamp ?? 0),
        }))
      : [],
    providers,
  };
}

/** Claims of a token Supabase Auth has just accepted (getUser checked it). */
function tokenClaims(token: string): { email?: unknown; amr?: unknown } {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
  } catch {
    return {};
  }
}

Deno.serve((req) =>
  handleLoyaltyRequest(req, {
    db,
    getUser,
    allowedOrigins,
    log: (event) => console.log(JSON.stringify(event)),
  })
);
