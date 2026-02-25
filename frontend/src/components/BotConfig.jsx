import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './BotConfig.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function BotConfig() {
  const [config, setConfig] = useState({
    ia_enabled: true,
    whatsapp_confirm_enabled: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/config/bot`);
      setConfig({
        ia_enabled: response.data.ia_enabled !== false,
        whatsapp_confirm_enabled: response.data.whatsapp_confirm_enabled !== false
      });
    } catch (error) {
      console.error('Erreur chargement config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key) => {
    const newConfig = { ...config, [key]: !config[key] };
    setConfig(newConfig);
    
    setSaving(true);
    try {
      await axios.put(`${API_URL}/config/bot`, newConfig);
      setMessage({ text: 'Configuration mise à jour', type: 'success' });
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      setMessage({ text: 'Erreur lors de la sauvegarde', type: 'error' });
      // Recharger pour annuler le changement local
      loadConfig();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="bot-config loading">Chargement...</div>;

  return (
    <div className="bot-config">
      <h2>Configuration du Bot</h2>
      
      {message.text && (
        <div className={`message ${message.type}`}>{message.text}</div>
      )}

      <div className="config-card">
        <div className="config-item">
          <div className="config-info">
            <h3>Réponses IA (Groq)</h3>
            <p>Active ou désactive les réponses automatiques via l'IA Groq</p>
            <small>Quand désactivé, un message par défaut est envoyé</small>
          </div>
          <div className="config-toggle">
            <label className="switch">
              <input 
                type="checkbox" 
                checked={config.ia_enabled}
                onChange={() => handleToggle('ia_enabled')}
                disabled={saving}
              />
              <span className="slider round"></span>
            </label>
            <span className="toggle-label">
              {config.ia_enabled ? 'Activé' : 'Désactivé'}
            </span>
          </div>
        </div>

        <div className="config-item">
          <div className="config-info">
            <h3>Confirmation WhatsApp</h3>
            <p>Active ou désactive la commande "Confirmation WhatsApp"</p>
            <small>Quand désactivé, le message sera traité normalement</small>
          </div>
          <div className="config-toggle">
            <label className="switch">
              <input 
                type="checkbox" 
                checked={config.whatsapp_confirm_enabled}
                onChange={() => handleToggle('whatsapp_confirm_enabled')}
                disabled={saving}
              />
              <span className="slider round"></span>
            </label>
            <span className="toggle-label">
              {config.whatsapp_confirm_enabled ? 'Activé' : 'Désactivé'}
            </span>
          </div>
        </div>
      </div>

      <div className="info-box">
        <h3>📊 État actuel</h3>
        <p>
          <strong>IA Groq:</strong> {config.ia_enabled ? '✅ Active' : '❌ Inactive'}<br/>
          <strong>WhatsApp Confirmation:</strong> {config.whatsapp_confirm_enabled ? '✅ Active' : '❌ Inactive'}
        </p>
        <p className="note">
          Note: Les modifications sont appliquées immédiatement pour les nouveaux messages.
        </p>
      </div>
    </div>
  );
}

export default BotConfig;