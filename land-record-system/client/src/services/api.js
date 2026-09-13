import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

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
    return 'Cannot reach the API server (http://localhost:5000). Start it with "npm run dev:server" — or run everything with "npm run dev:all" — then try again.';
  }
  return err.response.data?.message || err.message || 'Something went wrong';
};
