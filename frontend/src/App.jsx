import React, { useState, useEffect, createContext, useContext } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthPage from './components/auth/AuthPage';
import Dashboard from './components/dashboard/Dashboard';
import InstallPrompt from './components/pwa/InstallPrompt';
import './App.css';

export const ThemeContext = createContext({ theme: 'light', setTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

function AppContent() {
  const { account, loading } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem('botora-theme') || 'light');

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
