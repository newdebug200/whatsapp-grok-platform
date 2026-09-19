import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { confirmAction } from '../../utils/confirmAction';

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
    if (!await confirmAction('Supprimer ce template ?')) return;
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
    <section className="keyword-replies-panel legacy-replies-page">
      <div className="keyword-replies-header"><div><p>Créez des messages prêts à l'emploi accessibles en un clic dans le chat via le bouton ⚡.</p></div></div>

      <form className="keyword-replies-form" onSubmit={handleSubmit}>
        <div className="keyword-replies-form-heading"><div><span className="keyword-replies-section-label">Nouveau message</span><h3>{editingId ? 'Modifier la réponse rapide' : 'Créer une réponse rapide'}</h3><p>Préparez un message réutilisable pour répondre plus rapidement à vos contacts.</p></div><span className="keyword-replies-form-badge">{editingId ? 'Modification' : 'Disponible'}</span></div>
        <div className="keyword-replies-fields">
        <label><span>Titre du template</span><small>Le nom affiché dans le chat</small>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="Ex : Confirmation commande, Horaires, Merci..."
            maxLength={80}
          />
        </label>
        <label><span>Contenu du message</span><small>Le texte inséré automatiquement</small>
          <textarea
            value={form.content}
            onChange={e => setForm({ ...form, content: e.target.value })}
            placeholder="Ex : Bonjour, merci pour votre commande ! Nous la traitons dans les 24h."
            rows={4}
          />
        </label>
        </div>
        {error && <div className="config-error">{error}</div>}
        <div className="keyword-replies-form-actions">
          {editingId && (
            <button type="button" className="keyword-replies-secondary-action" onClick={handleCancel}>
              Annuler
            </button>
          )}
          <button type="submit" className="keyword-replies-primary-action" disabled={saving}>
            {saving ? 'Sauvegarde...' : editingId ? 'Modifier la réponse' : 'Ajouter la réponse'}
          </button>
        </div>
      </form>

      <div className="keyword-replies-list-section">
        <div className="keyword-replies-list-heading"><div><span className="keyword-replies-section-label">Réponses enregistrées</span><h3>Vos réponses rapides</h3></div><span className="keyword-replies-count">{replies.length} {replies.length === 1 ? 'réponse' : 'réponses'}</span></div>
      <div className="keyword-replies-list">
        {loading ? (
          <div className="keyword-replies-state"><span className="keyword-replies-spinner" />Chargement des réponses…</div>
        ) : replies.length === 0 ? (
          <div className="keyword-replies-state keyword-replies-state-empty"><span className="keyword-replies-state-icon">＋</span><strong>Aucune réponse rapide</strong><p>Créez votre premier message réutilisable ci-dessus.</p></div>
        ) : (
          replies.map(qr => (
            <article key={qr.id} className={`keyword-replies-item ${editingId === qr.id ? 'is-editing' : ''}`}>
              <div className="keyword-replies-item-content">
                <div className="keyword-replies-item-keyword"><span className="keyword-replies-keyword-dot" />{qr.title}</div>
                <p style={{ whiteSpace: 'pre-wrap' }}>{qr.content}</p>
              </div>
              <div className="keyword-replies-item-actions">
                <button type="button" className="keyword-replies-action" onClick={() => handleEdit(qr)} title="Modifier">Modifier</button>
                <button type="button" className="keyword-replies-action keyword-replies-danger" onClick={() => handleDelete(qr.id)} title="Supprimer">Supprimer</button>
              </div>
            </article>
          ))
        )}
      </div>
      </div>
    </section>
  );
}
