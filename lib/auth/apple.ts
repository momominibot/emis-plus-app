// Android and web have no native Sign in with Apple; flows.ts uses the
// browser (signInWithOAuth) there instead.
import type { AppleCredential } from './flows';

export const appleSignIn: (() => Promise<AppleCredential>) | undefined = undefined;
