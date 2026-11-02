import React, { useState, useEffect, createContext, useContext } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import axios from 'axios';
import AuthPage from './components/auth/AuthPage';
import Dashboard from './components/dashboard/Dashboard';
import InstallPrompt from './components/pwa/InstallPrompt';
import './App.css';
import './theme-overrides.css';

export const ThemeContext = createContext({ theme: 'light', setTheme: () => {} });
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function useTheme() {
  return useContext(ThemeContext);
}

function AppContent() {
  const { account, loading } = useAuth();
  const { t } = useLanguage();
  const [theme, setTheme] = useState(() => localStorage.getItem('botora-theme') || 'light');
  const [centralStatus, setCentralStatus] = useState({ state: 'checking', message: t('Checking central server…') });

  useEffect(() => {
    let cancelled = false;
    const checkCentralHealth = async () => {
      try {
        const response = await axios.get(`${API_URL}/central-health`, { timeout: 10000 });
        if (cancelled) return;
        if (response.data?.ok) {
          setCentralStatus({ state: 'online', message: t('Central API connected.') });
        } else {
          setCentralStatus({ state: 'offline', message: t('The central server is unavailable. Please try again later.') });
        }
      } catch (error) {
        if (!cancelled) {
          setCentralStatus({
            state: 'offline',
            message: error.response?.data?.error || t('The central server is unavailable. Please try again later.')
          });
        }
      }
    };

    checkCentralHealth();
    const healthCheck = setInterval(checkCentralHealth, 30000);
    return () => {
      cancelled = true;
      clearInterval(healthCheck);
    };
  }, [t]);

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
      {centralStatus.state === 'offline' && <div className="central-offline-alert" role="alert">{centralStatus.message}</div>}
      {account ? <Dashboard /> : <AuthPage />}
      <InstallPrompt />
    </ThemeContext.Provider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </AuthProvider>
  );
}
