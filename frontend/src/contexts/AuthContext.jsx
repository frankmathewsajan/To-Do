import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { api } from "../lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Rehydrate user from httpOnly cookie on app load.
  const loadMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  const signup = useCallback(async (email, password, name) => {
    const { data } = await api.post("/auth/signup", { email, password, name });
    setUser(data.user);
    return data;
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.requires_mfa) return { requires_mfa: true, mfa_token: data.mfa_token };
    setUser(data.user);
    return { requires_mfa: false, user: data.user };
  }, []);

  const verifyMfa = useCallback(async (mfa_token, otp) => {
    const { data } = await api.post("/auth/mfa/verify", { mfa_token, otp });
    setUser(data.user);
    return data;
  }, []);

  const googleSession = useCallback(async (session_id) => {
    const { data } = await api.post("/auth/google/session", { session_id });
    setUser(data.user);
    return data;
  }, []);

  const toggleMfa = useCallback(async (enabled) => {
    const { data } = await api.post("/auth/mfa/toggle", { enabled });
    setUser((u) => ({ ...u, mfa_enabled: data.mfa_enabled }));
  }, []);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore network errors */ }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signup, login, verifyMfa, googleSession, toggleMfa, logout }),
    [user, loading, signup, login, verifyMfa, googleSession, toggleMfa, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
