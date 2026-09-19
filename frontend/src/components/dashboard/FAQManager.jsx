import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { confirmAction } from '../../utils/confirmAction';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function FAQManager() {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ question: '', answer: '' });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadFaqs();
  }, []);

  const loadFaqs = async () => {
    try {
      const res = await axios.get(`${API_URL}/faq`);
      setFaqs(res.data);
    } catch (err) {
      console.error('Erreur chargement FAQ:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.question.trim() || !form.answer.trim()) {
      setError('La question et la réponse sont requises');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await axios.put(`${API_URL}/faq/${editingId}`, form);
      } else {
        await axios.post(`${API_URL}/faq`, form);
      }
      setForm({ question: '', answer: '' });
      setEditingId(null);
      await loadFaqs();
    } catch (err) {
      setError('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (faq) => {
    setEditingId(faq.id);
    setForm({ question: faq.question, answer: faq.answer });
    setError('');
  };

  const handleDelete = async (id) => {
    if (!await confirmAction('Supprimer cette FAQ ?')) return;
    try {
      await axios.delete(`${API_URL}/faq/${id}`);
      await loadFaqs();
    } catch (err) {
      console.error('Erreur suppression FAQ:', err);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm({ question: '', answer: '' });
    setError('');
  };

  return (
    <section className="keyword-replies-panel legacy-replies-page">
      <div className="keyword-replies-header"><div><p>Les FAQ sont utilisées par le bot pour répondre aux questions fréquentes.</p></div></div>

      <form className="keyword-replies-form" onSubmit={handleSubmit}>
        <div className="keyword-replies-form-heading"><div><span className="keyword-replies-section-label">Nouvelle FAQ</span><h3>{editingId ? 'Modifier la FAQ' : 'Créer une FAQ'}</h3><p>Ajoutez une question fréquente et la réponse que le bot doit utiliser.</p></div><span className="keyword-replies-form-badge">{editingId ? 'Modification' : 'Disponible'}</span></div>
        <div className="keyword-replies-fields">
        <label><span>Question</span><small>La question à reconnaître</small>
          <input
            type="text"
            value={form.question}
            onChange={e => setForm({ ...form, question: e.target.value })}
            placeholder="Ex : Quels sont vos horaires ?"
          />
        </label>
        <label><span>Réponse</span><small>Le message envoyé automatiquement</small>
          <textarea
            value={form.answer}
            onChange={e => setForm({ ...form, answer: e.target.value })}
            placeholder="Ex : Nous sommes ouverts du lundi au vendredi de 9h à 18h."
            rows={3}
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
            {saving ? 'Sauvegarde...' : editingId ? 'Modifier la FAQ' : 'Ajouter la FAQ'}
          </button>
        </div>
      </form>

      <div className="keyword-replies-list-section">
        <div className="keyword-replies-list-heading"><div><span className="keyword-replies-section-label">FAQ enregistrées</span><h3>Vos questions fréquentes</h3></div><span className="keyword-replies-count">{faqs.length} {faqs.length === 1 ? 'FAQ' : 'FAQ'}</span></div>
      <div className="keyword-replies-list">
        {loading ? (
          <div className="keyword-replies-state"><span className="keyword-replies-spinner" />Chargement des FAQ…</div>
        ) : faqs.length === 0 ? (
          <div className="keyword-replies-state keyword-replies-state-empty"><span className="keyword-replies-state-icon">＋</span><strong>Aucune FAQ enregistrée</strong><p>Créez votre première question et sa réponse ci-dessus.</p></div>
        ) : (
          faqs.map(faq => (
            <article key={faq.id} className={`keyword-replies-item ${editingId === faq.id ? 'is-editing' : ''}`}>
              <div className="keyword-replies-item-content">
                <div className="keyword-replies-item-keyword"><span className="keyword-replies-keyword-dot" />{faq.question}</div>
                <p>{faq.answer}</p>
              </div>
              <div className="keyword-replies-item-actions">
                <button type="button" className="keyword-replies-action" onClick={() => handleEdit(faq)} title="Modifier">
                  Modifier
                </button>
                <button type="button" className="keyword-replies-action keyword-replies-danger" onClick={() => handleDelete(faq.id)} title="Supprimer">
                  Supprimer
                </button>
              </div>
            </article>
          ))
        )}
      </div>
      </div>
    </section>
  );
}
