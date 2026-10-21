// iOS: Apple's native Sign in with Apple sheet.
import * as AppleAuthentication from 'expo-apple-authentication';
import type { AppleCredential } from './flows';

export async function appleSignIn(): Promise<AppleCredential> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  return { identityToken: credential.identityToken, fullName: credential.fullName };
}
