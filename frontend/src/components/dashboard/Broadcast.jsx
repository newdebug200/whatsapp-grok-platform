import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import './Broadcast.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const STATUS_INFO = {
  draft: { label: 'Brouillon', color: '#8e9baa' },
  running: { label: 'En cours', color: '#25d366' },
  paused: { label: 'En pause', color: '#f39c12' },
  completed: { label: 'Terminée', color: '#3498db' },
  scheduled: { label: 'Planifiée', color: '#9b59b6' },
  cancelled: { label: 'Annulée', color: '#e74c3c' }
};

function IconMegaphone() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 3.94a9.58 9.58 0 0112.04 9.56c0 5.29-4.29 9.58-9.58 9.58-1.68 0-3.26-.43-4.63-1.19m-4.46-5.36A9.54 9.54 0 013.2 13.5C3.2 8.21 7.49 3.92 12.78 3.92"/>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 9l-3 3-3-3"/>
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
    </svg>
  );
}

function formatScheduledAt(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getMinDatetimeLocal() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5);
  return now.toISOString().slice(0, 16);
}

export default function Broadcast({ socket, activeProfile }) {
  const [view, setView] = useState('list');
  const [campaigns, setCampaigns] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [tags, setTags] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [contactsError, setContactsError] = useState('');
  const [contactsLoading, setContactsLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const [progress, setProgress] = useState({});

  const [form, setForm] = useState({
    name: '',
    messages: [{ content: '', media_url: '', media_type: '' }],
    contactIds: [],
    tagId: null,
    delayMin: 30,
    delayMax: 300,
    scheduled: false,
    scheduledAt: ''
  });
  const [targetMode, setTargetMode] = useState('manual');
  const [contactSearch, setContactSearch] = useState('');
  const [contactTagFilter, setContactTagFilter] = useState(null);
  const [selectAll, setSelectAll] = useState(false);
  const [hiddenContactIds, setHiddenContactIds] = useState([]);

  const fileInputRef = useRef(null);

  const resetForm = () => {
    setForm({ name: '', messages: [{ content: '', media_url: '', media_type: '' }], contactIds: [], tagId: null, delayMin: 30, delayMax: 90, scheduled: false, scheduledAt: '' });
    setContactSearch('');
    setContactTagFilter(null);
    setSelectAll(false);
    setHiddenContactIds([]);
    setImportStatus(null);
    setTargetMode('manual');
    setError('');
  };

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
    setContactsLoading(true);
    setContactsError('');
    try {
      const res = await axios.get(`${API_URL}/messages/contacts`);
      setContacts(res.data);
      if (res.data.length === 0) {
        setContactsError('Aucun contact trouvé. WhatsApp doit être connecté ou importez un fichier CSV / VCF.');
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Erreur de chargement';
      setContactsError(`Impossible de charger les contacts : ${msg}`);
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/tags`);
      setTags(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    if (activeProfile?.id) { loadCampaigns(); loadContacts(); loadTags(); }
  }, [activeProfile, loadCampaigns, loadContacts, loadTags]);

  useEffect(() => {
    if (!socket) return;
    const onProgress = (data) => {
      setProgress(prev => ({ ...prev, [data.campaignId]: { done: data.done, total: data.total, completed: data.completed } }));
      if (data.completed) {
        setCampaigns(prev => prev.map(c => c.id === data.campaignId ? { ...c, status: 'completed' } : c));
      }
    };
    const onError = (data) => {
      setError(data.error || 'Erreur campagne');
      setCampaigns(prev => prev.map(c => c.id === data.campaignId ? { ...c, status: 'draft' } : c));
    };
    socket.on('campaign-progress', onProgress);
    socket.on('campaign-error', onError);
    return () => { socket.off('campaign-progress', onProgress); socket.off('campaign-error', onError); };
  }, [socket]);

  const visibleContacts = contacts.filter(c => !hiddenContactIds.includes(c.id));
  const filteredContacts = visibleContacts.filter(c => {
    const matchSearch = !contactSearch || (c.name || '').toLowerCase().includes(contactSearch.toLowerCase()) || c.phone_number.includes(contactSearch);
    const matchTag = !contactTagFilter || c.tags?.some(ct => ct.tag_id === contactTagFilter);
    return matchSearch && matchTag;
  });

  const handleToggleContact = (id) => {
    setForm(prev => ({ ...prev, contactIds: prev.contactIds.includes(id) ? prev.contactIds.filter(x => x !== id) : [...prev.contactIds, id] }));
  };

  const handleSelectAll = () => {
    if (selectAll) { setForm(prev => ({ ...prev, contactIds: [] })); setSelectAll(false); }
    else { setForm(prev => ({ ...prev, contactIds: filteredContacts.map(c => c.id) })); setSelectAll(true); }
  };

  const handleHideContact = (id) => {
    setHiddenContactIds(prev => [...prev, id]);
    setForm(prev => ({ ...prev, contactIds: prev.contactIds.filter(x => x !== id) }));
  };

  const handleHideAll = () => {
    setHiddenContactIds(contacts.map(c => c.id));
    setForm(prev => ({ ...prev, contactIds: [] }));
    setSelectAll(false);
  };

  const handleRestoreAll = () => setHiddenContactIds([]);

  const handleAddMessage = () => setForm(prev => ({ ...prev, messages: [...prev.messages, { content: '', media_url: '', media_type: '' }] }));
  const handleRemoveMessage = (i) => setForm(prev => ({ ...prev, messages: prev.messages.filter((_, j) => j !== i) }));
  const handleMessageChange = (i, value) => {
    const msgs = [...form.messages];
    msgs[i] = { ...msgs[i], content: value };
    setForm(prev => ({ ...prev, messages: msgs }));
  };
  const handleMediaChange = (i, field, value) => {
    const msgs = [...form.messages];
    msgs[i] = { ...msgs[i], [field]: value };
    setForm(prev => ({ ...prev, messages: msgs }));
  };

  const handleCreateCampaign = async () => {
    if (!form.name.trim()) return setError('Donnez un nom à la campagne');
    if (form.messages.some(m => !m.content.trim())) return setError('Chaque variante doit avoir un contenu');
    if (targetMode === 'tag' && !form.tagId) return setError('Sélectionnez un tag cible');
    if (targetMode === 'manual' && form.contactIds.length === 0) return setError('Sélectionnez au moins un contact');
    if (form.delayMin < 5) return setError('Le délai minimum ne peut pas être inférieur à 5 secondes');
    if (form.delayMax < form.delayMin) return setError('Le délai maximum doit être supérieur au délai minimum');
    if (form.scheduled && !form.scheduledAt) return setError('Choisissez une date et heure de planification');
    if (form.scheduled && new Date(form.scheduledAt) <= new Date()) return setError('La date de planification doit être dans le futur');

    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        messages: form.messages.map((m, i) => ({
          content: m.content,
          order_index: i,
          delay_after_seconds: 0,
          ...(m.media_url?.trim() && { media_url: m.media_url.trim(), media_type: m.media_type || 'image' })
        })),
        delay_min_seconds: form.delayMin,
        delay_max_seconds: form.delayMax,
        ...(form.scheduled && form.scheduledAt && { scheduled_at: new Date(form.scheduledAt).toISOString() })
      };
      if (targetMode === 'tag') {
        payload.tag_id = form.tagId;
      } else if (selectAll) {
        // Send a flag instead of thousands of IDs to avoid PayloadTooLarge errors
        payload.select_all = true;
      } else {
        payload.contact_ids = form.contactIds;
      }

      const res = await axios.post(`${API_URL}/broadcast/campaigns`, payload);
      const total = targetMode === 'tag'
        ? (tags.find(t => t.id === form.tagId)?._count?.contacts ?? 0)
        : form.contactIds.length;
      setCampaigns(prev => [{ ...res.data, progress: { sent: 0, pending: total, failed: 0, total } }, ...prev]);
      setView('list');
      resetForm();
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'vcf'].includes(ext)) { setImportStatus({ error: 'Format non supporté. Utilisez un fichier .csv ou .vcf' }); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      setImporting(true);
      setImportStatus(null);
      try {
        const res = await axios.post(`${API_URL}/broadcast/import-contacts`, { content: ev.target.result, filename: file.name });
        setImportStatus({ imported: res.data.imported, skipped: res.data.skipped, total: res.data.total });
        await loadContacts();
      } catch (err) {
        setImportStatus({ error: err.response?.data?.error || "Erreur lors de l'import" });
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file, 'UTF-8');
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
    } catch {
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

  if (!activeProfile?.id) {
    return <div className="bc-placeholder"><p>Connectez un numéro WhatsApp pour utiliser la diffusion.</p></div>;
  }

  if (loading) return <div className="bc-placeholder">Chargement…</div>;

  // ── Create view ──────────────────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="bc-panel">
        <div className="bc-toolbar">
          <button className="bc-back" onClick={() => { setView('list'); resetForm(); }}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            Retour
          </button>
          <h2 className="bc-title">Nouvelle campagne</h2>
        </div>

        {error && <div className="bc-error">{error}</div>}

        <div className="bc-form">
          {/* ── Nom ── */}
          <div className="bc-field">
            <label className="bc-label">Nom de la campagne</label>
            <input className="bc-input" type="text" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Promotion été 2026" maxLength={80} />
          </div>

          {/* ── Planification ── */}
          <div className="bc-field">
            <label className="bc-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Planification</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.scheduled}
                  onChange={e => setForm(f => ({ ...f, scheduled: e.target.checked, scheduledAt: e.target.checked ? f.scheduledAt : '' }))} />
                Envoyer à une date précise
              </label>
            </label>
            {form.scheduled && (
              <div style={{ marginTop: 8 }}>
                <input
                  className="bc-input"
                  type="datetime-local"
                  value={form.scheduledAt}
                  min={getMinDatetimeLocal()}
                  onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                />
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #8e9baa)', marginTop: 4 }}>
                  L'heure est celle de votre navigateur. La campagne sera lancée automatiquement.
                  Si WhatsApp est déconnecté à ce moment, la campagne sera annulée.
                </p>
              </div>
            )}
          </div>

          {/* ── Variantes ── */}
          <div className="bc-field">
            <label className="bc-label">
              Variantes de message
              <span className="bc-hint"> — chaque contact reçoit <strong>un seul message</strong>, tiré au hasard.</span>
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {[['{{prenom}}', 'Prénom'], ['{{nom}}', 'Nom complet'], ['{{telephone}}', 'Téléphone']].map(([v, label]) => (
                <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg-secondary, #1e2a35)', border: '1px solid var(--border, #2d3f50)', borderRadius: 5, padding: '2px 8px', fontSize: '0.78rem', color: 'var(--text-secondary, #8e9baa)', cursor: 'default' }}>
                  <code style={{ color: '#25d366', fontSize: '0.78rem' }}>{v}</code>
                  <span>= {label}</span>
                </span>
              ))}
            </div>
            {form.messages.map((msg, i) => (
              <div key={i} className="bc-msg-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <div className="bc-msg-index">{i + 1}</div>
                  <textarea className="bc-textarea" value={msg.content}
                    onChange={e => handleMessageChange(i, e.target.value)}
                    placeholder={`Variante ${i + 1}…`} rows={3} style={{ flex: 1 }} />
                  {form.messages.length > 1 && (
                    <button className="bc-remove-msg" onClick={() => handleRemoveMessage(i)} title="Supprimer">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, marginLeft: 28, alignItems: 'center' }}>
                  <select
                    value={msg.media_type || ''}
                    onChange={e => handleMediaChange(i, 'media_type', e.target.value)}
                    style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border, #2d3f50)', background: 'var(--bg-secondary, #1e2a35)', color: 'var(--text-secondary, #8e9baa)', fontSize: '0.78rem', cursor: 'pointer', flexShrink: 0 }}
                  >
                    <option value="">📎 Média (optionnel)</option>
                    <option value="image">🖼️ Image</option>
                    <option value="document">📄 Document / PDF</option>
                    <option value="audio">🎵 Audio</option>
                    <option value="video">🎥 Vidéo</option>
                  </select>
                  {msg.media_type && (
                    <input
                      type="url"
                      value={msg.media_url || ''}
                      onChange={e => handleMediaChange(i, 'media_url', e.target.value)}
                      placeholder="URL du fichier (https://…)"
                      style={{ flex: 1, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border, #2d3f50)', background: 'var(--bg-secondary, #1e2a35)', color: 'var(--text-primary, #e8eaed)', fontSize: '0.8rem' }}
                    />
                  )}
                </div>
              </div>
            ))}
            <button className="bc-add-msg" onClick={handleAddMessage}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              Ajouter une variante
            </button>
          </div>

          {/* ── Délai ── */}
          <div className="bc-field">
            <label className="bc-label">Délai entre les envois<span className="bc-hint"> — temps aléatoire entre deux contacts</span></label>
            <div className="bc-delay-row">
              <div className="bc-delay-item">
                <span className="bc-delay-label">Min</span>
                <input className="bc-delay-input" type="number" min="5" max="3600" value={form.delayMin}
                  onChange={e => setForm(f => ({ ...f, delayMin: Math.max(5, parseInt(e.target.value) || 5) }))} />
                <span className="bc-delay-unit">s</span>
              </div>
              <span className="bc-delay-arrow">→</span>
              <div className="bc-delay-item">
                <span className="bc-delay-label">Max</span>
                <input className="bc-delay-input" type="number" min="5" max="3600" value={form.delayMax}
                  onChange={e => setForm(f => ({ ...f, delayMax: Math.max(f.delayMin, parseInt(e.target.value) || 5) }))} />
                <span className="bc-delay-unit">s</span>
              </div>
              <span className="bc-delay-preview">Envoi aléatoire entre {form.delayMin}s et {form.delayMax}s</span>
            </div>
            {form.delayMin < 20 && <p className="bc-delay-warn">⚠ En dessous de 20s WhatsApp peut détecter l'automatisation.</p>}
          </div>

          {/* ── Contacts ── */}
          <div className="bc-field">
            <label className="bc-label">Contacts cibles</label>
            <div className="bc-target-mode-row">
              <button className={`bc-mode-btn ${targetMode === 'manual' ? 'active' : ''}`} onClick={() => setTargetMode('manual')}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                Sélection manuelle
              </button>
              <button className={`bc-mode-btn ${targetMode === 'tag' ? 'active' : ''}`} onClick={() => setTargetMode('tag')}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>
                Cibler par tag
              </button>
            </div>

            {targetMode === 'tag' && (
              <div className="bc-tag-target-section">
                {tags.length === 0 ? (
                  <div className="bc-contacts-empty">Aucun tag créé. Allez dans l'onglet Tags pour en créer.</div>
                ) : (
                  <>
                    <p className="bc-tag-target-hint">Tous les contacts ayant ce tag recevront la campagne.</p>
                    <div className="bc-tag-chips">
                      {tags.map(tag => (
                        <button key={tag.id}
                          className={`bc-tag-chip ${form.tagId === tag.id ? 'active' : ''}`}
                          style={form.tagId === tag.id ? { background: tag.color, borderColor: tag.color, color: '#fff' } : { borderColor: tag.color, color: tag.color }}
                          onClick={() => setForm(f => ({ ...f, tagId: f.tagId === tag.id ? null : tag.id }))}>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: form.tagId === tag.id ? '#fff' : tag.color, marginRight: 6 }} />
                          {tag.name}
                          <span style={{ marginLeft: 6, opacity: 0.7, fontSize: '0.78rem' }}>({tag._count?.contacts ?? 0})</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {targetMode === 'manual' && (
              <>
                <div className="bc-contacts-head" style={{ marginTop: 10 }}>
                  <span className="bc-hint">{form.contactIds.length} sélectionné(s){hiddenContactIds.length > 0 ? ` · ${hiddenContactIds.length} masqué(s)` : ''}</span>
                  <div className="bc-contacts-actions">
                    <button className="bc-select-all" onClick={loadContacts} title="Recharger" disabled={contactsLoading}>{contactsLoading ? '…' : '↺'}</button>
                    {hiddenContactIds.length > 0 && <button className="bc-select-all bc-restore-btn" onClick={handleRestoreAll}>Restaurer tous</button>}
                    <button className="bc-select-all" onClick={handleSelectAll}>{selectAll ? 'Tout désélect.' : 'Tout sélect.'}</button>
                    {visibleContacts.length > 0 && <button className="bc-select-all bc-hide-all-btn" onClick={handleHideAll}>Tout retirer</button>}
                  </div>
                </div>

                <div className="bc-import-bar">
                  <input ref={fileInputRef} type="file" accept=".csv,.vcf" style={{ display: 'none' }} onChange={handleImportFile} />
                  <button className="bc-import-btn" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
                    {importing ? 'Import en cours…' : 'Importer CSV / VCF'}
                  </button>
                  <span className="bc-import-hint">CSV : colonnes nom/téléphone · VCF : contacts exportés depuis votre téléphone</span>
                </div>

                {importStatus && (
                  importStatus.error
                    ? <div className="bc-error" style={{ marginTop: 0 }}>{importStatus.error}</div>
                    : <div className="bc-import-success">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                        {importStatus.imported} contact(s) importé(s){importStatus.skipped > 0 && ` · ${importStatus.skipped} ignoré(s)`}{' '}sur {importStatus.total} trouvé(s)
                      </div>
                )}

                {contactsError && !importStatus && <div className="bc-error" style={{ marginBottom: 0, marginTop: 0 }}>{contactsError}</div>}

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="bc-search" style={{ flex: 1, marginBottom: 0 }} type="text" value={contactSearch}
                    onChange={e => setContactSearch(e.target.value)} placeholder="Rechercher un contact…" />
                </div>

                {tags.length > 0 && (
                  <div className="bc-tag-filter-bar">
                    <button className={`bc-tag-filter-chip ${!contactTagFilter ? 'active' : ''}`} onClick={() => setContactTagFilter(null)}>Tous</button>
                    {tags.map(tag => (
                      <button key={tag.id}
                        className={`bc-tag-filter-chip ${contactTagFilter === tag.id ? 'active' : ''}`}
                        style={contactTagFilter === tag.id ? { background: tag.color, borderColor: tag.color, color: '#fff' } : { borderColor: tag.color + '99', color: tag.color }}
                        onClick={() => setContactTagFilter(prev => prev === tag.id ? null : tag.id)}>
                        {tag.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="bc-contacts-scroll">
                  {contactsLoading && <div className="bc-contacts-empty">Chargement des contacts…</div>}
                  {!contactsLoading && contacts.length === 0 && <div className="bc-contacts-empty">Aucun contact disponible. Importez un fichier CSV ou VCF ci-dessus.</div>}
                  {!contactsLoading && contacts.length > 0 && filteredContacts.length === 0 && (
                    <div className="bc-contacts-empty">
                      {hiddenContactIds.length > 0
                        ? <><>Tous les contacts ont été retirés.{' '}</><button className="bc-select-all" onClick={handleRestoreAll} style={{ display: 'inline' }}>Restaurer</button></>
                        : 'Aucun contact pour ce filtre.'}
                    </div>
                  )}
                  {filteredContacts.map(c => (
                    <div key={c.id} className={`bc-contact-item ${form.contactIds.includes(c.id) ? 'bc-selected' : ''}`} onClick={() => handleToggleContact(c.id)}>
                      <input type="checkbox" checked={form.contactIds.includes(c.id)} onChange={() => handleToggleContact(c.id)} onClick={e => e.stopPropagation()} />
                      <div className="bc-contact-avatar">{(c.name || c.phone_number)[0].toUpperCase()}</div>
                      <div className="bc-contact-info">
                        <span className="bc-contact-name">{c.name || c.phone_number}</span>
                        {c.name && <span className="bc-contact-phone">{c.phone_number}</span>}
                        {c.tags?.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                            {c.tags.slice(0, 2).map(ct => ct.tag && (
                              <span key={ct.tag_id} style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: 10, background: ct.tag.color + '22', color: ct.tag.color, border: `1px solid ${ct.tag.color}44` }}>
                                {ct.tag.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button className="bc-contact-remove" title="Retirer de la liste" onClick={e => { e.stopPropagation(); handleHideContact(c.id); }}>
                        <IconTrash />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="bc-form-actions">
            <button className="bc-btn-primary" onClick={handleCreateCampaign} disabled={saving}>
              {saving ? 'Création en cours…' : form.scheduled ? '📅 Planifier la campagne' : 'Créer la campagne'}
            </button>
            <button className="bc-btn-secondary" onClick={() => { setView('list'); resetForm(); }}>Annuler</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Detail view ──────────────────────────────────────────────────────────────
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
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            Retour
          </button>
          <h2 className="bc-title">{detail.name}</h2>
          <span className="bc-badge" style={{ background: statusInfo.color }}>{statusInfo.label}</span>
        </div>

        {error && <div className="bc-error">{error}</div>}

        <div className="bc-detail-body">
          {currentStatus === 'scheduled' && detail.scheduled_at && (
            <div style={{ background: '#9b59b622', border: '1px solid #9b59b644', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.85rem', color: '#9b59b6' }}>
              📅 Envoi planifié le <strong>{formatScheduledAt(detail.scheduled_at)}</strong>
            </div>
          )}

          {/* ── Rapport synthèse ── */}
          {(() => {
            const targets = detail.targets || [];
            const rSent = liveProgress ? liveProgress.done : targets.filter(t => t.status === 'sent').length;
            const rFailed = targets.filter(t => t.status === 'failed').length;
            const rPending = liveProgress
              ? (total - liveProgress.done - rFailed)
              : targets.filter(t => t.status === 'pending').length;
            const rTotal = total || 1;
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Envoyés', count: rSent, pct: Math.round((rSent / rTotal) * 100), color: '#25d366', icon: '✅' },
                  { label: 'Échecs', count: rFailed, pct: Math.round((rFailed / rTotal) * 100), color: '#e74c3c', icon: '❌' },
                  { label: 'En attente', count: rPending, pct: Math.round((rPending / rTotal) * 100), color: '#8e9baa', icon: '⏳' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--bg-secondary, #1e2a35)', borderRadius: 10, padding: '12px 14px', textAlign: 'center', border: `1px solid ${s.color}33` }}>
                    <div style={{ fontSize: '1.4rem', marginBottom: 2 }}>{s.icon}</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: s.color }}>{s.count}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #8e9baa)', marginTop: 1 }}>{s.label}</div>
                    <div style={{ fontSize: '0.68rem', color: s.color, opacity: 0.8 }}>{s.pct}%</div>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="bc-progress-section">
            <div className="bc-progress-track"><div className="bc-progress-fill" style={{ width: `${displayPct}%` }} /></div>
            <div className="bc-progress-label">{displayDone} / {total} traités ({displayPct}%)</div>
          </div>

          {detail.delay_min_seconds != null && (
            <div className="bc-delay-info">Délai : {detail.delay_min_seconds}s – {detail.delay_max_seconds}s entre chaque contact</div>
          )}

          <div className="bc-detail-actions">
            {(currentStatus === 'draft' || currentStatus === 'paused' || currentStatus === 'scheduled') && (
              <button className="bc-btn-primary" onClick={(e) => handleStartCampaign(detail.id, e)}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>
                {currentStatus === 'paused' ? 'Reprendre' : currentStatus === 'scheduled' ? 'Lancer maintenant' : 'Démarrer'}
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
            <h4 className="bc-section-title">Variantes ({detail.messages?.length || 0}) — 1 envoyée par contact</h4>
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
                <div className="bc-target-avatar">{(t.contact.name || t.contact.phone_number)[0].toUpperCase()}</div>
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
        <h2 className="bc-title">Campagnes</h2>
        <button className="bc-btn-primary bc-btn-sm" onClick={() => { setView('create'); setError(''); }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          Nouvelle campagne
        </button>
      </div>

      {error && <div className="bc-error">{error}</div>}

      {campaigns.length === 0 ? (
        <div className="bc-empty">
          <div className="bc-empty-icon"><IconMegaphone /></div>
          <p className="bc-empty-text">Aucune campagne. Créez-en une pour envoyer des messages groupés à vos contacts WhatsApp.</p>
          <button className="bc-btn-primary" onClick={() => { setView('create'); setError(''); }}>Créer ma première campagne</button>
        </div>
      ) : (
        <div className="bc-campaigns">
          {campaigns.map(c => {
            const statusInfo = STATUS_INFO[c.status] || STATUS_INFO.draft;
            const { total, done, pct } = getProgressInfo(c);
            const livePct = progress[c.id] ? Math.round(((progress[c.id].done) / (progress[c.id].total || 1)) * 100) : pct;
            return (
              <div key={c.id} className="bc-card" onClick={() => handleOpenDetail(c)}>
                <div className="bc-card-top">
                  <span className="bc-card-name">{c.name}</span>
                  <span className="bc-badge" style={{ background: statusInfo.color }}>{statusInfo.label}</span>
                </div>
                {c.status === 'scheduled' && c.scheduled_at && (
                  <div style={{ fontSize: '0.75rem', color: '#9b59b6', marginBottom: 4 }}>
                    📅 {formatScheduledAt(c.scheduled_at)}
                  </div>
                )}
                <div className="bc-card-meta">
                  {c.messages?.length || 0} variante(s) · {total} contact(s)
                  {c.delay_min_seconds != null && <span className="bc-card-delay"> · {c.delay_min_seconds}–{c.delay_max_seconds}s</span>}
                </div>
                {total > 0 && (
                  <div className="bc-card-progress">
                    <div className="bc-progress-track"><div className="bc-progress-fill" style={{ width: `${livePct}%` }} /></div>
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
                  {c.status === 'scheduled' && (
                    <button className="bc-btn-sm bc-btn-start" onClick={(e) => handleStartCampaign(c.id, e)}>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>
                      Lancer maintenant
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
