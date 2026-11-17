import axios from 'axios';
import { useAuthStore, getStoredRefreshToken } from '../stores/auth.store';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Thrown when the server rejected the refresh token — the session is really over. */
class SessionExpiredError extends Error {}

async function callRefresh(refreshToken: string): Promise<string> {
  try {
    const res = await axios.post('/api/auth/refresh', { refreshToken });
    useAuthStore.getState().setTokens(res.data.accessToken, res.data.refreshToken);
    return res.data.accessToken;
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 400 || status === 401) throw new SessionExpiredError();
    // Network error, backend restarting, rate limit, ... — keep the session
    throw err;
  }
}

async function doRefresh(): Promise<string> {
  // Another tab may already have rotated the refresh token — prefer the newest one
  const stored = getStoredRefreshToken();
  const current = useAuthStore.getState().refreshToken;
  const token = stored ?? current;
  if (!token) throw new SessionExpiredError();

  try {
    return await callRefresh(token);
  } catch (err) {
    // Lost a race with another tab: it rotated the token while our request was in flight
    const latest = getStoredRefreshToken();
    if (err instanceof SessionExpiredError && latest && latest !== token) {
      await useAuthStore.persist.rehydrate();
      const accessToken = useAuthStore.getState().accessToken;
      if (accessToken) return accessToken;
    }
    throw err;
  }
}

// Only one refresh at a time: concurrent 401s share the same refresh request.
// Without this, parallel requests each tried to rotate the same token and all
// but the first failed, logging the user out.
let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        // If a refresh already happened since this request was sent, just retry with the new token
        const sentWith = String(original.headers?.Authorization ?? '').replace(/^Bearer /, '');
        const current = useAuthStore.getState().accessToken;
        const accessToken = current && current !== sentWith ? current : await refreshAccessToken();
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch (refreshErr) {
        if (refreshErr instanceof SessionExpiredError) {
          useAuthStore.getState().logout();
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;
