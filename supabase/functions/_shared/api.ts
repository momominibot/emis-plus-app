// Health Points API for the EMIS+ app.
//
// The app sends the customer's own Customer Account API access token. We
// never trust a customer ID from the client: Shopify resolves the token to a
// customer, and that ID keys every read and write. No Admin token is used.
//
//   GET  /loyalty/me        -> membership, balance, history, referral code
//   POST /loyalty/referral  -> { code } claim a friend's code (new customers only)

import { idFrom } from './parse.ts';
import type { LoyaltyDb } from './types.ts';

export interface ApiConfig {
  db: LoyaltyDb;
  /** Customer Account GraphQL endpoint from /.well-known/customer-account-api. */
  customerApiUrl: string;
  /** Browser origins allowed to call the API (native apps send no Origin). */
  allowedOrigins: string[];
  fetch?: typeof fetch;
  log?: (event: Record<string, unknown>) => void;
}

type Customer = { customerId: string; hasOrders: boolean | null };

class UpstreamError extends Error {}

const CUSTOMER_QUERY = 'query LoyaltyCustomer { customer { id } }';
const CUSTOMER_WITH_ORDERS_QUERY = 'query LoyaltyCustomerOrders { customer { id orders(first: 1) { nodes { id } } } }';

/** Asks Shopify who owns the token. null means the token is not valid. */
export async function resolveCustomer(
  token: string,
  cfg: ApiConfig,
  opts: { withOrders: boolean; origin: string | null },
): Promise<Customer | null> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: token,
    'User-Agent': 'EMIS+ loyalty service',
  };
  // Tokens issued to the web client are bound to its JavaScript origin.
  if (opts.origin) headers.Origin = opts.origin;
  let res: Response;
  try {
    res = await (cfg.fetch ?? fetch)(cfg.customerApiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: opts.withOrders ? CUSTOMER_WITH_ORDERS_QUERY : CUSTOMER_QUERY }),
    });
  } catch (err) {
    throw new UpstreamError(err instanceof Error ? err.message : 'network error');
  }
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new UpstreamError('Customer Account API HTTP ' + res.status);
  let body: { data?: { customer?: { id?: unknown; orders?: { nodes?: unknown[] } } | null }; errors?: { extensions?: { code?: string } }[] };
  try {
    body = await res.json();
  } catch {
    throw new UpstreamError('Customer Account API returned invalid JSON');
  }
  if (body.errors?.length) {
    const codes = body.errors.map((e) => e.extensions?.code);
    if (codes.some((c) => c === 'UNAUTHENTICATED' || c === 'ACCESS_DENIED' || c === 'FORBIDDEN')) return null;
    throw new UpstreamError('Customer Account API error ' + codes.join(','));
  }
  const customer = body.data?.customer;
  if (!customer) return null;
  let customerId: string;
  try {
    customerId = idFrom(customer.id, 'Customer');
  } catch {
    throw new UpstreamError('Customer Account API returned an unexpected customer id');
  }
  const nodes = customer.orders?.nodes;
  return { customerId, hasOrders: opts.withOrders ? !Array.isArray(nodes) || nodes.length > 0 : null };
}

function corsHeaders(origin: string | null, cfg: ApiConfig): Record<string, string> {
  if (!origin || !cfg.allowedOrigins.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
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
  if (!token || token.length > 4096 || /\s/.test(token)) return reply(401, { error: 'sign_in_required' });

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
    const customer = await resolveCustomer(token, cfg, { withOrders: route === 'referral', origin });
    if (!customer) return reply(401, { error: 'sign_in_required' });

    if (route === 'me') {
      return reply(200, { member: await cfg.db.getMember(customer.customerId) });
    }
    const result = await cfg.db.claimReferral(customer.customerId, code, customer.hasOrders === true);
    return reply(result.outcome === 'pending' ? 200 : 422, { outcome: result.outcome });
  } catch (err) {
    const upstream = err instanceof UpstreamError;
    cfg.log?.({ level: 'error', route, upstream, error: err instanceof Error ? err.message : String(err) });
    return reply(upstream ? 502 : 500, { error: upstream ? 'shopify_unavailable' : 'server_error' });
  }
}
