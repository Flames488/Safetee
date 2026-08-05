import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, hasSession, setUnauthorizedHandler } from '../lib/api';

const AuthContext = createContext(null);

// 'loading' while we resolve whether a stored token still represents a real
// session; only once we're out of 'loading' can ProtectedRoute make a
// redirect decision without flashing the wrong screen.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('unauthenticated');
    });

    if (!hasSession()) {
      setStatus('unauthenticated');
      return;
    }
    api.getMe()
      .then((me) => {
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() => setStatus('unauthenticated'));
  }, []);

  const login = async (phone, password) => {
    await api.login(phone, password);
    const me = await api.getMe();
    setUser(me);
    setStatus('authenticated');
    return me;
  };

  const signup = async (payload) => {
    await api.signup(payload);
    const me = await api.getMe();
    setUser(me);
    setStatus('authenticated');
    return me;
  };

  const resetPassword = async (payload) => {
    await api.resetPassword(payload);
    const me = await api.getMe();
    setUser(me);
    setStatus('authenticated');
    return me;
  };

  const logout = () => {
    api.logout();
    setUser(null);
    setStatus('unauthenticated');
  };

  const value = useMemo(() => ({ user, status, login, signup, resetPassword, logout, setUser }), [user, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
