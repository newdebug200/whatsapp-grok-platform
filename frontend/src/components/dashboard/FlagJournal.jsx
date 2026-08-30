import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function FlagJournal({ noProfile = false, onGoConfig }) {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { if (!noProfile) loadFlags(); else setLoading(false); }, [noProfile]);

  if (noProfile) return (
    <div className="panel-content no-profile-panel">
      <div className="no-profile-panel-icon">◌</div>
      <span className="no-profile-panel-eyebrow">Journal indisponible</span>
      <h2>Aucun profil WhatsApp n’est encore configuré</h2>
      <p>Le journal des sujets sensibles apparaîtra après la connexion d’un profil WhatsApp.</p>
      {onGoConfig && <button className="no-profile-panel-action" onClick={onGoConfig}>Configurer WhatsApp</button>}
    </div>
  );

  const loadFlags = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/config/flags`);
      setFlags(res.data);
    } catch (err) {
      setError('Impossible de charger le journal.');
    } finally {
      setLoading(false);
    }
  };

  const filtered = flags.filter(f => {
    const q = search.toLowerCase();
    const name = (f.contact?.name || f.contact?.phone_number || '').toLowerCase();
    const kw = (f.keyword_matched || '').toLowerCase();
    const msg = (f.message_content || '').toLowerCase();
    return !q || name.includes(q) || kw.includes(q) || msg.includes(q);
  });

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return format(d, 'dd/MM/yyyy HH:mm', { locale: fr });
  };

  const getDisplayName = (f) => f.contact?.name || f.contact?.phone_number || `#${f.contact_id}`;

  return (
    <div className="panel-content">
      <div className="panel-title">Journal — Sujets sensibles</div>
      <p style={{ color: 'var(--text-secondary, #888)', fontSize: '0.85rem', marginBottom: 16 }}>
        Historique des conversations interrompues automatiquement suite à la détection d'un mot-clé sensible.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Rechercher par contact, mot-clé ou message…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border, #e0e0e0)',
            fontSize: '0.9rem',
            background: 'var(--bg-secondary, #f5f5f5)',
            color: 'var(--text-primary, #111)'
          }}
        />
        <button
          onClick={loadFlags}
          title="Rafraîchir"
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border, #e0e0e0)',
            background: 'var(--bg-secondary, #f5f5f5)',
            cursor: 'pointer',
            fontSize: '1rem',
            color: 'var(--text-secondary, #888)'
          }}
        >
          ↺
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary, #888)' }}>
          Chargement…
        </div>
      )}

      {error && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: '10px 14px', marginBottom: 12, color: '#856404', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary, #888)' }}>
          {search ? 'Aucun résultat pour cette recherche.' : 'Aucune alerte enregistrée pour l\'instant.'}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(flag => (
            <div
              key={flag.id}
              style={{
                background: 'var(--bg-secondary, #f9f9f9)',
                border: '1px solid var(--border, #e5e5e5)',
                borderLeft: '4px solid #e74c3c',
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary, #111)' }}>
                  {getDisplayName(flag)}
                </span>
                {flag.contact?.sensitive_flagged && (
                  <span style={{
                    background: '#fdecea',
                    color: '#c0392b',
                    borderRadius: 20,
                    padding: '2px 8px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    letterSpacing: '0.02em'
                  }}>
                    🚨 En attente humain
                  </span>
                )}
                {flag.contact?.ia_paused && !flag.contact?.sensitive_flagged && (
                  <span style={{
                    background: '#eaf3ff',
                    color: '#2980b9',
                    borderRadius: 20,
                    padding: '2px 8px',
                    fontSize: '0.72rem',
                    fontWeight: 600
                  }}>
                    👤 Pris en main
                  </span>
                )}
                {!flag.contact?.ia_paused && (
                  <span style={{
                    background: '#eafbea',
                    color: '#27ae60',
                    borderRadius: 20,
                    padding: '2px 8px',
                    fontSize: '0.72rem',
                    fontWeight: 600
                  }}>
                    🤖 IA reprise
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-secondary, #999)' }}>
                  {formatDate(flag.flagged_at)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{
                  background: '#fdecea',
                  color: '#c0392b',
                  borderRadius: 6,
                  padding: '2px 8px',
                  fontSize: '0.8rem',
                  fontWeight: 600
                }}>
                  🔑 {flag.keyword_matched}
                </span>
              </div>
              <div style={{
                background: 'var(--bg-primary, #fff)',
                border: '1px solid var(--border, #e5e5e5)',
                borderRadius: 6,
                padding: '8px 10px',
                fontSize: '0.85rem',
                color: 'var(--text-primary, #333)',
                fontStyle: 'italic',
                lineHeight: 1.5
              }}>
                "{flag.message_content}"
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: 12, fontSize: '0.78rem', color: 'var(--text-secondary, #aaa)' }}>
          {filtered.length} alerte{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''}
          {search && ` (filtrées sur "${search}")`}
        </div>
      )}
    </div>
  );
}
