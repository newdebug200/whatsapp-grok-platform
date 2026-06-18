import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function QuickReplyManager() {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', content: '' });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadReplies(); }, []);

  const loadReplies = async () => {
    try {
      const res = await axios.get(`${API_URL}/quick-replies`);
      setReplies(res.data);
    } catch (err) {
      console.error('Erreur chargement templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Le titre est requis'); return; }
    if (!form.content.trim()) { setError('Le contenu est requis'); return; }
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await axios.put(`${API_URL}/quick-replies/${editingId}`, form);
      } else {
        await axios.post(`${API_URL}/quick-replies`, form);
      }
      setForm({ title: '', content: '' });
      setEditingId(null);
      await loadReplies();
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (qr) => {
    setEditingId(qr.id);
    setForm({ title: qr.title, content: qr.content });
    setError('');
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce template ?')) return;
    try {
      await axios.delete(`${API_URL}/quick-replies/${id}`);
      await loadReplies();
    } catch (err) {
      console.error('Erreur suppression template:', err);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm({ title: '', content: '' });
    setError('');
  };

  return (
    <div className="panel-content">
      <div className="panel-title">Templates de réponses rapides</div>
      <p className="panel-desc">
        Créez des messages prêts à l'emploi accessibles en un clic dans le chat via le bouton ⚡.
      </p>

      <form className="faq-form" onSubmit={handleSubmit}>
        <div className="field-group">
          <label>Titre du template</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="Ex : Confirmation commande, Horaires, Merci..."
            maxLength={80}
          />
        </div>
        <div className="field-group">
          <label>Contenu du message</label>
          <textarea
            value={form.content}
            onChange={e => setForm({ ...form, content: e.target.value })}
            placeholder="Ex : Bonjour, merci pour votre commande ! Nous la traitons dans les 24h."
            rows={4}
          />
        </div>
        {error && <div className="config-error">{error}</div>}
        <div className="faq-form-actions">
          {editingId && (
            <button type="button" className="btn-cancel" onClick={handleCancel}>
              Annuler
            </button>
          )}
          <button type="submit" className="save-btn" disabled={saving}>
            {saving ? 'Sauvegarde...' : editingId ? 'Modifier' : '+ Ajouter'}
          </button>
        </div>
      </form>

      <div className="faq-list">
        {loading ? (
          <div className="faq-loading">Chargement...</div>
        ) : replies.length === 0 ? (
          <div className="faq-empty">Aucun template. Ajoutez-en un ci-dessus.</div>
        ) : (
          replies.map(qr => (
            <div key={qr.id} className={`faq-item ${editingId === qr.id ? 'editing' : ''}`}>
              <div className="faq-item-content">
                <div className="faq-q" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.8rem', background: 'var(--accent, #25d366)', color: '#fff', padding: '1px 7px', borderRadius: 10, fontWeight: 600 }}>
                    ⚡
                  </span>
                  {qr.title}
                </div>
                <div className="faq-a" style={{ whiteSpace: 'pre-wrap' }}>{qr.content}</div>
              </div>
              <div className="faq-item-actions">
                <button className="faq-edit-btn" onClick={() => handleEdit(qr)} title="Modifier">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
                <button className="faq-delete-btn" onClick={() => handleDelete(qr.id)} title="Supprimer">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
