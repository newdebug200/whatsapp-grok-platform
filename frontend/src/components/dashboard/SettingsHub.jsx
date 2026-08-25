import React, { useState, useEffect } from 'react';
import BotConfig from './BotConfig';
import FAQManager from './FAQManager';
import Settings from './Settings';
import AdminPanel from './AdminPanel';
import FlagJournal from './FlagJournal';
import StorageManager from './StorageManager';
import QuickReplyManager from './QuickReplyManager';
import TagManager from './TagManager';
import './SettingsHub.css';

const BOT_TABS = [
  {
    key: 'config', label: 'Réglages bot',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M12 2a2 2 0 012 2 2 2 0 01-2 2 2 2 0 01-2-2 2 2 0 012-2m0 5c.55 0 1 .45 1 1h1a3 3 0 013 3v1a1 1 0 011 1v3a1 1 0 01-1 1v1a3 3 0 01-3 3H9a3 3 0 01-3-3v-1a1 1 0 01-1-1v-3a1 1 0 011-1v-1a3 3 0 013-3h1c0-.55.45-1 1-1zm-3 4a1 1 0 00-1 1v5a1 1 0 001 1h6a1 1 0 001-1v-5a1 1 0 00-1-1H9zm1.5 2a1 1 0 110 2 1 1 0 010-2zm3 0a1 1 0 110 2 1 1 0 010-2zm-4 3h5l-.5 1h-4l-.5-1z"/></svg>
  },
  {
    key: 'faq', label: 'FAQ',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
  },
  {
    key: 'templates', label: 'Réponses rapides',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>
  },
  {
    key: 'tags', label: 'Tags',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>
  },
  {
    key: 'journal', label: 'Alertes',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
  },
  {
    key: 'storage', label: 'Données & stockage',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M4 4h16a2 2 0 0 1 2 2v2c0 1.1-1.8 2-4 2H6c-2.2 0-4-.9-4-2V6a2 2 0 0 1 2-2zm0 8h16a2 2 0 0 1 2 2v2c0 1.1-1.8 2-4 2H6c-2.2 0-4-.9-4-2v-2a2 2 0 0 1 2-2zm2-5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm0 8a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>
  },
];
// Note: "Prospects" (the funnel/entonnoir) used to live here as a sub-tab under
// Bot & WhatsApp. It's now a top-level sidebar item (see Dashboard.jsx) for
// better visibility, since it's a sales/follow-up tool, not a bot config screen.

const ACCOUNT_TABS = [
  {
    key: 'account', label: 'Mon compte',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
  },
];

const ADMIN_TAB = {
  key: 'admin', label: 'Admin',
  icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4c1.4 0 2.8 1.1 2.8 2.5v.5h.7c.4 0 .5.1.5.5v4c0 .4-.1.5-.5.5H8.5c-.4 0-.5-.1-.5-.5v-4c0-.4.1-.5.5-.5h.7v-.5C9.2 6.1 10.6 5 12 5zm0 1.2c-.8 0-1.3.6-1.3 1.3v.5h2.6v-.5c0-.7-.5-1.3-1.3-1.3zm0 4.1c-.6 0-1 .4-1 1s.4 1 1 1 1-.4 1-1-.4-1-1-1z"/></svg>
};

export default function SettingsHub({ waStatus, onConnectWhatsApp, onLogoutWhatsApp, activeProfile, account, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'config');

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const accountTabs = [...ACCOUNT_TABS, ...(account?.role === 'admin' ? [ADMIN_TAB] : [])];

  const renderTab = (t) => (
    <button
      key={t.key}
      className={`sh-tab ${tab === t.key ? 'active' : ''}`}
      onClick={() => setTab(t.key)}
      title={t.label}
    >
      <span className="sh-tab-icon">{t.icon}</span>
      <span className="sh-tab-label">{t.label}</span>
    </button>
  );

  return (
    <div className="sh-wrapper">
      <div className="sh-tabs">
        {BOT_TABS.map(renderTab)}
        <div className="sh-tab-separator" />
        {accountTabs.map(renderTab)}
      </div>
      <div className="sh-content">
        {tab === 'config' && (
          <BotConfig
            waStatus={waStatus}
            onConnectWhatsApp={onConnectWhatsApp}
            onLogoutWhatsApp={onLogoutWhatsApp}
            activeProfile={activeProfile}
          />
        )}
        {tab === 'faq' && <FAQManager />}
        {tab === 'templates' && <QuickReplyManager />}
        {tab === 'tags' && <TagManager activeProfile={activeProfile} />}
        {tab === 'journal' && <FlagJournal />}
        {tab === 'storage' && <StorageManager />}
        {tab === 'account' && <Settings />}
        {tab === 'admin' && account?.role === 'admin' && <AdminPanel />}
      </div>
    </div>
  );
}
