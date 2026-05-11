import React, { useState, useEffect } from 'react';
import axios from 'axios';

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
    if (!confirm('Supprimer cette FAQ ?')) return;
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
    <div className="panel-content">
      <div className="panel-title">Gestion des FAQ</div>
      <p className="panel-desc">Les FAQ sont utilisées par le bot pour répondre aux questions fréquentes.</p>

      <form className="faq-form" onSubmit={handleSubmit}>
        <div className="field-group">
          <label>Question</label>
          <input
            type="text"
            value={form.question}
            onChange={e => setForm({ ...form, question: e.target.value })}
            placeholder="Ex : Quels sont vos horaires ?"
          />
        </div>
        <div className="field-group">
          <label>Réponse</label>
          <textarea
            value={form.answer}
            onChange={e => setForm({ ...form, answer: e.target.value })}
            placeholder="Ex : Nous sommes ouverts du lundi au vendredi de 9h à 18h."
            rows={3}
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
        ) : faqs.length === 0 ? (
          <div className="faq-empty">Aucune FAQ. Ajoutez-en une ci-dessus.</div>
        ) : (
          faqs.map(faq => (
            <div key={faq.id} className={`faq-item ${editingId === faq.id ? 'editing' : ''}`}>
              <div className="faq-item-content">
                <div className="faq-q">Q : {faq.question}</div>
                <div className="faq-a">R : {faq.answer}</div>
              </div>
              <div className="faq-item-actions">
                <button className="faq-edit-btn" onClick={() => handleEdit(faq)} title="Modifier">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
                <button className="faq-delete-btn" onClick={() => handleDelete(faq.id)} title="Supprimer">
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
