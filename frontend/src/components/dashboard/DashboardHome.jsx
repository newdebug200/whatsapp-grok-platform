import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './DashboardHome.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const FUNNEL_COLORS = { prospect: '#8e9baa', interesse: '#e0ab00', client: '#25d366', fidele: '#9b59b6' };
const avatarColors = ['#25d366', '#128c7e', '#075e54', '#34b7f1', '#667eea', '#e0ab00', '#fd79a8'];
const getColor = (id) => avatarColors[(id || 0) % avatarColors.length];

// Full-screen landing page shown right after login, instead of dropping
// straight into the chat. Gives a "what needs attention" + "how are things
// going" overview, with big section buttons to enter the rest of the app.
export default function DashboardHome({
  account, waStatus, creditBalance, isAdmin, campaignsEnabled, unreadCount,
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
  const totalFunnel = data ? (data.funnelCounts.reduce((s, c) => s + c.count, 0) || 1) : 1;
  const maxDaily = data ? Math.max(1, ...data.dailyMessages.map(d => d.sent + d.received)) : 1;

  const sections = [
    { key: 'chat', label: 'Discussions', desc: 'Vos conversations WhatsApp', emoji: '💬', color: '#25d366', badge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : null },
    { key: 'funnel', label: 'Entonnoir', desc: 'Suivi des prospects par étape', emoji: '📊', color: '#667eea' },
    { key: 'subscriptions', label: 'Abonnements', desc: 'Voir les offres Botora', emoji: '◈', color: '#0aa37f' },
    { key: 'stats', label: 'Statistiques', desc: 'Volumes, réponses IA, tendances', emoji: '📈', color: '#34b7f1' },
    { key: 'sentiments', label: 'Sentiments clients', desc: 'Alertes et messages à traiter', emoji: '💛', color: '#e47738', badge: data?.sentimentAlerts > 0 ? data.sentimentAlerts : null },
    ...(campaignsEnabled ? [{ key: 'broadcast', label: 'Campagnes', desc: 'Diffusions groupées', emoji: '📣', color: '#f39c12' }] : []),
    { key: 'bot', label: 'Bot & WhatsApp', desc: 'Configuration IA, connexion, FAQ', emoji: '⚙️', color: '#128c7e' },
    { key: 'settings', label: 'Paramètres', desc: 'Compte et préférences', emoji: '🔧', color: '#8e9baa' },
    ...(isAdmin ? [{ key: 'admin', label: 'Administration', desc: 'Gestion de la plateforme', emoji: '🛠️', color: '#9b59b6' }] : []),
  ];

  const settingsSections = [
    { key: 'settings-config', tab: 'config', label: 'Réglages du bot', desc: 'IA, comportement et connexion WhatsApp', emoji: '🤖', color: '#128c7e' },
    { key: 'settings-faq', tab: 'faq', label: 'FAQ', desc: 'Questions et réponses automatiques', emoji: '❓', color: '#667eea' },
    { key: 'settings-templates', tab: 'templates', label: 'Réponses rapides', desc: 'Messages prêts à envoyer', emoji: '💬', color: '#34b7f1' },
    { key: 'settings-tags', tab: 'tags', label: 'Tags', desc: 'Organiser et segmenter vos contacts', emoji: '🏷️', color: '#f39c12' },
    { key: 'settings-journal', tab: 'journal', label: 'Alertes', desc: 'Journal des alertes et sentiments', emoji: '🔔', color: '#e74c3c' },
    { key: 'settings-storage', tab: 'storage', label: 'Données & stockage', desc: 'Libérer l’espace local', emoji: '🧹', color: '#e47738' },
    { key: 'settings-account', tab: 'account', label: 'Mon compte', desc: 'Profil, sécurité et préférences', emoji: '👤', color: '#8e9baa' },
  ];

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
        <>
          {/* KPI row */}
          <div className="dh-kpis">
            <button className="dh-kpi" onClick={() => onGoTo('chat')}>
              <div className="dh-kpi-value">{data.unreadConversations}</div>
              <div className="dh-kpi-label">Conversations non lues</div>
            </button>
            <div className="dh-kpi">
              <div className="dh-kpi-value">{data.totalContacts}</div>
              <div className="dh-kpi-label">Contacts au total</div>
            </div>
            <div className="dh-kpi">
              <div className="dh-kpi-value">{data.today.received}</div>
              <div className="dh-kpi-label">Messages reçus aujourd'hui</div>
            </div>
            <div className="dh-kpi">
              <div className="dh-kpi-value">{data.today.sent}</div>
              <div className="dh-kpi-label">Réponses envoyées aujourd'hui</div>
            </div>
            {creditBalance !== null && (
              <div className={`dh-kpi ${creditBalance <= 0 ? 'danger' : creditBalance < 10 ? 'warn' : ''}`}>
                <div className="dh-kpi-value">{creditBalance.toFixed(2)}</div>
                <div className="dh-kpi-label">Crédits restants</div>
              </div>
            )}
          </div>

          <div className="dh-grid">
            {/* À traiter maintenant */}
            <div className="dh-card dh-card-attention">
              <div className="dh-card-title">
                À traiter maintenant
                {needsAttention && <span className="dh-badge">{data.sentimentAlerts + data.pausedContacts}</span>}
              </div>
              {!needsAttention && (
                <div className="dh-empty">Rien d'urgent — tout est sous contrôle. ✅</div>
              )}
              {data.sentimentAlertsList.length > 0 && (
                <div className="dh-attention-group">
                  <div className="dh-attention-label">⚠️ Sentiment négatif détecté</div>
                  {data.sentimentAlertsList.map(m => (
                    <button
                      key={m.id}
                      className="dh-attention-row"
                      onClick={() => onSelectContact ? onSelectContact(m.contact) : onGoTo('chat')}
                    >
                      <span className="dh-attention-name">{m.contact.name || m.contact.phone_number}</span>
                      <span className="dh-attention-msg">{(m.content || '').slice(0, 60)}</span>
                    </button>
                  ))}
                </div>
              )}
              {data.pausedContactsList.length > 0 && (
                <div className="dh-attention-group">
                  <div className="dh-attention-label">⏸️ IA en pause (intervention requise)</div>
                  {data.pausedContactsList.map(c => (
                    <button key={c.id} className="dh-attention-row" onClick={() => onSelectContact ? onSelectContact(c) : onGoTo('chat')}>
                      <span className="dh-attention-name">{c.name || c.phone_number}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Entonnoir résumé */}
            <div className="dh-card">
              <div className="dh-card-title">
                Entonnoir de contacts
                <button className="dh-link" onClick={() => onGoTo('funnel')}>Voir tout →</button>
              </div>
              <div className="dh-funnel-bar">
                {data.funnelCounts.map(c => (
                  <div
                    key={c.stage}
                    className="dh-funnel-seg"
                    style={{ width: `${(c.count / totalFunnel) * 100}%`, background: FUNNEL_COLORS[c.stage] }}
                    title={`${c.label}: ${c.count}`}
                  />
                ))}
              </div>
              <div className="dh-funnel-legend">
                {data.funnelCounts.map(c => (
                  <div key={c.stage} className="dh-funnel-legend-item">
                    <span className="dh-funnel-dot" style={{ background: FUNNEL_COLORS[c.stage] }} />
                    <span className="dh-funnel-legend-label">{c.label}</span>
                    <span className="dh-funnel-legend-count">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Activité de la semaine */}
            <div className="dh-card">
              <div className="dh-card-title">
                Activité de la semaine
                <button className="dh-link" onClick={() => onGoTo('stats')}>Voir tout →</button>
              </div>
              <div className="dh-sparkline">
                {data.dailyMessages.map(d => {
                  const total = d.sent + d.received;
                  const sentH = maxDaily ? (d.sent / maxDaily) * 100 : 0;
                  const recvH = maxDaily ? (d.received / maxDaily) * 100 : 0;
                  return (
                    <div key={d.date} className="dh-spark-col" title={`${d.label}: ${total} message${total === 1 ? '' : 's'}`}>
                      <div className="dh-spark-bars">
                        <div className="dh-spark-bar sent" style={{ height: `${sentH}%` }} />
                        <div className="dh-spark-bar recv" style={{ height: `${recvH}%` }} />
                      </div>
                      <div className="dh-spark-label">{d.label}</div>
                    </div>
                  );
                })}
              </div>
              <div className="dh-sparkline-legend">
                <span><span className="dh-funnel-dot" style={{ background: '#25d366' }} /> Envoyés</span>
                <span><span className="dh-funnel-dot" style={{ background: '#8e9baa' }} /> Reçus</span>
              </div>
            </div>

            {/* Contacts les plus actifs */}
            <div className="dh-card">
              <div className="dh-card-title">Contacts les plus actifs (7 jours)</div>
              {(!data.topContacts || data.topContacts.length === 0) ? (
                <div className="dh-empty">Pas encore assez d'activité cette semaine.</div>
              ) : (
                data.topContacts.map(c => (
                  <button key={c.id} className="dh-top-contact-row" onClick={() => onSelectContact ? onSelectContact(c) : onGoTo('chat')}>
                    <span className="dh-top-contact-avatar" style={{ background: getColor(c.id) }}>
                      {(c.name || c.phone_number || '?').charAt(0).toUpperCase()}
                    </span>
                    <span className="dh-top-contact-name">{c.name || c.phone_number}</span>
                    <span className="dh-top-contact-count">{c.count} msg</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Accès rapides à tous les espaces de Botora */}
      <div className="dh-sections-heading">
        <div>
          <div className="dh-sections-title">Votre espace Botora</div>
          <div className="dh-sections-subtitle">Accédez rapidement à chaque fonctionnalité de votre plateforme.</div>
        </div>
        <span className="dh-sections-count">{sections.length} espaces</span>
      </div>
      <div className="dh-sections-grid">
        {sections.map(s => (
          <button key={s.key} className="dh-section-card" onClick={() => onGoTo(s.key)} style={{ '--dh-card-color': s.color }}>
            <span className="dh-section-icon-wrap"><span className="dh-section-emoji">{s.emoji}</span></span>
            <span className="dh-section-label">{s.label}{s.badge && <span className="dh-section-badge">{s.badge}</span>}</span>
            <span className="dh-section-desc">{s.desc}</span>
            <span className="dh-section-open">Ouvrir <span aria-hidden="true">→</span></span>
          </button>
        ))}
      </div>

      <div className="dh-settings-heading">
        <div>
          <div className="dh-sections-title">Paramètres détaillés</div>
          <div className="dh-sections-subtitle">Chaque espace de configuration est accessible directement depuis cet accueil.</div>
        </div>
        <span className="dh-settings-pill">{settingsSections.length} réglages</span>
      </div>
      <div className="dh-settings-grid">
        {settingsSections.map(s => (
          <button key={s.key} className="dh-settings-card" onClick={() => onGoTo(s.key)} style={{ '--dh-card-color': s.color }}>
            <span className="dh-settings-icon">{s.emoji}</span>
            <span className="dh-settings-copy"><strong>{s.label}</strong><small>{s.desc}</small></span>
            <span className="dh-settings-arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}
