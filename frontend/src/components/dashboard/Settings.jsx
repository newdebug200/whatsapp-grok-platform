import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../App';
import { useLanguage } from '../../context/LanguageContext';
import './Settings.css';

export default function Settings() {
  const { account, logout, deleteAccount } = useAuth();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [languageError, setLanguageError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('botora-notif-sound') !== 'off');
  const [notifEnabled, setNotifEnabled] = useState(Notification.permission === 'granted');
  const [notifPermission, setNotifPermission] = useState(Notification.permission);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    localStorage.setItem('botora-notif-sound', soundEnabled ? 'on' : 'off');
    window.dispatchEvent(new CustomEvent('botora-sound-change', { detail: soundEnabled }));
  }, [soundEnabled]);

  const requestNotifPermission = async () => {
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    setNotifEnabled(perm === 'granted');
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) { setDeleteError('Mot de passe requis'); return; }
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccount(deletePassword);
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Erreur lors de la suppression');
      setDeleting(false);
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">{t('Settings')}</div>

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>
          {t('Appearance')}
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
          <span className="settings-row-label">{t('Theme')}</span>
          <span className="settings-row-desc">{theme === 'dark' ? t('Dark mode enabled') : t('Light mode enabled')}</span>
          </div>
          <div className="theme-toggle-wrap">
            <button
              className={`theme-option ${theme === 'light' ? 'active' : ''}`}
              onClick={() => setTheme('light')}
              title={t('Light')}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .38-.39.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.38.39-1.02 0-1.41l-1.06-1.06zm1.06-12.37l-1.06 1.06c-.39.39-.39 1.03 0 1.41.39.39 1.03.39 1.41 0l1.06-1.06c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0zM7.05 18.36l-1.06 1.06c-.39.39-.39 1.03 0 1.41.39.39 1.03.39 1.41 0l1.06-1.06c.39-.39.39-1.03 0-1.41-.38-.39-1.02-.39-1.41 0z"/></svg>
              {t('Light')}
            </button>
            <button
              className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
              title={t('Dark')}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>
              {t('Dark')}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 17h-2v-2h2v2zm2-6.5c-.8.7-1.5 1.1-1.5 2.5h-2c0-2 1-2.8 2.1-3.7.6-.5.9-.9.9-1.6a1.5 1.5 0 0 0-3 0H9.5a3.5 3.5 0 0 1 7 0c0 1.2-.6 1.9-1.5 2.8z"/></svg>
          {t('Language')}
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <span className="settings-row-label">{t('Language')}</span>
            <span className="settings-row-desc">{t('Choose the platform language')}</span>
          </div>
          <select
            value={language}
            onChange={async (event) => {
              setLanguageError('');
              try { await setLanguage(event.target.value); }
              catch (_) { setLanguageError(language === 'fr' ? 'Impossible de sauvegarder la langue' : 'Unable to save language'); }
            }}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
            aria-label={t('Language')}
          >
            <option value="fr">{t('French')}</option>
            <option value="en">{t('English')}</option>
          </select>
        </div>
        {languageError && <div style={{ color: '#c0392b', fontSize: '0.8rem', marginTop: 6 }}>{languageError}</div>}
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 22c1.1 0 2-.9 2-2h-4c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5 0-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
          {t('Notifications')}
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <span className="settings-row-label">{t('Notification sound')}</span>
            <span className="settings-row-desc">{t('Play a sound for every received message')}</span>
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
            <span className="settings-row-label">{t('Browser notifications')}</span>
            <span className="settings-row-desc">
              {notifPermission === 'granted' ? t('Enabled — alerts even when tab is closed') :
               notifPermission === 'denied' ? t('Blocked by browser') :
               t('Not requested')}
            </span>
          </div>
          {notifPermission === 'granted' ? (
            <span className="settings-badge active">{t('Enabled')}</span>
          ) : notifPermission === 'denied' ? (
            <span className="settings-badge denied">{t('Blocked')}</span>
          ) : (
            <button className="settings-action-btn" onClick={requestNotifPermission}>{t('Allow')}</button>
          )}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          {t('AI bot')}
        </div>
        <div className="settings-row settings-row-info-only">
          <div className="settings-row-info">
            <span className="settings-row-label">Délai de regroupement</span>
            <span className="settings-row-desc">Configurable dans "Bot Config" — le bot attend avant de répondre pour regrouper les messages fragmentés</span>
          </div>
          <span className="settings-badge">Config</span>
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
          {t('Account')}
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
          {t('Sign out')}
        </button>
        <button
          className="settings-logout-btn"
          style={{ marginTop: 8, background: 'rgba(192,57,43,0.08)', color: '#c0392b', borderColor: 'rgba(192,57,43,0.25)' }}
          onClick={() => { setShowDeleteModal(true); setDeletePassword(''); setDeleteError(''); }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          {t('Delete account')}
        </button>
      </div>

      <div className="settings-version">Botora v1.0 — Plateforme WhatsApp IA</div>

      {showDeleteModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }} onClick={() => setShowDeleteModal(false)}>
          <div style={{
            background: 'var(--bg-secondary, #1e1e2e)', borderRadius: 14,
            padding: 28, width: 340, boxShadow: '0 8px 40px rgba(0,0,0,0.4)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 8, color: '#c0392b' }}>
              {t('Delete your account?')}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #888)', marginBottom: 16, lineHeight: 1.5 }}>
              {t('This action is irreversible.')} Tous vos profils WhatsApp, conversations, FAQs et configurations seront définitivement supprimés.
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #888)', marginBottom: 6 }}>
              {t('Confirm with your password')}
            </div>
            <input
              type="password"
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              placeholder="Votre mot de passe actuel"
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8,
                border: '1px solid var(--border, #333)', background: 'var(--bg, #111)',
                color: 'var(--text, #fff)', fontSize: '0.9rem', boxSizing: 'border-box'
              }}
              onKeyDown={e => e.key === 'Enter' && handleDeleteAccount()}
              autoFocus
            />
            {deleteError && (
              <div style={{ color: '#c0392b', fontSize: '0.82rem', marginTop: 6 }}>{deleteError}</div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                style={{
                  flex: 1, padding: '9px', borderRadius: 8, border: '1px solid var(--border, #333)',
                  background: 'none', color: 'var(--text, #fff)', cursor: 'pointer', fontSize: '0.88rem'
                }}
              >{t('Cancel')}</button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                style={{
                  flex: 1, padding: '9px', borderRadius: 8, border: 'none',
                  background: '#c0392b', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem',
                  opacity: deleting ? 0.7 : 1
                }}
              >{deleting ? t('Deleting...') : t('Delete permanently')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
