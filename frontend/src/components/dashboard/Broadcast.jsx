import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './Broadcast.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const STATUS_INFO = {
  draft: { label: 'Brouillon', color: '#8e9baa' },
  running: { label: 'En cours', color: '#25d366' },
  paused: { label: 'En pause', color: '#f39c12' },
  completed: { label: 'Terminée', color: '#3498db' }
};

function IconMegaphone() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 3.94a9.58 9.58 0 0112.04 9.56c0 5.29-4.29 9.58-9.58 9.58-1.68 0-3.26-.43-4.63-1.19m-4.46-5.36A9.54 9.54 0 013.2 13.5C3.2 8.21 7.49 3.92 12.78 3.92"/>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 9l-3 3-3-3"/>
    </svg>
  );
}

export default function Broadcast({ socket, activeProfile }) {
  const [view, setView] = useState('list');
  const [campaigns, setCampaigns] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({});

  const [form, setForm] = useState({
    name: '',
    messages: [{ content: '' }],
    contactIds: []
  });
  const [contactSearch, setContactSearch] = useState('');
  const [selectAll, setSelectAll] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/broadcast/campaigns`);
      setCampaigns(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors du chargement des campagnes');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadContacts = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/messages/conversations`);
      setContacts(res.data);
    } catch (err) {
      console.error('Erreur chargement contacts:', err.message);
    }
  }, []);

  useEffect(() => {
    if (activeProfile?.id) {
      loadCampaigns();
      loadContacts();
    }
  }, [activeProfile, loadCampaigns, loadContacts]);

  useEffect(() => {
    if (!socket) return;
    const onProgress = (data) => {
      setProgress(prev => ({
        ...prev,
        [data.campaignId]: { done: data.done, total: data.total, completed: data.completed }
      }));
      if (data.completed) {
        setCampaigns(prev => prev.map(c =>
          c.id === data.campaignId ? { ...c, status: 'completed' } : c
        ));
      }
    };
    const onError = (data) => {
      setError(data.error || 'Erreur campagne');
      setCampaigns(prev => prev.map(c =>
        c.id === data.campaignId ? { ...c, status: 'draft' } : c
      ));
    };
    socket.on('campaign-progress', onProgress);
    socket.on('campaign-error', onError);
    return () => {
      socket.off('campaign-progress', onProgress);
      socket.off('campaign-error', onError);
    };
  }, [socket]);

  const filteredContacts = contacts.filter(c =>
    !contactSearch ||
    (c.name || '').toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.phone_number.includes(contactSearch)
  );

  const handleToggleContact = (id) => {
    setForm(prev => ({
      ...prev,
      contactIds: prev.contactIds.includes(id)
        ? prev.contactIds.filter(x => x !== id)
        : [...prev.contactIds, id]
    }));
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setForm(prev => ({ ...prev, contactIds: [] }));
      setSelectAll(false);
    } else {
      setForm(prev => ({ ...prev, contactIds: filteredContacts.map(c => c.id) }));
      setSelectAll(true);
    }
  };

  const handleAddMessage = () => {
    setForm(prev => ({ ...prev, messages: [...prev.messages, { content: '' }] }));
  };

  const handleRemoveMessage = (i) => {
    setForm(prev => ({ ...prev, messages: prev.messages.filter((_, j) => j !== i) }));
  };

  const handleMessageChange = (i, value) => {
    const msgs = [...form.messages];
    msgs[i] = { ...msgs[i], content: value };
    setForm(prev => ({ ...prev, messages: msgs }));
  };

  const handleCreateCampaign = async () => {
    if (!form.name.trim()) return setError('Donnez un nom à la campagne');
    if (form.messages.some(m => !m.content.trim())) return setError('Chaque message doit avoir un contenu');
    if (form.contactIds.length === 0) return setError('Sélectionnez au moins un contact');
    setSaving(true);
    setError('');
    try {
      const res = await axios.post(`${API_URL}/broadcast/campaigns`, {
        name: form.name.trim(),
        messages: form.messages.map((m, i) => ({ content: m.content, order_index: i, delay_after_seconds: 0 })),
        contact_ids: form.contactIds
      });
      setCampaigns(prev => [{ ...res.data, progress: { sent: 0, pending: form.contactIds.length, failed: 0, total: form.contactIds.length } }, ...prev]);
      setView('list');
      setForm({ name: '', messages: [{ content: '' }], contactIds: [] });
      setContactSearch('');
      setSelectAll(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  const handleStartCampaign = async (id, e) => {
    if (e) e.stopPropagation();
    setError('');
    try {
      await axios.post(`${API_URL}/broadcast/campaigns/${id}/start`);
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'running' } : c));
      if (detail?.id === id) setDetail(d => ({ ...d, status: 'running' }));
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur au démarrage');
    }
  };

  const handleStopCampaign = async (id, e) => {
    if (e) e.stopPropagation();
    setError('');
    try {
      await axios.post(`${API_URL}/broadcast/campaigns/${id}/stop`);
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'paused' } : c));
      if (detail?.id === id) setDetail(d => ({ ...d, status: 'paused' }));
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur mise en pause');
    }
  };

  const handleDeleteCampaign = async (id, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Supprimer cette campagne définitivement ?')) return;
    setError('');
    try {
      await axios.delete(`${API_URL}/broadcast/campaigns/${id}`);
      setCampaigns(prev => prev.filter(c => c.id !== id));
      if (detail?.id === id) { setDetail(null); setView('list'); }
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur suppression');
    }
  };

  const handleOpenDetail = async (campaign) => {
    setError('');
    try {
      const res = await axios.get(`${API_URL}/broadcast/campaigns/${campaign.id}`);
      setDetail(res.data);
      setView('detail');
    } catch (err) {
      setError('Erreur chargement campagne');
    }
  };

  const getProgressInfo = (campaign) => {
    const live = progress[campaign.id];
    const p = campaign.progress || {};
    const total = live?.total ?? p.total ?? 0;
    const done = live?.done ?? (p.sent ?? 0) + (p.failed ?? 0);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  };

  // ── No profile ─────────────────────────────────────────────────────────────
  if (!activeProfile?.id) {
    return (
      <div className="bc-placeholder">
        <p>Connectez un numéro WhatsApp pour utiliser la diffusion.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="bc-placeholder">Chargement…</div>;
  }

  // ── Create view ────────────────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="bc-panel">
        <div className="bc-toolbar">
          <button className="bc-back" onClick={() => { setView('list'); setError(''); }}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
            Retour
          </button>
          <h2 className="bc-title">Nouvelle campagne</h2>
        </div>

        {error && <div className="bc-error">{error}</div>}

        <div className="bc-form">
          <div className="bc-field">
            <label className="bc-label">Nom de la campagne</label>
            <input
              className="bc-input"
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Promotion été 2026"
              maxLength={80}
            />
          </div>

          <div className="bc-field">
            <label className="bc-label">
              Messages
              <span className="bc-hint"> — envoyés dans l'ordre avec 3–10 s entre chacun. Utilisez <code>{'{{name}}'}</code> pour le prénom.</span>
            </label>
            {form.messages.map((msg, i) => (
              <div key={i} className="bc-msg-row">
                <div className="bc-msg-index">{i + 1}</div>
                <textarea
                  className="bc-textarea"
                  value={msg.content}
                  onChange={e => handleMessageChange(i, e.target.value)}
                  placeholder={`Message ${i + 1}…`}
                  rows={3}
                />
                {form.messages.length > 1 && (
                  <button className="bc-remove-msg" onClick={() => handleRemoveMessage(i)} title="Supprimer">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button className="bc-add-msg" onClick={handleAddMessage}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              Ajouter un message
            </button>
          </div>

          <div className="bc-field">
            <div className="bc-contacts-head">
              <label className="bc-label">
                Contacts cibles
                <span className="bc-hint"> — {form.contactIds.length} sélectionné(s)</span>
              </label>
              <button className="bc-select-all" onClick={handleSelectAll}>
                {selectAll ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
            </div>
            <input
              className="bc-search"
              type="text"
              value={contactSearch}
              onChange={e => setContactSearch(e.target.value)}
              placeholder="Rechercher un contact…"
            />
            <div className="bc-contacts-scroll">
              {contacts.length === 0 && (
                <div className="bc-contacts-empty">
                  Aucun contact disponible. Reconnectez WhatsApp pour importer votre répertoire.
                </div>
              )}
              {filteredContacts.map(c => (
                <label key={c.id} className={`bc-contact-item ${form.contactIds.includes(c.id) ? 'bc-selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.contactIds.includes(c.id)}
                    onChange={() => handleToggleContact(c.id)}
                  />
                  <div className="bc-contact-avatar">
                    {(c.name || c.phone_number)[0].toUpperCase()}
                  </div>
                  <div className="bc-contact-info">
                    <span className="bc-contact-name">{c.name || c.phone_number}</span>
                    {c.name && <span className="bc-contact-phone">{c.phone_number}</span>}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="bc-form-actions">
            <button className="bc-btn-primary" onClick={handleCreateCampaign} disabled={saving}>
              {saving ? 'Création en cours…' : 'Créer la campagne'}
            </button>
            <button className="bc-btn-secondary" onClick={() => { setView('list'); setError(''); }}>
              Annuler
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  if (view === 'detail' && detail) {
    const currentStatus = campaigns.find(c => c.id === detail.id)?.status || detail.status;
    const statusInfo = STATUS_INFO[currentStatus] || STATUS_INFO.draft;
    const { total, done, pct } = getProgressInfo({ ...detail, status: currentStatus, progress: detail.progress });
    const liveProgress = progress[detail.id];
    const displayDone = liveProgress?.done ?? done;
    const displayPct = total > 0 ? Math.round((displayDone / total) * 100) : pct;

    return (
      <div className="bc-panel">
        <div className="bc-toolbar">
          <button className="bc-back" onClick={() => { setView('list'); setDetail(null); }}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
            Retour
          </button>
          <h2 className="bc-title">{detail.name}</h2>
          <span className="bc-badge" style={{ background: statusInfo.color }}>{statusInfo.label}</span>
        </div>

        {error && <div className="bc-error">{error}</div>}

        <div className="bc-detail-body">
          <div className="bc-progress-section">
            <div className="bc-progress-track">
              <div className="bc-progress-fill" style={{ width: `${displayPct}%` }} />
            </div>
            <div className="bc-progress-label">{displayDone} / {total} envoyés ({displayPct}%)</div>
          </div>

          <div className="bc-detail-actions">
            {(currentStatus === 'draft' || currentStatus === 'paused') && (
              <button className="bc-btn-primary" onClick={(e) => handleStartCampaign(detail.id, e)}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>
                {currentStatus === 'paused' ? 'Reprendre' : 'Démarrer'}
              </button>
            )}
            {currentStatus === 'running' && (
              <button className="bc-btn-warning" onClick={(e) => handleStopCampaign(detail.id, e)}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                Mettre en pause
              </button>
            )}
            {currentStatus !== 'running' && (
              <button className="bc-btn-danger" onClick={(e) => handleDeleteCampaign(detail.id, e)}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                Supprimer
              </button>
            )}
          </div>

          <div className="bc-messages-section">
            <h4 className="bc-section-title">Messages ({detail.messages?.length || 0})</h4>
            {detail.messages?.map((m, i) => (
              <div key={m.id} className="bc-msg-preview">
                <span className="bc-msg-index">{i + 1}</span>
                <p className="bc-msg-content">{m.content}</p>
              </div>
            ))}
          </div>

          <div className="bc-targets-section">
            <h4 className="bc-section-title">Contacts ({total})</h4>
            {detail.targets?.map(t => (
              <div key={t.id} className={`bc-target-row bc-target-${t.status}`}>
                <div className="bc-target-avatar">
                  {(t.contact.name || t.contact.phone_number)[0].toUpperCase()}
                </div>
                <div className="bc-target-info">
                  <div className="bc-target-name">{t.contact.name || t.contact.phone_number}</div>
                  <div className="bc-target-phone">{t.contact.phone_number}</div>
                </div>
                <div className="bc-target-status">
                  {t.status === 'sent' && <span className="bc-status-sent">Envoyé</span>}
                  {t.status === 'failed' && <span className="bc-status-failed" title={t.error || ''}>Echec</span>}
                  {t.status === 'pending' && <span className="bc-status-pending">En attente</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div className="bc-panel">
      <div className="bc-toolbar">
        <h2 className="bc-title">Diffusion</h2>
        <button className="bc-btn-primary bc-btn-sm" onClick={() => { setView('create'); setError(''); }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          Nouvelle campagne
        </button>
      </div>

      {error && <div className="bc-error">{error}</div>}

      {campaigns.length === 0 ? (
        <div className="bc-empty">
          <div className="bc-empty-icon"><IconMegaphone /></div>
          <p className="bc-empty-text">Aucune campagne. Créez-en une pour envoyer des messages groupés à vos contacts WhatsApp avec des délais humains.</p>
          <button className="bc-btn-primary" onClick={() => { setView('create'); setError(''); }}>
            Créer ma première campagne
          </button>
        </div>
      ) : (
        <div className="bc-campaigns">
          {campaigns.map(c => {
            const statusInfo = STATUS_INFO[c.status] || STATUS_INFO.draft;
            const { total, done, pct } = getProgressInfo(c);
            const livePct = progress[c.id]
              ? Math.round(((progress[c.id].done) / (progress[c.id].total || 1)) * 100)
              : pct;
            return (
              <div key={c.id} className="bc-card" onClick={() => handleOpenDetail(c)}>
                <div className="bc-card-top">
                  <span className="bc-card-name">{c.name}</span>
                  <span className="bc-badge" style={{ background: statusInfo.color }}>{statusInfo.label}</span>
                </div>
                <div className="bc-card-meta">
                  {c.messages?.length || 0} message(s) · {total} contact(s)
                </div>
                {total > 0 && (
                  <div className="bc-card-progress">
                    <div className="bc-progress-track">
                      <div className="bc-progress-fill" style={{ width: `${livePct}%` }} />
                    </div>
                    <span className="bc-progress-label">{progress[c.id]?.done ?? done}/{total}</span>
                  </div>
                )}
                <div className="bc-card-actions" onClick={e => e.stopPropagation()}>
                  {(c.status === 'draft' || c.status === 'paused') && (
                    <button className="bc-btn-sm bc-btn-start" onClick={(e) => handleStartCampaign(c.id, e)}>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>
                      {c.status === 'paused' ? 'Reprendre' : 'Démarrer'}
                    </button>
                  )}
                  {c.status === 'running' && (
                    <button className="bc-btn-sm bc-btn-pause" onClick={(e) => handleStopCampaign(c.id, e)}>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                      Pause
                    </button>
                  )}
                  {c.status !== 'running' && (
                    <button className="bc-btn-sm bc-btn-delete" onClick={(e) => handleDeleteCampaign(c.id, e)}>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
