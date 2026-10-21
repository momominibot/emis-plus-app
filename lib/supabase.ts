// The app's Supabase client (Auth only; Health Points go through the
// `loyalty` edge function). Null until the project URL and publishable key
// are configured, which keeps sign-in hidden.
//
// Session storage: AsyncStorage on native, localStorage on web (AsyncStorage's
// web implementation). PKCE for every redirect-based sign-in.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import { AppState, Platform } from 'react-native';

export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

export const AUTH_AVAILABLE = SUPABASE_URL.startsWith('https://') && PUBLISHABLE_KEY.length > 0;

// supabase-js creates the PKCE verifier with crypto.getRandomValues, which
// React Native does not always provide.
if (Platform.OS !== 'web') {
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } };
  if (!g.crypto) g.crypto = {};
  if (typeof g.crypto.getRandomValues !== 'function') {
    g.crypto.getRandomValues = (array: Uint8Array) => Crypto.getRandomValues(array);
  }
}

export const supabase: SupabaseClient | null = AUTH_AVAILABLE
  ? createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // app/auth/callback exchanges the code itself
        flowType: 'pkce',
      },
    })
  : null;

// Native apps refresh tokens only while in the foreground (Supabase guidance).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
