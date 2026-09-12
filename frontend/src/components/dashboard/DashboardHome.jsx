import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './DashboardHome.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const avatarColors = ['#25d366', '#128c7e', '#075e54', '#34b7f1', '#667eea', '#e0ab00', '#fd79a8'];
const getColor = (id) => avatarColors[(id || 0) % avatarColors.length];

// Full-screen landing page shown right after login, instead of dropping
// straight into the chat. Gives a "what needs attention" + "how are things
// going" overview, with big section buttons to enter the rest of the app.
export default function DashboardHome({
  account, waStatus, creditBalance, isAdmin, campaignsEnabled, unreadCount, platformConfig = {},
  onGoTo, onSelectContact, onLogout,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const noProfile = !waStatus?.isConnected && waStatus?.status === 'not_initialized';

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/dashboard/overview`);
      setData(res.data);
    } catch (err) {
      console.error('Erreur dashboard overview:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const needsAttention = data && (data.pausedContacts > 0 || data.sentimentAlerts > 0);
  const maxDaily = data ? Math.max(1, ...data.dailyMessages.map(d => d.sent + d.received)) : 1;
  const featureEnabled = (key, fallback = true) => isAdmin || (platformConfig[key] === undefined ? fallback : platformConfig[key] !== 'false');
  const maintenanceEnabled = !isAdmin && platformConfig.maintenance_enabled === 'true';

  const sections = [
    ...(featureEnabled('whatsapp_discussions_enabled') ? [{ key: 'chat', label: 'Discussions', desc: 'Vos conversations WhatsApp', emoji: '💬', color: '#25d366', badge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : null }] : []),
    { key: 'subscriptions', label: 'Abonnements', desc: 'Voir les offres Botora', emoji: '◈', color: '#0aa37f' },
    { key: 'credits', label: 'Recharger les crédits', desc: 'Payer avec FedaPay', emoji: '₣', color: '#0aa37f' },
    { key: 'credit-usage', label: 'Utilisation des crédits', desc: 'Consulter votre consommation', emoji: '▤', color: '#087f72' },
    { key: 'api', label: 'Accès API', desc: 'Connecter vos applications', emoji: '⌘', color: '#667eea' },
    ...(featureEnabled('stats_enabled') ? [{ key: 'stats', label: 'Statistiques', desc: 'Volumes, réponses IA, tendances', emoji: '📈', color: '#34b7f1' }] : []),
    ...(featureEnabled('sentiments_enabled') ? [{ key: 'sentiments', label: 'Sentiments clients', desc: 'Alertes et messages à traiter', emoji: '💛', color: '#e47738', badge: data?.sentimentAlerts > 0 ? data.sentimentAlerts : null }] : []),
    ...(campaignsEnabled ? [{ key: 'broadcast', label: 'Campagnes', desc: 'Diffusions groupées', emoji: '📣', color: '#f39c12' }] : []),
    ...(featureEnabled('ia_enabled_global') ? [{ key: 'bot', label: 'Bot & WhatsApp', desc: 'Configuration IA, connexion, FAQ', emoji: '⚙️', color: '#128c7e' }] : []),
    { key: 'settings', label: 'Paramètres', desc: 'Compte et préférences', emoji: '🔧', color: '#8e9baa' },
    ...(isAdmin ? [{ key: 'admin', label: 'Administration', desc: 'Gestion de la plateforme', emoji: '🛠️', color: '#9b59b6' }] : []),
  ];

  const settingsSections = [
    ...(featureEnabled('ia_enabled_global') ? [{ key: 'settings-config', tab: 'config', label: 'Réglages du bot', desc: 'IA, comportement et connexion WhatsApp', emoji: '🤖', color: '#128c7e' }] : []),
    ...(featureEnabled('faq_enabled') ? [{ key: 'settings-faq', tab: 'faq', label: 'FAQ', desc: 'Questions et réponses automatiques', emoji: '❓', color: '#667eea' }] : []),
    ...(featureEnabled('quick_replies_enabled') ? [{ key: 'settings-templates', tab: 'templates', label: 'Réponses rapides', desc: 'Messages prêts à envoyer', emoji: '💬', color: '#34b7f1' }] : []),
    { key: 'settings-tags', tab: 'tags', label: 'Tags', desc: 'Organiser et segmenter vos contacts', emoji: '🏷️', color: '#f39c12' },
    { key: 'settings-keywordReplies', tab: 'keywordReplies', label: 'Réponses automatiques', desc: 'Répondre selon un mot-clé', emoji: '↪', color: '#0aa37f' },
    ...(featureEnabled('sensitive_keywords_enabled') ? [{ key: 'settings-journal', tab: 'journal', label: 'Alertes', desc: 'Journal des alertes et sentiments', emoji: '🔔', color: '#e74c3c' }] : []),
    { key: 'settings-storage', tab: 'storage', label: 'Données & stockage', desc: 'Libérer l’espace local', emoji: '🧹', color: '#e47738' },
    { key: 'settings-account', tab: 'account', label: 'Mon compte', desc: 'Profil, sécurité et préférences', emoji: '👤', color: '#8e9baa' },
  ];

  const quickSections = sections.filter(section => ['chat', 'bot', 'subscriptions', 'credits', 'api'].includes(section.key));

  return (
    <div className="dh-panel">
      <div className="dh-header">
        <div className="dh-brand">
          <img src="/icons/icon-192.png" alt="Botora" className="dh-logo" />
          <span className="dh-brand-name">Botora</span>
        </div>
        <div className="dh-header-right">
          <span className={`dh-wa-pill ${waStatus?.isConnected ? 'ok' : 'off'}`}>
            <span className="dh-wa-dot" />
            {waStatus?.isConnected ? 'WhatsApp connecté' : 'WhatsApp non connecté'}
          </span>
          <div className="dh-account">
            <div className="dh-avatar">{account?.name?.charAt(0).toUpperCase()}</div>
            <div className="dh-account-info">
              <div className="dh-account-name">{account?.name}</div>
              {creditBalance !== null && (
                <div className={`dh-account-credits ${creditBalance <= 0 ? 'empty' : creditBalance < 10 ? 'low' : ''}`}>
                  {creditBalance.toFixed(2)} crédits
                </div>
              )}
            </div>
          </div>
          <button className="dh-logout" onClick={onLogout} title="Déconnexion">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
          </button>
        </div>
      </div>

      {maintenanceEnabled && <div className="dh-maintenance-banner"><strong>Mode maintenance</strong><span>Certaines fonctionnalités sont temporairement indisponibles. L’administrateur vous informera dès leur réactivation.</span></div>}

      <div className="dh-greeting">
        {account?.name ? `Bonjour ${account.name.split(' ')[0]} 👋` : 'Bienvenue'} — voici l'état de votre compte
      </div>

      {loading ? (
        <div className="dh-loading">
          <div className="dh-spinner" />
          <span>Chargement…</span>
        </div>
      ) : !data ? (
        <div className="dh-empty-overview">
          {noProfile
            ? "Connectez un numéro WhatsApp pour voir vos statistiques ici."
            : "Impossible de charger l'aperçu pour le moment."}
        </div>
      ) : (
        <div className="dh-overview-soft">
          <div className="dh-status-card">
            <div>
              <span className="dh-status-eyebrow">Vue d’ensemble</span>
              <h2>{needsAttention ? 'Quelques éléments demandent votre attention' : 'Tout est sous contrôle'}</h2>
              <p>{needsAttention ? `${data.sentimentAlerts + data.pausedContacts} élément(s) à consulter dans vos conversations.` : 'Votre espace Botora fonctionne normalement.'}</p>
            </div>
            {needsAttention && <button className="dh-status-action" onClick={() => onGoTo('chat')}>Voir les discussions</button>}
          </div>
          <div className="dh-kpis dh-kpis-soft">
            <div className="dh-kpi"><div className="dh-kpi-value">{data.totalContacts}</div><div className="dh-kpi-label">Contacts</div></div>
            <div className="dh-kpi"><div className="dh-kpi-value">{data.today.received + data.today.sent}</div><div className="dh-kpi-label">Messages aujourd’hui</div></div>
            {creditBalance !== null && <button className={`dh-kpi ${creditBalance <= 0 ? 'danger' : creditBalance < 10 ? 'warn' : ''}`} onClick={() => onGoTo('credits')}><div className="dh-kpi-value">{creditBalance.toFixed(2)}</div><div className="dh-kpi-label">Crédits disponibles</div></button>}
          </div>
        </div>
      )}

      {/* Accès essentiels */}
      <div className="dh-sections-heading">
        <div>
          <div className="dh-sections-title">Accès essentiels</div>
          <div className="dh-sections-subtitle">Les actions principales de votre espace, au même endroit.</div>
        </div>
        <span className="dh-sections-count">{quickSections.length} accès</span>
      </div>
      <div className="dh-sections-grid">
        {quickSections.map(s => (
          <button key={s.key} className="dh-section-card" onClick={() => onGoTo(s.key)} style={{ '--dh-card-color': s.color }}>
            <span className="dh-section-icon-wrap"><span className="dh-section-emoji">{s.emoji}</span></span>
            <span className="dh-section-label">{s.label}{s.badge && <span className="dh-section-badge">{s.badge}</span>}</span>
            <span className="dh-section-desc">{s.desc}</span>
            <span className="dh-section-open">Ouvrir <span aria-hidden="true">→</span></span>
          </button>
        ))}
      </div>

      <div className="dh-info-heading"><div><div className="dh-sections-title">Découvrir Botora</div><div className="dh-sections-subtitle">Comprenez la plateforme et démarrez sereinement.</div></div><span className="dh-settings-pill">Guides</span></div>
      <div className="dh-info-grid">
        <button className="dh-info-card" onClick={() => onGoTo('about')}><span className="dh-info-icon">✦</span><span><strong>À propos</strong><small>L’esprit et la mission de Botora</small></span><span className="dh-settings-arrow">→</span></button>
        <button className="dh-info-card" onClick={() => onGoTo('how-it-works')}><span className="dh-info-icon">?</span><span><strong>Comment ça marche ?</strong><small>Le guide en quatre étapes</small></span><span className="dh-settings-arrow">→</span></button>
      </div>
    </div>
  );
}
