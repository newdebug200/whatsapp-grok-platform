import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './DressurConfig.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function DressurConfig() {
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDescription();
  }, []);

  const loadDescription = async () => {
    try {
      setLoading(true);
      console.log('Chargement de la description...');
      const response = await axios.get(`${API_URL}/config/dressur`);
      console.log('Réponse chargement:', response.data);
      setDescription(response.data.description || '');
      setMessage({ text: '', type: '' });
    } catch (error) {
      console.error('Erreur détaillée chargement:', error.response || error);
      setMessage({ 
        text: `Erreur de chargement: ${error.response?.data?.error || error.message}`, 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: 'Sauvegarde en cours...', type: 'info' });

    try {
      console.log('Envoi de la description:', description);
      const response = await axios.put(`${API_URL}/config/dressur`, {
        description
      });
      console.log('Réponse sauvegarde:', response.data);
      
      setMessage({ 
        text: response.data.message || 'Description sauvegardée avec succès !', 
        type: 'success' 
      });
      
      // Recharger pour être sûr
      await loadDescription();
    } catch (error) {
      console.error('Erreur détaillée sauvegarde:', error.response || error);
      setMessage({ 
        text: `Erreur: ${error.response?.data?.error || error.message}`, 
        type: 'error' 
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="dressur-config">Chargement...</div>;
  }

  return (
    <div className="dressur-config">
      <h2>Configuration Dressur</h2>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="description">
            Description complète de l'application Dressur :
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows="20"
            placeholder="Décrivez ici en détail l'application Dressur..."
          />
        </div>

        {message.text && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}

        <button type="submit" disabled={saving}>
          {saving ? 'Sauvegarde...' : 'Sauvegarder la description'}
        </button>
      </form>
    </div>
  );
}

export default DressurConfig;