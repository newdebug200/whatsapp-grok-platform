import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthPage from './components/auth/AuthPage';
import Dashboard from './components/dashboard/Dashboard';
import InstallPrompt from './components/pwa/InstallPrompt';
import './App.css';

function AppContent() {
  const { account, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner"></div>
        <span>Botora</span>
      </div>
    );
  }

  return (
    <>
      {account ? <Dashboard /> : <AuthPage />}
      <InstallPrompt />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
