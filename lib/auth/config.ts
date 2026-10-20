// Shopify Customer Account API settings for EMIS+.
//
// The client IDs come from Shopify admin > Sales channels > Headless >
// EMIS+ app > Customer Account API settings (public client). They are not
// secrets. Sign-in stays hidden until a client ID is configured.

import { Platform } from 'react-native';
import Constants from 'expo-constants';

/** emis.asia's shop ID, from https://www.emis.asia/.well-known/openid-configuration */
export const SHOP_ID = '61337632846';
export const STOREFRONT_ORIGIN = 'https://www.emis.asia';

const CLIENT_ID_WEB = process.env.EXPO_PUBLIC_SHOPIFY_CA_CLIENT_ID_WEB || process.env.EXPO_PUBLIC_SHOPIFY_CA_CLIENT_ID || '';
const CLIENT_ID_NATIVE = process.env.EXPO_PUBLIC_SHOPIFY_CA_CLIENT_ID_NATIVE || process.env.EXPO_PUBLIC_SHOPIFY_CA_CLIENT_ID || '';

export const CLIENT_ID = Platform.OS === 'web' ? CLIENT_ID_WEB : CLIENT_ID_NATIVE;
export const SIGN_IN_AVAILABLE = CLIENT_ID.length > 0;

/** Shopify requires mobile callbacks on the scheme shop.<shop_id>.<anything> (also listed in app.json). */
export const NATIVE_REDIRECT_URI = `shop.${SHOP_ID}.app://auth/callback`;

function webBase(): string {
  const base = (Constants.expoConfig?.experiments as { baseUrl?: string } | undefined)?.baseUrl || '';
  return window.location.origin + base.replace(/\/+$/, '');
}

export function redirectUri(): string {
  return Platform.OS === 'web' ? webBase() + '/auth/callback' : NATIVE_REDIRECT_URI;
}

/** Where Shopify sends the browser after logging out (web only; must be a registered Logout URI). */
export function webLogoutRedirectUri(): string {
  return webBase() + '/account';
}

export interface Discovery {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  endSessionEndpoint: string;
  graphqlApi: string;
}

let discovery: Promise<Discovery> | null = null;

/** GET JSON with a 10 s limit on the whole request, body included. */
async function getJson(url: string): Promise<any> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10_000);
  try {
    const r = await fetch(url, { signal: abort.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Endpoints from Shopify's discovery documents (both send Access-Control-Allow-Origin: *). */
export function getDiscovery(): Promise<Discovery> {
  if (!discovery) {
    discovery = (async () => {
      const [oidc, api] = await Promise.all([
        getJson(STOREFRONT_ORIGIN + '/.well-known/openid-configuration'),
        getJson(STOREFRONT_ORIGIN + '/.well-known/customer-account-api'),
      ]);
      const d: Discovery = {
        issuer: oidc.issuer,
        authorizationEndpoint: oidc.authorization_endpoint,
        tokenEndpoint: oidc.token_endpoint,
        endSessionEndpoint: oidc.end_session_endpoint,
        graphqlApi: api.graphql_api,
      };
      for (const value of Object.values(d)) {
        if (typeof value !== 'string' || !value.startsWith('https://')) throw new Error('Unexpected discovery document');
      }
      return d;
    })().catch((err) => {
      discovery = null;
      throw new Error('Could not reach emis.asia sign-in. Check your connection and try again. (' + (err as Error).message + ')');
    });
  }
  return discovery;
}
