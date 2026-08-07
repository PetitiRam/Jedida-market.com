// Mobile equivalent of frontend/src/api/client.js — same base URL
// convention, same 401-triggers-one-retry-with-refresh behavior, same
// backend endpoints (including the new POST /auth/google). Only the
// token storage backend differs (SecureStore instead of localStorage).

import axios from 'axios';
import Constants from 'expo-constants';
import { getAccessToken, getRefreshToken, setAccessToken, clearSession } from './secureStorage';

const API_URL =
  Constants.expoConfig?.extra?.apiUrl ||
  process.env.EXPO_PUBLIC_API_URL ||
  'https://api.jedidamarketplace.com/api';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
          await setAccessToken(data.accessToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        } catch {
          await clearSession();
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
