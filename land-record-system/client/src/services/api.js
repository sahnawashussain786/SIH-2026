import axios from 'axios';

// Local dev: Vite proxies /api → localhost:5000.
// Production (Vercel): set VITE_API_URL to the deployed API base, e.g.
// https://bhoomi-ai-api.vercel.app/api — uploads/documents flow through it.
export const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({ baseURL: API_BASE, timeout: 120000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('lrs_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('lrs_token');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const errMsg = (err) => {
  if (!err.response) {
    return 'Cannot reach the API server. Check your connection (or the deployed API URL in VITE_API_URL) and try again.';
  }
  return err.response.data?.message || err.message || 'Something went wrong';
};
