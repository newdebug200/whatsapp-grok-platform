import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const CONNECT_COOLDOWN_MS = 9000;

export default function BotConfig({ waStatus, onConnectWhatsApp, onLogoutWhatsApp }) {
  const [config, setConfig] = useState({
    bot_name: 'Botora',
    bot_info: '',
    bot_behavior: '',
    ia_enabled: true,
    response_delay_seconds: 5
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [waError, setWaError] = useState('');
  const [cooldownLeft, setCooldownLeft] = useState(0);

  // Sensitive keywords state
  const [keywords, setKeywords] = useState([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [kwSaving, setKwSaving] = useState(false);
  const [kwMsg, setKwMsg] = useState('');

  const cooldownTimer = useRef(null);
  const cooldownInterval = useRef(null);

  useEffect(() => { loadConfig(); loadKeywords(); }, []);

  useEffect(() => {
    const { status, qrCode, isConnected } = waStatus;

    if (qrCode || isConnected) {
      setConnecting(false);
      setWaError('');
      clearCooldown();
    }

    if (status === 'error' || status === 'auth_failure') {
      setConnecting(false);
      const msg = waStatus.message || (
        status === 'auth_failure'
          ? 'Authentification WhatsApp refusée. Relancez et scannez le QR code.'
          : 'Chrome ne démarre pas correctement. Assurez-vous que Google Chrome est installé.'
      );
      setWaError(msg);
      startCooldown();
    }

    if (status === 'cooldown') {
      setConnecting(false);
      setWaError(waStatus.message || 'Veuillez patienter avant de réessayer.');
    }

    if (status === 'disconnected') {
      setConnecting(false);
      setWaError('');
      clearCooldown();
    }
  }, [waStatus]);

  const startCooldown = () => {
    clearCooldown();
    setCooldownLeft(Math.ceil(CONNECT_COOLDOWN_MS / 1000));
    cooldownInterval.current = setInterval(() => {
      setCooldownLeft(prev => {
        if (prev <= 1) { clearCooldown(); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const clearCooldown = () => {
    clearInterval(cooldownInterval.current);
    clearTimeout(cooldownTimer.current);
    setCooldownLeft(0);
  };

  useEffect(() => () => clearCooldown(), []);

  const loadConfig = async () => {
    try {
      const res = await axios.get(`${API_URL}/config/bot`);
      setConfig(res.data);
    } catch (err) {
      console.error('Erreur chargement config:', err);
    }
  };

  const loadKeywords = async () => {
    try {
      const res = await axios.get(`${API_URL}/config/keywords`);
      setKeywords(res.data);
    } catch {}
  };

  const handleAddKeyword = async () => {
    const kw = newKeyword.trim();
    if (!kw) return;
    setKwSaving(true);
    setKwMsg('');
    try {
      const res = await axios.post(`${API_URL}/config/keywords`, { keyword: kw });
      setKeywords(prev => [...prev, res.data]);
      setNewKeyword('');
    } catch (err) {
      setKwMsg(err.response?.data?.error || 'Erreur lors de l\'ajout.');
    } finally {
      setKwSaving(false);
    }
  };

  const handleToggleKeyword = async (kw) => {
    try {
      const res = await axios.patch(`${API_URL}/config/keywords/${kw.id}`, { is_active: !kw.is_active });
      setKeywords(prev => prev.map(k => k.id === kw.id ? res.data : k));
    } catch {}
  };

  const handleDeleteKeyword = async (id) => {
    try {
      await axios.delete(`${API_URL}/config/keywords/${id}`);
      setKeywords(prev => prev.filter(k => k.id !== id));
    } catch {}
  };

  const handleKwKeyDown = (e) => {
    if (e.key === 'Enter') handleAddKeyword();
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
    if (connecting || cooldownLeft > 0) return;
    setWaError('');
    setConnecting(true);
    onConnectWhatsApp();
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try { await onLogoutWhatsApp(); }
    finally { setDisconnecting(false); }
  };

  const isConnectDisabled = connecting || cooldownLeft > 0;

  const connectLabel = () => {
    if (connecting) return 'Connexion...';
    if (cooldownLeft > 0) return `Réessayer (${cooldownLeft}s)`;
    return 'Connecter WhatsApp';
  };

  const formatDelay = (s) => {
    if (s < 60) return `${s} seconde${s > 1 ? 's' : ''}`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r === 0 ? `${m} min` : `${m}min ${r}s`;
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
              <button className="btn-connect" onClick={handleConnect} disabled={isConnectDisabled}>
                {connectLabel()}
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
              <div className="qr-waiting-desc">Le QR code va apparaître dans quelques secondes (jusqu'à 30s). Ne cliquez pas à nouveau.</div>
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

        {waError && (
          <div className="wa-error-banner">
            <strong>Erreur :</strong> {waError}
            {cooldownLeft > 0 && <span className="wa-error-retry"> — réessai possible dans {cooldownLeft}s</span>}
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

        <div className="field-group" style={{ marginTop: 16 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Délai de regroupement des messages</span>
            <span style={{ fontWeight: 600, color: 'var(--accent, #25d366)', fontSize: '0.85rem' }}>
              {formatDelay(config.response_delay_seconds ?? 5)}
            </span>
          </label>
          <input
            type="range"
            min="1"
            max="300"
            step="1"
            value={config.response_delay_seconds ?? 5}
            onChange={e => setConfig({ ...config, response_delay_seconds: parseInt(e.target.value) })}
            style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent, #25d366)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary, #888)', marginTop: 2 }}>
            <span>1s</span>
            <span style={{ fontSize: '0.7rem' }}>Délai avant que le bot réponde après le dernier message reçu</span>
            <span>5min</span>
          </div>
        </div>

        {error && <div className="config-error">{error}</div>}

        <button className="save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Sauvegarde...' : saved ? '✓ Sauvegardé !' : 'Sauvegarder'}
        </button>
      </div>

      {/* ── Sujets sensibles ── */}
      <div className="config-section" style={{ marginTop: 24 }}>
        <div className="section-label">Sujets sensibles</div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #888)', marginBottom: 14, lineHeight: 1.5 }}>
          Si un message reçu contient l'un de ces mots, le bot se tait automatiquement et la conversation est transmise à un humain.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            type="text"
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
            onKeyDown={handleKwKeyDown}
            placeholder="Ex : avocat, remboursement, plainte…"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border, #e0e0e0)', fontSize: '0.9rem', background: 'var(--bg-secondary, #f5f5f5)', color: 'var(--text-primary, #111)' }}
          />
          <button
            onClick={handleAddKeyword}
            disabled={kwSaving || !newKeyword.trim()}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent, #25d366)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', opacity: (!newKeyword.trim() || kwSaving) ? 0.5 : 1 }}
          >
            + Ajouter
          </button>
        </div>

        {kwMsg && (
          <div style={{ background: '#fdecea', color: '#c0392b', borderRadius: 6, padding: '6px 10px', fontSize: '0.82rem', marginBottom: 8 }}>
            {kwMsg}
          </div>
        )}

        {keywords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '18px 0', color: 'var(--text-secondary, #aaa)', fontSize: '0.85rem' }}>
            Aucun mot-clé configuré
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {keywords.map(kw => (
              <div
                key={kw.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'var(--bg-secondary, #f5f5f5)',
                  border: '1px solid var(--border, #e0e0e0)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  opacity: kw.is_active ? 1 : 0.5
                }}
              >
                <span style={{ fontSize: '1rem' }}>🔑</span>
                <span style={{ flex: 1, fontWeight: 500, fontSize: '0.9rem', color: 'var(--text-primary, #111)' }}>
                  {kw.keyword}
                </span>
                <button
                  onClick={() => handleToggleKeyword(kw)}
                  title={kw.is_active ? 'Désactiver' : 'Activer'}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 20,
                    border: '1px solid var(--border, #ddd)',
                    background: kw.is_active ? '#eafbea' : 'var(--bg-primary, #fff)',
                    color: kw.is_active ? '#27ae60' : 'var(--text-secondary, #999)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {kw.is_active ? 'Actif' : 'Inactif'}
                </button>
                <button
                  onClick={() => handleDeleteKeyword(kw.id)}
                  title="Supprimer"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#e74c3c',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    padding: '2px 4px',
                    lineHeight: 1
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
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
