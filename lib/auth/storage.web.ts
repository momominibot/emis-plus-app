// Web token storage. The in-progress sign-in (PKCE verifier, state, nonce)
// lives in sessionStorage so it never outlives the tab; the signed-in
// session lives in localStorage so it survives a reload.

function area(key: string): Storage | null {
  try {
    return key.startsWith('emis.auth.pending') ? window.sessionStorage : window.localStorage;
  } catch {
    return null; // storage blocked (private mode, sandboxed frame)
  }
}

export const authStorage = {
  async get(key: string): Promise<string | null> {
    try {
      return area(key)?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    area(key)?.setItem(key, value);
  },
  async remove(key: string): Promise<void> {
    try {
      area(key)?.removeItem(key);
    } catch {
      // nothing stored
    }
  },
};
