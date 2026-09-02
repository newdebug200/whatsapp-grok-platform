import React, { useState, useEffect } from 'react';
import BotConfig from './BotConfig';
import FAQManager from './FAQManager';
import Settings from './Settings';
import FlagJournal from './FlagJournal';
import StorageManager from './StorageManager';
import QuickReplyManager from './QuickReplyManager';
import KeywordAutoReplyManager from './KeywordAutoReplyManager';
import TagManager from './TagManager';
import './SettingsHub.css';
import { useLanguage } from '../../context/LanguageContext';
import './SettingsShared.css';

const BOT_TABS = [
  {
    key: 'config', label: 'Settings bot',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M12 2a2 2 0 012 2 2 2 0 01-2 2 2 2 0 01-2-2 2 2 0 012-2m0 5c.55 0 1 .45 1 1h1a3 3 0 013 3v1a1 1 0 011 1v3a1 1 0 01-1 1v1a3 3 0 01-3 3H9a3 3 0 01-3-3v-1a1 1 0 01-1-1v-3a1 1 0 011-1v-1a3 3 0 013-3h1c0-.55.45-1 1-1zm-3 4a1 1 0 00-1 1v5a1 1 0 001 1h6a1 1 0 001-1v-5a1 1 0 00-1-1H9zm1.5 2a1 1 0 110 2 1 1 0 010-2zm3 0a1 1 0 110 2 1 1 0 010-2zm-4 3h5l-.5 1h-4l-.5-1z"/></svg>
  },
  {
    key: 'faq', label: 'FAQ',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
  },
  {
    key: 'templates', label: 'Quick replies',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>
  },
  {
    key: 'keywordReplies', label: 'Automatic replies',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2zm3 5v2h10V9H7zm0 4v2h7v-2H7z"/></svg>
  },
  {
    key: 'tags', label: 'Tags',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>
  },
  {
    key: 'journal', label: 'Alerts',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
  },
  {
    key: 'storage', label: 'Data & storage',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M4 4h16a2 2 0 0 1 2 2v2c0 1.1-1.8 2-4 2H6c-2.2 0-4-.9-4-2V6a2 2 0 0 1 2-2zm0 8h16a2 2 0 0 1 2 2v2c0 1.1-1.8 2-4 2H6c-2.2 0-4-.9-4-2v-2a2 2 0 0 1 2-2zm2-5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm0 8a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>
  },
];
// L’Entonnoir de contacts est réservé au Centre de contrôle administrateur.

const ACCOUNT_TABS = [
  {
    key: 'account', label: 'My account',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
  },
];

export default function SettingsHub({ waStatus, onConnectWhatsApp, onResyncWhatsApp, onLogoutWhatsApp, activeProfile, account, initialTab, noProfile, onGoConfig, onBack, platformConfig = {} }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState(initialTab || 'config');

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const accountTabs = ACCOUNT_TABS;
  const featureEnabled = (key) => account?.role === 'admin' || platformConfig[key] !== 'false';
  const visibleBotTabs = BOT_TABS.filter(tab => ({ config: 'ia_enabled_global', faq: 'faq_enabled', templates: 'quick_replies_enabled', keywordReplies: null, journal: 'sensitive_keywords_enabled' }[tab.key] ? featureEnabled(({ config: 'ia_enabled_global', faq: 'faq_enabled', templates: 'quick_replies_enabled', journal: 'sensitive_keywords_enabled' }[tab.key])) : true));
  useEffect(() => {
    if (tab !== 'account' && !visibleBotTabs.some(item => item.key === tab)) setTab('account');
  }, [tab, visibleBotTabs]);

  const currentTab = [...visibleBotTabs, ...accountTabs].find(item => item.key === tab) || visibleBotTabs[0] || accountTabs[0];
  const getTabLabel = (item) => {
    if (!item) return 'Réglages';
    if (item.key === 'config') return 'Réglages Bot';
    if (item.key === 'keywordReplies') return 'Réponses automatiques';
    return item.label === 'FAQ' || item.label === 'Tags' ? item.label : t(item.label);
  };
  const pageDescriptions = {
    config: 'Configurez le bot, les options IA et la connexion WhatsApp.',
    faq: 'Gérez les questions et réponses utilisées par votre bot.',
    templates: 'Préparez des messages réutilisables pour vos conversations.',
    keywordReplies: 'Déclenchez des réponses automatiques selon les mots-clés reçus.',
    tags: 'Organisez vos contacts avec des étiquettes personnalisées.',
    journal: 'Consultez les alertes et les sujets sensibles détectés.',
    storage: 'Gérez les données locales et l’espace utilisé par votre profil.',
    account: 'Gérez votre profil, votre langue et vos préférences.'
  };

  const renderTab = (tabItem) => (
    <button
      key={tabItem.key}
      className={`sh-tab ${tab === tabItem.key ? 'active' : ''}`}
      onClick={() => setTab(tabItem.key)}
      title={tabItem.label === 'FAQ' || tabItem.label === 'Tags' ? tabItem.label : t(tabItem.label)}
    >
      <span className="sh-tab-icon">{tabItem.icon}</span>
      <span className="sh-tab-label">{tabItem.label === 'FAQ' || tabItem.label === 'Tags' ? tabItem.label : t(tabItem.label)}</span>
    </button>
  );

  return (
    <div className="sh-wrapper">
      <header className="sh-page-header">
        <div>
          <span className="sh-page-eyebrow">Botora / Réglages</span>
          <h1>{getTabLabel(currentTab)}</h1>
          <p>{pageDescriptions[tab]}</p>
        </div>
        {onBack && <button type="button" className="sh-page-back" onClick={onBack}>← Tableau de bord</button>}
      </header>
      <div className="sh-content">
        {tab === 'config' && (
          <BotConfig
            waStatus={waStatus}
            onConnectWhatsApp={onConnectWhatsApp}
            onResyncWhatsApp={onResyncWhatsApp}
            onLogoutWhatsApp={onLogoutWhatsApp}
            activeProfile={activeProfile}
          />
        )}
        {tab === 'faq' && <FAQManager />}
        {tab === 'templates' && <QuickReplyManager />}
        {tab === 'keywordReplies' && <KeywordAutoReplyManager activeProfile={activeProfile} />}
        {tab === 'tags' && <TagManager activeProfile={activeProfile} />}
        {tab === 'journal' && <FlagJournal noProfile={noProfile} onGoConfig={onGoConfig} />}
        {tab === 'storage' && <StorageManager isAdmin={account?.role === 'admin'} noProfile={noProfile} onGoConfig={onGoConfig} />}
        {tab === 'account' && <Settings />}

      </div>
    </div>
  );
}
