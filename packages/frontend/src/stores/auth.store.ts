import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

interface UserInfo {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'viewer';
}

interface AuthStore {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserInfo | null;
  /** "Stay logged in": persist across browser restarts (localStorage) vs. this browser session only. */
  rememberMe: boolean;
  setAuth: (accessToken: string, refreshToken: string, user: UserInfo, rememberMe: boolean) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  isAdmin: () => boolean;
  canWrite: () => boolean;
}

const STORAGE_KEY = 'ts6-auth';

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

/**
 * Writes to localStorage when "Stay logged in" is enabled, otherwise to
 * sessionStorage (cleared when the browser is closed). Reads from whichever has data.
 */
const authStorage: StateStorage = {
  getItem: (name) =>
    safe(() => localStorage.getItem(name), null) ?? safe(() => sessionStorage.getItem(name), null),
  setItem: (name, value) => {
    const remember = safe(() => JSON.parse(value)?.state?.rememberMe !== false, true);
    const [target, other] = remember ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
    safe(() => target.setItem(name, value), undefined);
    safe(() => other.removeItem(name), undefined);
  },
  removeItem: (name) => {
    safe(() => localStorage.removeItem(name), undefined);
    safe(() => sessionStorage.removeItem(name), undefined);
  },
};

// M9: Tokens stored in web storage. This is an accepted tradeoff — no XSS vectors
// exist in the frontend (no dangerouslySetInnerHTML, no eval). If XSS is introduced,
// consider moving to httpOnly cookies or in-memory storage.
export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      rememberMe: true,
      setAuth: (accessToken, refreshToken, user, rememberMe) =>
        set({ accessToken, refreshToken, user, rememberMe }),
      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),
      logout: () =>
        set({ accessToken: null, refreshToken: null, user: null }),
      isAuthenticated: () => !!get().accessToken,
      isAdmin: () => get().user?.role === 'admin',
      canWrite: () => get().user?.role === 'admin',
    }),
    { name: STORAGE_KEY, storage: createJSONStorage(() => authStorage) },
  ),
);

/** Read the refresh token currently saved in storage (may be newer than in-memory state if another tab refreshed). */
export function getStoredRefreshToken(): string | null {
  const raw = authStorage.getItem(STORAGE_KEY) as string | null;
  return safe(() => (raw ? JSON.parse(raw)?.state?.refreshToken ?? null : null), null);
}

// Keep tabs in sync: when another tab refreshes tokens or logs out, pick that up
// instead of using a stale (already rotated) refresh token.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) useAuthStore.persist.rehydrate();
  });
}
