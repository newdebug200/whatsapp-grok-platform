import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../App';
import './Settings.css';

export default function Settings() {
  const { account, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('botora-notif-sound') !== 'off');
  const [notifEnabled, setNotifEnabled] = useState(Notification.permission === 'granted');
  const [notifPermission, setNotifPermission] = useState(Notification.permission);

  useEffect(() => {
    localStorage.setItem('botora-notif-sound', soundEnabled ? 'on' : 'off');
    window.dispatchEvent(new CustomEvent('botora-sound-change', { detail: soundEnabled }));
  }, [soundEnabled]);

  const requestNotifPermission = async () => {
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    setNotifEnabled(perm === 'granted');
  };

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  return (
    <div className="settings-panel">
      <div className="settings-header">Paramètres</div>

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>
          Apparence
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <span className="settings-row-label">Thème</span>
            <span className="settings-row-desc">{theme === 'dark' ? 'Mode sombre activé' : 'Mode clair activé'}</span>
          </div>
          <div className="theme-toggle-wrap">
            <button
              className={`theme-option ${theme === 'light' ? 'active' : ''}`}
              onClick={() => setTheme('light')}
              title="Thème clair"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .38-.39.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.38.39-1.02 0-1.41l-1.06-1.06zm1.06-12.37l-1.06 1.06c-.39.39-.39 1.03 0 1.41.39.39 1.03.39 1.41 0l1.06-1.06c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0zM7.05 18.36l-1.06 1.06c-.39.39-.39 1.03 0 1.41.39.39 1.03.39 1.41 0l1.06-1.06c.39-.39.39-1.03 0-1.41-.38-.39-1.02-.39-1.41 0z"/></svg>
              Clair
            </button>
            <button
              className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
              title="Thème sombre"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>
              Sombre
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
          Notifications
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <span className="settings-row-label">Son de notification</span>
            <span className="settings-row-desc">Joue un son à chaque message reçu</span>
          </div>
          <button
            className={`toggle-pill ${soundEnabled ? 'on' : 'off'}`}
            onClick={() => setSoundEnabled(v => !v)}
          >
            <span className="toggle-pill-knob" />
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <span className="settings-row-label">Notifications navigateur</span>
            <span className="settings-row-desc">
              {notifPermission === 'granted' ? 'Activées — alertes même onglet fermé' :
               notifPermission === 'denied' ? 'Bloquées par le navigateur' :
               'Non demandées'}
            </span>
          </div>
          {notifPermission === 'granted' ? (
            <span className="settings-badge active">Activé</span>
          ) : notifPermission === 'denied' ? (
            <span className="settings-badge denied">Bloqué</span>
          ) : (
            <button className="settings-action-btn" onClick={requestNotifPermission}>Autoriser</button>
          )}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          Bot IA
        </div>
        <div className="settings-row settings-row-info-only">
          <div className="settings-row-info">
            <span className="settings-row-label">Délai de regroupement</span>
            <span className="settings-row-desc">Le bot attend 5 minutes après le dernier message avant de répondre, pour regrouper les messages fragmentés</span>
          </div>
          <span className="settings-badge">5 min</span>
        </div>
        <div className="settings-row settings-row-info-only">
          <div className="settings-row-info">
            <span className="settings-row-label">Prise en main humaine</span>
            <span className="settings-row-desc">Envoyer un message manuellement met automatiquement l'IA en pause pour ce contact</span>
          </div>
          <span className="settings-badge active">Auto</span>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          Compte
        </div>
        <div className="settings-account-card">
          <div className="settings-account-avatar">
            {account?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="settings-account-info">
            <div className="settings-account-name">{account?.name}</div>
            <div className="settings-account-email">{account?.email}</div>
          </div>
        </div>
        <button className="settings-logout-btn" onClick={logout}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
          Se déconnecter
        </button>
      </div>

      <div className="settings-version">Botora v1.0 — Plateforme WhatsApp IA</div>
    </div>
  );
}
