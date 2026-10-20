// Native token storage: iOS Keychain / Android Keystore via SecureStore.
// Each value is stored under its own key to stay well under SecureStore's
// per-item size guidance.
import * as SecureStore from 'expo-secure-store';

export const authStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
