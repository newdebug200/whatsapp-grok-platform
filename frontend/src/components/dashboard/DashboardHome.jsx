import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './DashboardHome.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const FUNNEL_COLORS = { prospect: '#8e9baa', interesse: '#f6c90e', client: '#25d366', fidele: '#9b59b6' };

// Admin landing page shown right after login, instead of dropping straight into
// the chat. Gives a "what needs attention" + "how are things going" overview,
// with quick links into the operational screens (chat, funnel, stats).
export default function DashboardHome({ account, waStatus, creditBalance, onGoTo, onSelectContact }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="dh-loading">
        <div className="dh-spinner" />
        <span>Chargement du tableau de bord…</span>
      </div>
    );
  }

  if (!data) return null;

  const totalFunnel = data.funnelCounts.reduce((s, c) => s + c.count, 0) || 1;
  const needsAttention = data.pausedContacts > 0 || data.sentimentAlerts > 0;

  return (
    <div className="dh-panel">
      <div className="dh-header">
        <div>
          <div className="dh-title">Tableau de bord</div>
          <div className="dh-subtitle">
            {account?.name ? `Bonjour ${account.name.split(' ')[0]}` : 'Bienvenue'} — voici l'état de votre compte
          </div>
        </div>
        <span className={`dh-wa-pill ${waStatus?.isConnected ? 'ok' : 'off'}`}>
          <span className="dh-wa-dot" />
          {waStatus?.isConnected ? 'WhatsApp connecté' : 'WhatsApp non connecté'}
        </span>
      </div>

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

        {/* Accès rapides */}
        <div className="dh-card">
          <div className="dh-card-title">Accès rapides</div>
          <div className="dh-quicklinks">
            <button className="dh-quicklink" onClick={() => onGoTo('chat')}>💬 Discussions</button>
            <button className="dh-quicklink" onClick={() => onGoTo('funnel')}>📊 Entonnoir</button>
            <button className="dh-quicklink" onClick={() => onGoTo('stats')}>📈 Statistiques</button>
            <button className="dh-quicklink" onClick={() => onGoTo('broadcast')}>📣 Campagnes</button>
            <button className="dh-quicklink" onClick={() => onGoTo('bot')}>⚙️ Réglages du bot</button>
            {account?.role === 'admin' && (
              <button className="dh-quicklink" onClick={() => onGoTo('admin')}>🛠️ Administration</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
