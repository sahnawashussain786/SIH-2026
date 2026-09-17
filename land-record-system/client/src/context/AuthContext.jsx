import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('lrs_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem('lrs_token'))
      .finally(() => setLoading(false));
  }, []);

  // Belt-and-braces: even if the idle timer misses it, a 401 from any API call
  // (e.g. an expired token) drops the local session immediately.
  useEffect(() => {
    const onForced = () => setUser(null);
    window.addEventListener('lrs:force-logout', onForced);
    return () => window.removeEventListener('lrs:force-logout', onForced);
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('lrs_token', res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('lrs_token');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
