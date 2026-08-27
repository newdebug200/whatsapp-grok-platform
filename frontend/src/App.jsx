import React, { useState, useEffect, createContext, useContext } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import axios from 'axios';
import AuthPage from './components/auth/AuthPage';
import Dashboard from './components/dashboard/Dashboard';
import InstallPrompt from './components/pwa/InstallPrompt';
import './App.css';

export const ThemeContext = createContext({ theme: 'light', setTheme: () => {} });
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function useTheme() {
  return useContext(ThemeContext);
}

function AppContent() {
  const { account, loading } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem('botora-theme') || 'light');
  const [centralStatus, setCentralStatus] = useState({ state: 'checking', message: 'Vérification du serveur central…' });

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_URL}/central-health`, { timeout: 10000 })
      .then(response => { if (!cancelled && response.data?.ok) setCentralStatus({ state: 'online', message: 'API centrale connectée.' }); else if (!cancelled) setCentralStatus({ state: 'offline', message: 'Le serveur central est indisponible. Réessayez plus tard.' }); })
      .catch(error => { if (!cancelled) setCentralStatus({ state: 'offline', message: error.response?.data?.error || 'Le serveur central est indisponible. Réessayez plus tard.' }); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('botora-theme', theme);
  }, [theme]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner"></div>
        <span>Botora</span>
      </div>
    );
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {centralStatus.state === 'offline' && <div role="alert" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, padding: '10px 16px', textAlign: 'center', background: '#fff1f2', color: '#b42318', borderBottom: '1px solid #fecdd3', fontSize: 14 }}>{centralStatus.message}</div>}
      {account ? <Dashboard /> : <AuthPage />}
      <InstallPrompt />
    </ThemeContext.Provider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
