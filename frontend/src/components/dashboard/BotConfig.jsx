import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function BotConfig({ waStatus, onConnectWhatsApp, onLogoutWhatsApp }) {
  const [config, setConfig] = useState({
    bot_name: 'Botora',
    bot_info: '',
    bot_behavior: '',
    ia_enabled: true
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => { loadConfig(); }, []);

  useEffect(() => {
    if (waStatus.qrCode) setConnecting(false);
    if (waStatus.isConnected) setConnecting(false);
    if (waStatus.status === 'error' || waStatus.status === 'auth_failure') setConnecting(false);
  }, [waStatus]);

  const loadConfig = async () => {
    try {
      const res = await axios.get(`${API_URL}/config/bot`);
      setConfig(res.data);
    } catch (err) {
      console.error('Erreur chargement config:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await axios.put(`${API_URL}/config/bot`, config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la sauvegarde. Vérifiez que le serveur est en marche.');
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = () => {
    setConnecting(true);
    onConnectWhatsApp();
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await onLogoutWhatsApp();
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="panel-content">
      <div className="panel-title">Configuration du Bot</div>

      <div className="wa-section">
        <div className="section-label">WhatsApp</div>
        <div className={`wa-status-row ${waStatus.isConnected ? 'connected' : 'disconnected'}`}>
          <span className="wa-dot" />
          <span>{waStatus.isConnected ? 'Connecté' : 'Non connecté'}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {!waStatus.isConnected && (
              <button className="btn-connect" onClick={handleConnect} disabled={connecting}>
                {connecting ? 'Connexion...' : 'Connecter WhatsApp'}
              </button>
            )}
            {waStatus.isConnected && (
              <button className="btn-disconnect" onClick={handleDisconnect} disabled={disconnecting}>
                {disconnecting ? 'Déconnexion...' : 'Déconnecter'}
              </button>
            )}
          </div>
        </div>

        {connecting && !waStatus.qrCode && (
          <div className="qr-waiting">
            <div className="qr-waiting-spinner" />
            <div>
              <div className="qr-waiting-title">Connexion en cours…</div>
              <div className="qr-waiting-desc">Le QR code va apparaître dans quelques secondes (jusqu'à 30s). Soyez patient.</div>
            </div>
          </div>
        )}

        {waStatus.qrCode && (
          <div className="qr-wrapper">
            <p className="qr-instructions">Scannez ce QR code avec votre WhatsApp</p>
            <QRCodeDisplay value={waStatus.qrCode} />
            <p className="qr-steps">
              WhatsApp → ⋮ Menu → Appareils reliés → Relier un appareil
            </p>
          </div>
        )}

        {(waStatus.status === 'error' || waStatus.status === 'auth_failure') && (
          <div className="wa-error-banner">
            Erreur de connexion WhatsApp. Vérifiez que Chrome/Chromium est installé et réessayez.
          </div>
        )}
      </div>

      <div className="config-section">
        <div className="section-label">Identité du bot</div>

        <div className="field-group">
          <label>Nom du bot</label>
          <input
            type="text"
            value={config.bot_name}
            onChange={e => setConfig({ ...config, bot_name: e.target.value })}
            placeholder="Botora"
          />
        </div>

        <div className="field-group">
          <label>Informations à sa disposition</label>
          <textarea
            value={config.bot_info}
            onChange={e => setConfig({ ...config, bot_info: e.target.value })}
            placeholder={`Décrivez ici tout ce que le bot doit connaître : produits, services, tarifs, adresses, horaires…\n\nExemple :\n- Nous vendons des vêtements en ligne\n- Livraison gratuite dès 50€\n- Retours acceptés sous 14 jours`}
            rows={7}
          />
        </div>

        <div className="field-group">
          <label>Comportement & ton souhaité</label>
          <textarea
            value={config.bot_behavior}
            onChange={e => setConfig({ ...config, bot_behavior: e.target.value })}
            placeholder={`Décrivez comment le bot doit se comporter.\n\nExemple :\n- Répondre en français uniquement\n- Être chaleureux et professionnel\n- Limiter les réponses à 3 phrases maximum`}
            rows={6}
          />
        </div>

        <div className="toggle-row">
          <div>
            <div className="toggle-label">Intelligence Artificielle</div>
            <div className="toggle-desc">Le bot répond automatiquement grâce à l'IA</div>
          </div>
          <button
            className={`toggle-btn ${config.ia_enabled ? 'on' : 'off'}`}
            onClick={() => setConfig({ ...config, ia_enabled: !config.ia_enabled })}
          >
            <span className="toggle-knob" />
          </button>
        </div>

        {error && <div className="config-error">{error}</div>}

        <button className="save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Sauvegarde...' : saved ? '✓ Sauvegardé !' : 'Sauvegarder'}
        </button>
      </div>
    </div>
  );
}

function QRCodeDisplay({ value }) {
  const canvasRef = React.useRef(null);

  useEffect(() => {
    if (!value || !canvasRef.current) return;
    import('qrcode').then(mod => {
      const QRCode = mod.default || mod;
      QRCode.toCanvas(canvasRef.current, value, { width: 220, margin: 2 }, err => {
        if (err) console.error('QR error:', err);
      });
    }).catch(err => console.error('Import qrcode failed:', err));
  }, [value]);

  return (
    <div className="qr-canvas-wrapper">
      <canvas ref={canvasRef} />
    </div>
  );
}
