// Which sign-in methods the app offers, and where Supabase sends people back.
//
// EXPO_PUBLIC_AUTH_PROVIDERS lists the methods switched on in the Supabase
// project (comma separated): email is always offered once Supabase is
// configured; apple and google only when listed, so the app never shows a
// button for a provider that is not set up yet.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { AUTH_AVAILABLE } from '../supabase';

export { AUTH_AVAILABLE };

const providers = (process.env.EXPO_PUBLIC_AUTH_PROVIDERS || '')
  .split(',')
  .map((p: string) => p.trim().toLowerCase());

export const APPLE_ENABLED = AUTH_AVAILABLE && providers.includes('apple');
export const GOOGLE_ENABLED = AUTH_AVAILABLE && providers.includes('google');

function webBase(): string {
  const base = (Constants.expoConfig?.experiments as { baseUrl?: string } | undefined)?.baseUrl || '';
  return window.location.origin + base.replace(/\/+$/, '');
}

/** Web: https://<site>/emis-plus-app/auth/callback. Native: emisapp://auth/callback. */
export function redirectUri(): string {
  return Platform.OS === 'web' ? webBase() + '/auth/callback' : Linking.createURL('auth/callback');
}
