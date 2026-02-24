import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './FAQManager.css';

function FAQManager() {
  const [faqs, setFaqs] = useState([]);
  const [editingFaq, setEditingFaq] = useState(null);
  const [formData, setFormData] = useState({ question: '', answer: '' });

  useEffect(() => {
    loadFAQs();
  }, []);

  const loadFAQs = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/faq`);
      setFaqs(response.data);
    } catch (error) {
      console.error('Erreur chargement FAQ:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingFaq) {
        await axios.put(`${import.meta.env.VITE_API_URL}/faq/${editingFaq.id}`, formData);
      } else {
        await axios.post(`${import.meta.env.VITE_API_URL}/faq`, formData);
      }
      
      setFormData({ question: '', answer: '' });
      setEditingFaq(null);
      loadFAQs();
    } catch (error) {
      console.error('Erreur sauvegarde FAQ:', error);
    }
  };

  const handleEdit = (faq) => {
    setEditingFaq(faq);
    setFormData({ question: faq.question, answer: faq.answer });
  };

  const handleDelete = async (id) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette FAQ ?')) {
      try {
        await axios.delete(`${import.meta.env.VITE_API_URL}/faq/${id}`);
        loadFAQs();
      } catch (error) {
        console.error('Erreur suppression FAQ:', error);
      }
    }
  };

  return (
    <div className="faq-manager">
      <h2>Gestion des FAQ</h2>
      
      <form onSubmit={handleSubmit} className="faq-form">
        <h3>{editingFaq ? 'Modifier' : 'Ajouter'} une FAQ</h3>
        
        <div className="form-group">
          <label>Question :</label>
          <input
            type="text"
            value={formData.question}
            onChange={(e) => setFormData({ ...formData, question: e.target.value })}
            required
          />
        </div>
        
        <div className="form-group">
          <label>Réponse :</label>
          <textarea
            value={formData.answer}
            onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
            required
            rows="4"
          />
        </div>
        
        <div className="form-actions">
          <button type="submit">
            {editingFaq ? 'Mettre à jour' : 'Ajouter'}
          </button>
          {editingFaq && (
            <button type="button" onClick={() => {
              setEditingFaq(null);
              setFormData({ question: '', answer: '' });
            }}>
              Annuler
            </button>
          )}
        </div>
      </form>

      <div className="faq-list">
        {faqs.map((faq) => (
          <div key={faq.id} className="faq-item">
            <div className="faq-content">
              <h4>{faq.question}</h4>
              <p>{faq.answer}</p>
            </div>
            <div className="faq-actions">
              <button onClick={() => handleEdit(faq)}>Modifier</button>
              <button onClick={() => handleDelete(faq.id)}>Supprimer</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FAQManager;