import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const TOKEN_KEY = 'botora_token';
const PROFILE_KEY = 'botora_active_profile';

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [token, setToken] = useState(() => {
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('sanrobot_token') || null;
  });
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfileState] = useState(() => {
    try {
      const stored = localStorage.getItem(PROFILE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (_) {
      return null;
    }
  });

  const applyProfileHeader = (profile) => {
    if (profile?.id) {
      axios.defaults.headers.common['X-Profile-Id'] = profile.id;
    } else {
      delete axios.defaults.headers.common['X-Profile-Id'];
    }
  };

  useEffect(() => {
    applyProfileHeader(activeProfile);
  }, []);

  const selectProfile = useCallback((profile) => {
    setActiveProfileState(profile);
    if (profile) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      applyProfileHeader(profile);
    } else {
      localStorage.removeItem(PROFILE_KEY);
      delete axios.defaults.headers.common['X-Profile-Id'];
    }
  }, []);

  const loadProfiles = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/profiles`);
      const data = res.data;
      setProfiles(data);

      if (data.length > 0) {
        const current = activeProfile;
        const still = current ? data.find(p => p.id === current.id) : null;
        if (!still) {
          const connected = data.find(p => p.is_connected) || data[0];
          selectProfile(connected);
        } else {
          selectProfile(still);
        }
      } else {
        selectProfile(null);
      }

      return data;
    } catch (err) {
      console.error('Erreur chargement profils:', err.message);
      return [];
    }
  }, [activeProfile, selectProfile]);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      axios.get(`${API_URL}/auth/me`)
        .then(res => {
          setAccount(res.data);
          return loadProfiles();
        })
        .catch((err) => {
          console.error('Erreur vérification token:', err.message);
          logout();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await axios.post(`${API_URL}/auth/login`, { email, password });
    const { token: t, account: a } = res.data;
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.removeItem('sanrobot_token');
    axios.defaults.headers.common['Authorization'] = `Bearer ${t}`;
    setToken(t);
    setAccount(a);
    await loadProfiles();
    return a;
  };

  const register = async (email, password, name) => {
    const res = await axios.post(`${API_URL}/auth/register`, { email, password, name });
    const { token: t, account: a } = res.data;
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.removeItem('sanrobot_token');
    axios.defaults.headers.common['Authorization'] = `Bearer ${t}`;
    setToken(t);
    setAccount(a);
    await loadProfiles();
    return a;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('sanrobot_token');
    localStorage.removeItem(PROFILE_KEY);
    delete axios.defaults.headers.common['Authorization'];
    delete axios.defaults.headers.common['X-Profile-Id'];
    setToken(null);
    setAccount(null);
    setProfiles([]);
    setActiveProfileState(null);
  };

  const deleteAccount = async (password) => {
    const res = await axios.delete(`${API_URL}/auth/account`, { data: { password } });
    if (res.data.success) logout();
    return res.data;
  };

  return (
    <AuthContext.Provider value={{
      account, token, loading,
      profiles, activeProfile,
      login, register, logout, deleteAccount,
      selectProfile, loadProfiles
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
