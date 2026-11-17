import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api/auth.api';
import { useAuthStore } from '../stores/auth.store';
import { useNavigate } from 'react-router-dom';

export function useLogin() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: ({ username, password, rememberMe }: { username: string; password: string; rememberMe: boolean }) =>
      authApi.login(username, password, rememberMe),
    onSuccess: (data, vars) => {
      setAuth(data.accessToken, data.refreshToken, data.user, data.rememberMe ?? vars.rememberMe);
      navigate('/dashboard');
    },
  });
}

export function useLogout() {
  const { refreshToken, logout } = useAuthStore();
  const navigate = useNavigate();

  return () => {
    if (refreshToken) authApi.logout(refreshToken).catch(() => {});
    logout();
    navigate('/login');
  };
}
