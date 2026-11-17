import api from './client';
import { useAuthStore } from '../stores/auth.store';

export const authApi = {
  login: (username: string, password: string, rememberMe: boolean) =>
    api.post('/auth/login', { username, password, rememberMe }).then((r) => r.data),

  refresh: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }).then((r) => r.data),

  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refreshToken }),

  me: () => api.get('/auth/me').then((r) => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.put('/auth/password', {
      currentPassword,
      newPassword,
      // Keep this session alive; all other sessions are signed out
      refreshToken: useAuthStore.getState().refreshToken ?? undefined,
    }),
};
