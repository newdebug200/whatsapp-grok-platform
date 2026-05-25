import React, { useState, useEffect } from 'react';
import BotConfig from './BotConfig';
import FAQManager from './FAQManager';
import Settings from './Settings';
import AdminPanel from './AdminPanel';
import FlagJournal from './FlagJournal';
import QuickReplyManager from './QuickReplyManager';
import './SettingsHub.css';

const TABS = [
  {
    key: 'config', label: 'Bot Config',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M12 2a2 2 0 012 2 2 2 0 01-2 2 2 2 0 01-2-2 2 2 0 012-2m0 5c.55 0 1 .45 1 1h1a3 3 0 013 3v1a1 1 0 011 1v3a1 1 0 01-1 1v1a3 3 0 01-3 3H9a3 3 0 01-3-3v-1a1 1 0 01-1-1v-3a1 1 0 011-1v-1a3 3 0 013-3h1c0-.55.45-1 1-1zm-3 4a1 1 0 00-1 1v5a1 1 0 001 1h6a1 1 0 001-1v-5a1 1 0 00-1-1H9zm1.5 2a1 1 0 110 2 1 1 0 010-2zm3 0a1 1 0 110 2 1 1 0 010-2zm-4 3h5l-.5 1h-4l-.5-1z"/></svg>
  },
  {
    key: 'faq', label: 'FAQ',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
  },
  {
    key: 'templates', label: 'Templates',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M13 9h-2V7h2m0 10h-2v-6h2m-1-9A10 10 0 002 12a10 10 0 0010 10 10 10 0 0010-10A10 10 0 0012 2z"/></svg>
  },
  {
    key: 'journal', label: 'Journal',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 13h8v1H8v-1zm0 3h8v1H8v-1zm0-6h5v1H8v-1z"/></svg>
  },
  {
    key: 'account', label: 'Compte',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M12 15.5A3.5 3.5 0 018.5 12 3.5 3.5 0 0112 8.5a3.5 3.5 0 013.5 3.5 3.5 3.5 0 01-3.5 3.5m7.43-2.92c.04-.3.07-.62.07-.95s-.03-.66-.07-1l2.16-1.65c.19-.15.24-.42.12-.64l-2.05-3.55c-.12-.22-.39-.3-.61-.22l-2.55 1.03c-.52-.4-1.08-.73-1.7-.98l-.38-2.71C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.71c-.62.25-1.18.58-1.7.98L4.88 5.08c-.22-.08-.49 0-.61.22L2.22 8.85c-.13.22-.07.49.12.64l2.16 1.65c-.04.34-.07.67-.07 1s.03.65.07.97l-2.16 1.66c-.19.15-.24.42-.12.64l2.05 3.55c.12.22.39.3.61.22l2.55-1.02c.52.4 1.08.73 1.7.98l.38 2.71c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.71c.62-.25 1.18-.58 1.7-.98l2.55 1.02c.22.08.49 0 .61-.22l2.05-3.55c.12-.22.07-.49-.12-.64l-2.16-1.66z"/></svg>
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

  const tabs = [...TABS, ...(account?.role === 'admin' ? [ADMIN_TAB] : [])];

  return (
    <div className="sh-wrapper">
      <div className="sh-tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`sh-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span className="sh-tab-icon">{t.icon}</span>
            <span className="sh-tab-label">{t.label}</span>
          </button>
        ))}
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
        {tab === 'journal' && <FlagJournal />}
        {tab === 'account' && <Settings />}
        {tab === 'admin' && account?.role === 'admin' && <AdminPanel />}
      </div>
    </div>
  );
}
