import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Funnel from './Funnel';
import './DashboardHome.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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

  const sections = [
    { key: 'chat', label: 'Discussions', desc: 'Vos conversations WhatsApp', emoji: '💬', badge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : null },
    { key: 'stats', label: 'Statistiques', desc: 'Volumes, réponses IA, tendances', emoji: '📈' },
    ...(campaignsEnabled ? [{ key: 'broadcast', label: 'Campagnes', desc: 'Diffusions groupées', emoji: '📣' }] : []),
    { key: 'bot', label: 'Bot & WhatsApp', desc: 'Configuration IA, connexion, FAQ', emoji: '⚙️' },
    { key: 'settings', label: 'Paramètres', desc: 'Compte et préférences', emoji: '🔧' },
    ...(isAdmin ? [{ key: 'admin', label: 'Administration', desc: 'Gestion de la plateforme', emoji: '🛠️' }] : []),
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

          <div className="dh-grid dh-grid-single">
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
          </div>
        </>
      )}

      {/* Entonnoir — full CRM board, embedded directly on the dashboard */}
      <div className="dh-funnel-section">
        <Funnel onSelectContact={(contact) => onSelectContact && onSelectContact(contact)} />
      </div>

      {/* Section buttons — the actual entry points into the app */}
      <div className="dh-sections-title">Accéder à</div>
      <div className="dh-sections-grid">
        {sections.map(s => (
          <button key={s.key} className="dh-section-card" onClick={() => onGoTo(s.key)}>
            <span className="dh-section-emoji">{s.emoji}</span>
            <span className="dh-section-label">
              {s.label}
              {s.badge && <span className="dh-section-badge">{s.badge}</span>}
            </span>
            <span className="dh-section-desc">{s.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
