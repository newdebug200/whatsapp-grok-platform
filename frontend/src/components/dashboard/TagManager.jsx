import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './TagManager.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const PRESET_COLORS = [
  '#25d366', '#128c7e', '#34b7f1', '#667eea',
  '#e74c3c', '#e67e22', '#f39c12', '#9b59b6',
  '#1abc9c', '#e91e63', '#ff5722', '#607d8b'
];

const avatarColors = ['#25d366', '#128c7e', '#075e54', '#34b7f1', '#667eea', '#f6c90e', '#fd79a8'];
const getColor = (id) => avatarColors[id % avatarColors.length];

export default function TagManager({ activeProfile }) {
  const [tags, setTags] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contactsError, setContactsError] = useState('');

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#25d366');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const [assignTag, setAssignTag] = useState(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignSelected, setAssignSelected] = useState([]);
  const [assignSaving, setAssignSaving] = useState(false);

  // Track last clicked index for shift+click range selection
  const lastSelectedIdx = useRef(null);

  const loadTags = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/tags`);
      setTags(res.data);
    } catch {
      setError('Erreur lors du chargement des tags');
    }
  }, []);

  const loadContacts = useCallback(async () => {
    setContactsError('');
    try {
      const res = await axios.get(`${API_URL}/tags/contacts`);
      setContacts(res.data);
      return res.data;
    } catch (err) {
      const msg = err.response?.data?.error || 'Impossible de charger les contacts';
      setContactsError(msg);
      console.error('TagManager loadContacts:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    if (activeProfile?.id) {
      setLoading(true);
      Promise.all([loadTags(), loadContacts()]).finally(() => setLoading(false));
    }
  }, [activeProfile, loadTags, loadContacts]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await axios.post(`${API_URL}/tags`, { name: newName.trim(), color: newColor });
      setTags(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      setNewColor('#25d366');
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (tag) => {
    if (!window.confirm(`Supprimer le tag "${tag.name}" ? Il sera retiré de tous les contacts.`)) return;
    try {
      await axios.delete(`${API_URL}/tags/${tag.id}`);
      setTags(prev => prev.filter(t => t.id !== tag.id));
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  const handleStartEdit = (tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  const handleSaveEdit = async (tag) => {
    try {
      const res = await axios.put(`${API_URL}/tags/${tag.id}`, { name: editName, color: editColor });
      setTags(prev => prev.map(t => t.id === tag.id ? res.data : t).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingId(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la mise à jour');
    }
  };

  const handleOpenAssign = async (tag) => {
    const fresh = await loadContacts();
    const contactsToUse = fresh ?? contacts;
    const currentIds = contactsToUse
      .filter(c => c.tags?.some(ct => ct.tag_id === tag.id))
      .map(c => c.id);
    lastSelectedIdx.current = null;
    setAssignTag(tag);
    setAssignSelected(currentIds);
    setAssignSearch('');
  };

  // Handles click with optional shift+click range selection
  const handleContactClick = (e, contact, idx) => {
    const filtered = filteredAssignContactsRef.current;

    if (e.shiftKey && lastSelectedIdx.current !== null) {
      const from = Math.min(lastSelectedIdx.current, idx);
      const to = Math.max(lastSelectedIdx.current, idx);
      const rangeIds = filtered.slice(from, to + 1).map(c => c.id);
      // Use anchor's state to decide add or remove
      const anchorId = filtered[lastSelectedIdx.current].id;
      const anchorChecked = assignSelected.includes(anchorId);
      setAssignSelected(prev => {
        if (anchorChecked) {
          const toAdd = rangeIds.filter(id => !prev.includes(id));
          return [...prev, ...toAdd];
        } else {
          return prev.filter(id => !rangeIds.includes(id));
        }
      });
    } else {
      setAssignSelected(prev =>
        prev.includes(contact.id)
          ? prev.filter(x => x !== contact.id)
          : [...prev, contact.id]
      );
      lastSelectedIdx.current = idx;
    }
  };

  const handleAssignSave = async () => {
    if (!assignTag) return;
    setAssignSaving(true);
    setError('');
    try {
      const currentIds = contacts
        .filter(c => c.tags?.some(ct => ct.tag_id === assignTag.id))
        .map(c => c.id);

      const toAdd = assignSelected.filter(id => !currentIds.includes(id));
      const toRemove = currentIds.filter(id => !assignSelected.includes(id));

      const calls = [];
      if (toAdd.length > 0) {
        calls.push(
          axios.post(`${API_URL}/tags/${assignTag.id}/contacts`, { contact_ids: toAdd })
        );
      }
      for (const cid of toRemove) {
        calls.push(
          axios.delete(`${API_URL}/tags/${assignTag.id}/contacts/${cid}`)
        );
      }
      await Promise.all(calls);

      await Promise.all([loadContacts(), loadTags()]);
      setAssignTag(null);
    } catch (err) {
      const msg = err.response?.data?.error || "Erreur lors de l'assignation";
      setError(msg);
    } finally {
      setAssignSaving(false);
    }
  };

  const filteredAssignContacts = contacts.filter(c => {
    const q = assignSearch.toLowerCase();
    return !q || (c.name || '').toLowerCase().includes(q) || c.phone_number.includes(q);
  });

  // Keep a stable ref for shift+click so handlers see the latest filtered list
  const filteredAssignContactsRef = useRef(filteredAssignContacts);
  useEffect(() => {
    filteredAssignContactsRef.current = filteredAssignContacts;
    // Reset shift anchor when search changes
    lastSelectedIdx.current = null;
  }, [assignSearch]);

  if (!activeProfile?.id) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted, #667781)', textAlign: 'center' }}>
        Connectez un numéro WhatsApp pour gérer les tags.
      </div>
    );
  }

  if (loading) return (
    <div style={{ padding: 40, color: 'var(--text-muted, #667781)', textAlign: 'center' }}>
      Chargement…
    </div>
  );

  return (
    <div className="tm-panel">
      <div className="tm-toolbar">
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" style={{ color: '#25d366' }}>
          <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>
        </svg>
        <h2 className="tm-title">Étiquettes (Tags)</h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #667781)' }}>
          {tags.length} tag{tags.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="tm-body">
        {error && <div className="tm-error">{error}</div>}

        {/* ── Create ── */}
        <div className="tm-create-box">
          <p className="tm-create-title">Nouveau tag</p>
          <div className="tm-create-row">
            <input
              className="tm-input"
              type="text"
              placeholder="Nom du tag (ex : Client, VIP…)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              maxLength={40}
            />
            <input
              className="tm-color-picker"
              type="color"
              value={newColor}
              onChange={e => setNewColor(e.target.value)}
              title="Couleur"
            />
            <button className="tm-btn-add" onClick={handleCreate} disabled={creating || !newName.trim()}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              {creating ? 'Création…' : 'Créer'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                style={{
                  width: 22, height: 22, borderRadius: '50%', background: c,
                  border: newColor === c ? '2px solid var(--text-primary, #111)' : '2px solid transparent',
                  cursor: 'pointer', padding: 0, transition: 'border-color 0.12s'
                }}
                title={c}
              />
            ))}
          </div>
        </div>

        {/* ── Tag list ── */}
        <div className="tm-list-section">
          <p className="tm-list-header">Tags existants</p>
          {tags.length === 0 ? (
            <div className="tm-empty">Aucun tag créé. Créez votre premier tag ci-dessus.</div>
          ) : (
            tags.map(tag => (
              <div key={tag.id} className="tm-tag-item">
                {editingId === tag.id ? (
                  <div className="tm-edit-row">
                    <input
                      className="tm-color-picker"
                      type="color"
                      value={editColor}
                      onChange={e => setEditColor(e.target.value)}
                    />
                    <input
                      className="tm-input"
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(tag); if (e.key === 'Escape') setEditingId(null); }}
                      maxLength={40}
                      autoFocus
                    />
                    <button className="tm-btn-save" onClick={() => handleSaveEdit(tag)}>✓</button>
                    <button className="tm-btn-cancel" onClick={() => setEditingId(null)}>✕</button>
                  </div>
                ) : (
                  <>
                    <span className="tm-tag-dot" style={{ background: tag.color }} />
                    <span className="tm-tag-name">{tag.name}</span>
                    <span className="tm-tag-count">{tag._count?.contacts ?? 0} contact{(tag._count?.contacts ?? 0) !== 1 ? 's' : ''}</span>
                    <div className="tm-tag-actions">
                      <button className="tm-icon-btn" title="Assigner des contacts" onClick={() => handleOpenAssign(tag)}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                      </button>
                      <button className="tm-icon-btn" title="Modifier" onClick={() => handleStartEdit(tag)}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                      </button>
                      <button className="tm-icon-btn danger" title="Supprimer" onClick={() => handleDelete(tag)}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Assign contacts modal ── */}
      {assignTag && (
        <div className="tm-assign-overlay" onClick={() => setAssignTag(null)}>
          <div className="tm-assign-modal" onClick={e => e.stopPropagation()}>
            <div className="tm-assign-head">
              <h3>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: assignTag.color, marginRight: 8 }} />
                Assigner — {assignTag.name}
              </h3>
              <button className="tm-icon-btn" onClick={() => setAssignTag(null)}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>

            <div className="tm-assign-body">
              {contactsError ? (
                <div className="tm-error" style={{ margin: 0 }}>
                  {contactsError}
                  <button
                    onClick={loadContacts}
                    style={{ marginLeft: 10, background: 'none', border: 'none', color: '#25d366', cursor: 'pointer', fontSize: '0.82rem', textDecoration: 'underline' }}
                  >
                    Réessayer
                  </button>
                </div>
              ) : contacts.length === 0 ? (
                <div className="tm-assign-no-contacts">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32" style={{ opacity: 0.3, marginBottom: 8 }}>
                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                  </svg>
                  <p>Aucun contact disponible</p>
                  <p style={{ fontSize: '0.78rem' }}>
                    Importez des contacts via <strong>Campagnes → Importer CSV/VCF</strong> ou attendez des messages WhatsApp entrants.
                  </p>
                </div>
              ) : (
                <>
                  <input
                    className="tm-assign-search"
                    type="text"
                    placeholder="Rechercher un contact…"
                    value={assignSearch}
                    onChange={e => setAssignSearch(e.target.value)}
                  />

                  {filteredAssignContacts.length > 1 && (
                    <div className="tm-assign-hint">
                      Shift+clic pour sélectionner une plage
                    </div>
                  )}

                  <div className="tm-assign-list">
                    {filteredAssignContacts.length === 0 ? (
                      <div className="tm-assign-search-empty">
                        Aucun contact ne correspond à «&nbsp;{assignSearch}&nbsp;»
                      </div>
                    ) : (
                      filteredAssignContacts.map((c, idx) => {
                        const checked = assignSelected.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            className={`tm-assign-contact ${checked ? 'checked' : ''}`}
                            onClick={e => handleContactClick(e, c, idx)}
                            title={checked ? 'Désélectionner' : 'Sélectionner'}
                          >
                            <span className={`tm-assign-checkbox ${checked ? 'checked' : ''}`}>
                              {checked && (
                                <svg viewBox="0 0 12 12" fill="none" width="10" height="10">
                                  <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </span>
                            <div className="tm-assign-avatar" style={{ background: getColor(c.id) }}>
                              {(c.name || c.phone_number)[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="tm-assign-name">{c.name || c.phone_number}</div>
                              {c.name && <div className="tm-assign-phone">{c.phone_number}</div>}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="tm-assign-foot">
              <span className="tm-assign-count">
                {assignSelected.length} sélectionné{assignSelected.length !== 1 ? 's' : ''}
              </span>
              <button className="tm-assign-cancel" onClick={() => setAssignTag(null)}>Annuler</button>
              <button
                className="tm-assign-save"
                onClick={handleAssignSave}
                disabled={assignSaving || contacts.length === 0}
              >
                {assignSaving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
