import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const TOKEN_KEY = 'botora_token';

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [token, setToken] = useState(() => {
    // Compatibilité : lire aussi l'ancien nom de clé si présent
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('sanrobot_token') || null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      axios.get(`${API_URL}/auth/me`)
        .then(res => setAccount(res.data))
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
    return a;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('sanrobot_token');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setAccount(null);
  };

  return (
    <AuthContext.Provider value={{ account, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
