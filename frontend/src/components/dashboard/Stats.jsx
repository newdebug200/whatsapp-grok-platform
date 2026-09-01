import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './Stats.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function Stats({ socket, onBack }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/stats`);
      setStats(res.data);
    } catch (err) {
      console.error('Erreur stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (socket) {
      socket.on('new-message', load);
      return () => socket.off('new-message', load);
    }
  }, [socket, load]);

  if (loading) {
    return (
      <div className="stats-loading">
        <div className="stats-spinner" />
        <span>Chargement des statistiques…</span>
      </div>
    );
  }

  if (!stats) return null;

  const p = stats.messages[period];
  const maxVal = stats.dailyMessages.reduce((m, d) => Math.max(m, d.sent + d.received, 1), 1);

  const rate = stats.aiResponseRate;
  const rateColor = rate >= 80 ? '#25d366' : rate >= 50 ? '#f6c90e' : '#e74c3c';

  const todayData = stats.dailyMessages[stats.dailyMessages.length - 1];

  return (
    <div className="stats-panel">
      <div className="stats-header">
        <div className="stats-title">Statistiques</div>
        <div className="stats-header-actions">
          {onBack && <button className="stats-back" onClick={onBack}>← Retour</button>}
          <button className="stats-refresh" onClick={load} title="Actualiser">
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-1.76-4.24l-2.24 2.24H22V4l-4.35 4.35z"/>
          </svg>
          </button>
        </div>
      </div>

      <div className="stats-cards">
        <div className="stat-card green">
          <div className="stat-card-icon">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
          </div>
          <div className="stat-card-value">{stats.totalContacts}</div>
          <div className="stat-card-label">Contacts</div>
        </div>

        <div className="stat-card blue">
          <div className="stat-card-icon">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          </div>
          <div className="stat-card-value">{todayData?.received ?? 0}</div>
          <div className="stat-card-label">Reçus aujourd'hui</div>
        </div>

        <div className="stat-card teal">
          <div className="stat-card-icon">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </div>
          <div className="stat-card-value">{todayData?.sent ?? 0}</div>
          <div className="stat-card-label">Envoyés aujourd'hui</div>
        </div>

        <div className="stat-card" style={{ '--accent': rateColor }}>
          <div className="stat-card-icon" style={{ color: rateColor }}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
          </div>
          <div className="stat-card-value" style={{ color: rateColor }}>{rate}%</div>
          <div className="stat-card-label">Taux réponse IA (7j)</div>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-section-header">
          <div className="stats-section-title">Activité</div>
          <div className="stats-period-tabs">
            {[
              { key: 'today', label: "Auj." },
              { key: 'week', label: '7 jours' },
              { key: 'month', label: '30 jours' }
            ].map(tab => (
              <button
                key={tab.key}
                className={`period-tab ${period === tab.key ? 'active' : ''}`}
                onClick={() => setPeriod(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="stats-summary-row">
          <div className="summary-item">
            <span className="summary-dot received-dot" />
            <span className="summary-label">Reçus</span>
            <span className="summary-val">{p.received}</span>
          </div>
          <div className="summary-item">
            <span className="summary-dot sent-dot" />
            <span className="summary-label">Envoyés</span>
            <span className="summary-val">{p.sent}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Total</span>
            <span className="summary-val">{p.sent + p.received}</span>
          </div>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-section-title">Messages par jour (7 derniers jours)</div>
        <div className="chart-bars">
          {stats.dailyMessages.map(day => {
            const total = day.sent + day.received;
            const sentH = total > 0 ? (day.sent / maxVal) * 100 : 0;
            const recvH = total > 0 ? (day.received / maxVal) * 100 : 0;
            const isToday = day.date === new Date().toISOString().slice(0, 10);
            return (
              <div key={day.date} className={`chart-col ${isToday ? 'today' : ''}`}>
                <div className="chart-bar-wrap">
                  <div className="chart-bar-stack">
                    <div className="chart-bar sent-bar" style={{ height: `${sentH}%` }} title={`${day.sent} envoyés`} />
                    <div className="chart-bar received-bar" style={{ height: `${recvH}%` }} title={`${day.received} reçus`} />
                  </div>
                </div>
                <div className="chart-label">{day.label}</div>
                {total > 0 && <div className="chart-total">{total}</div>}
              </div>
            );
          })}
        </div>
        <div className="chart-legend">
          <span><span className="legend-dot received-dot" />Reçus</span>
          <span><span className="legend-dot sent-dot" />Envoyés par l'IA</span>
        </div>
      </div>

      {stats.topContacts.length > 0 && (
        <div className="stats-section">
          <div className="stats-section-title">Contacts les plus actifs (7j)</div>
          <div className="top-contacts">
            {stats.topContacts.map((c, i) => {
              const label = c.name || c.phone_number;
              const initial = label.charAt(0).toUpperCase();
              const colors = ['#25d366', '#128c7e', '#075e54', '#34b7f1', '#667eea'];
              return (
                <div key={c.id} className="top-contact-row">
                  <span className="top-contact-rank">#{i + 1}</span>
                  <div className="top-contact-avatar" style={{ background: colors[i % colors.length] }}>
                    {initial}
                  </div>
                  <div className="top-contact-info">
                    <div className="top-contact-name">{label}</div>
                    {c.name && <div className="top-contact-phone">{c.phone_number}</div>}
                  </div>
                  <div className="top-contact-count">{c.count} msg</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
