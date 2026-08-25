import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import './AdminPanel.css';
import SubscriptionManager from './SubscriptionManager';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─────────────────────────────────────────────────────────────
// Platform Config Section
// ─────────────────────────────────────────────────────────────
function PlatformConfigSection() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const showMsg = (text, error = false) => {
    setMsg({ text, error });
    setTimeout(() => setMsg(null), 3500);
  };

  const loadConfig = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/admin/platform-config`);
      setConfig(r.data);
    } catch {
      setConfig({});
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleToggle = async (key) => {
    const newVal = config[key] === 'true' ? 'false' : 'true';
    const optimistic = { ...config, [key]: newVal };
    setConfig(optimistic);
    try {
      await axios.put(`${API_URL}/admin/platform-config`, { [key]: newVal });
    } catch {
      setConfig(config);
      showMsg('Erreur lors de la mise à jour', true);
    }
  };

  const handleCreditRateChange = async (e) => {
    const val = e.target.value;
    setConfig(prev => ({ ...prev, credit_per_1000_tokens: val }));
  };

  const handleCreditRateSave = async () => {
    const val = parseFloat(config.credit_per_1000_tokens);
    if (isNaN(val) || val < 0) return showMsg('Taux invalide', true);
    setSaving(true);
    try {
      await axios.put(`${API_URL}/admin/platform-config`, { credit_per_1000_tokens: String(val) });
      showMsg('Configuration sauvegardée');
    } catch {
      showMsg('Erreur lors de la sauvegarde', true);
    } finally {
      setSaving(false);
    }
  };

  const handleFreeCreditsChange = async (e) => {
    const val = e.target.value;
    setConfig(prev => ({ ...prev, new_user_free_credits: val }));
  };

  const handleFreeCreditsBlur = async () => {
    const val = parseFloat(config.new_user_free_credits);
    if (isNaN(val) || val < 0) return;
    try {
      await axios.put(`${API_URL}/admin/platform-config`, { new_user_free_credits: String(val) });
    } catch {}
  };

  if (!config) return <div className="admin-cfg-loading">Chargement…</div>;

  const flags = [
    { key: 'ia_enabled_global', label: 'Bot IA global', desc: "Active/désactive le bot IA pour toute la plateforme" },
    { key: 'campaigns_enabled', label: 'Campagnes (broadcasts)', desc: "Active/désactive les campagnes marketing pour tous les utilisateurs" },
    { key: 'sensitive_keywords_enabled', label: 'Mots-clés sensibles', desc: "Active/désactive la détection de mots-clés sensibles" },
    { key: 'verification_triggers_enabled', label: 'Triggers de vérification', desc: "Active/désactive la vérification WhatsApp via triggers" },
    { key: 'credits_enabled', label: 'Système de crédits', desc: "Active la facturation à la consommation (tokens → crédits)" },
  ];

  return (
    <div className="admin-cfg-section">
      <div className="admin-cfg-header">
        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" className="admin-cfg-icon">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
        </svg>
        <div>
          <h3 className="admin-cfg-title">Fonctionnalités de la plateforme</h3>
          <p className="admin-cfg-desc">Activez ou désactivez les modules de Botora pour tous les utilisateurs.</p>
        </div>
      </div>

      {msg && <div className={`admin-cfg-msg ${msg.error ? 'error' : 'success'}`}>{msg.text}</div>}

      <div className="admin-cfg-flags">
        {flags.map(f => (
          <div key={f.key} className="admin-cfg-flag-row">
            <div className="admin-cfg-flag-info">
              <div className="admin-cfg-flag-label">{f.label}</div>
              <div className="admin-cfg-flag-desc">{f.desc}</div>
            </div>
            <label className="admin-cfg-toggle">
              <input
                type="checkbox"
                checked={config[f.key] === 'true'}
                onChange={() => handleToggle(f.key)}
              />
              <span className="admin-cfg-toggle-track">
                <span className="admin-cfg-toggle-thumb" />
              </span>
              <span className="admin-cfg-toggle-state">{config[f.key] === 'true' ? 'Actif' : 'Inactif'}</span>
            </label>
          </div>
        ))}
      </div>

      {config.credits_enabled === 'true' && (
        <div className="admin-cfg-credit-settings">
          <div className="admin-cfg-credit-row">
            <label className="admin-cfg-credit-label">Crédits par 1 000 tokens</label>
            <div className="admin-cfg-credit-input-row">
              <input
                type="number"
                min="0"
                step="0.1"
                className="admin-cfg-credit-input"
                value={config.credit_per_1000_tokens ?? '1'}
                onChange={handleCreditRateChange}
              />
              <button
                className="admin-cfg-credit-save-btn"
                onClick={handleCreditRateSave}
                disabled={saving}
              >
                {saving ? '…' : 'Sauvegarder'}
              </button>
            </div>
          </div>
          <div className="admin-cfg-credit-row">
            <label className="admin-cfg-credit-label">Crédits offerts à l'inscription</label>
            <input
              type="number"
              min="0"
              step="1"
              className="admin-cfg-credit-input"
              value={config.new_user_free_credits ?? '0'}
              onChange={handleFreeCreditsChange}
              onBlur={handleFreeCreditsBlur}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Credits Management Section
// ─────────────────────────────────────────────────────────────
function CreditsSection({ users }) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [creditData, setCreditData] = useState(null);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState(null);

  const showMsg = (text, error = false) => {
    setMsg({ text, error });
    setTimeout(() => setMsg(null), 3500);
  };

  const loadCredits = useCallback(async (userId) => {
    if (!userId) return;
    setLoadingCredits(true);
    try {
      const r = await axios.get(`${API_URL}/admin/users/${userId}/credits`);
      setCreditData(r.data);
    } catch {
      setCreditData(null);
    } finally {
      setLoadingCredits(false);
    }
  }, []);

  useEffect(() => {
    if (selectedUserId) loadCredits(selectedUserId);
  }, [selectedUserId, loadCredits]);

  useEffect(() => {
    if (users.length > 0 && !selectedUserId) {
      setSelectedUserId(String(users[0].id));
    }
  }, [users, selectedUserId]);

  const handleAddCredits = async () => {
    const amount = parseFloat(addAmount);
    if (isNaN(amount) || amount === 0) return showMsg('Montant invalide', true);
    setAdding(true);
    try {
      const r = await axios.post(`${API_URL}/admin/users/${selectedUserId}/credits`, {
        amount,
        description: addDesc.trim() || undefined
      });
      setCreditData(prev => ({
        account: r.data.account,
        transactions: prev?.transactions || []
      }));
      await loadCredits(selectedUserId);
      setAddAmount('');
      setAddDesc('');
      showMsg(`${amount > 0 ? '+' : ''}${amount} crédits appliqués`);
    } catch (err) {
      showMsg(err.response?.data?.error || 'Erreur', true);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="admin-credits-section">
      <div className="admin-credits-header">
        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" className="admin-credits-icon">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z"/>
        </svg>
        <div>
          <h3 className="admin-credits-title">Gestion des crédits</h3>
          <p className="admin-credits-desc">Rechargez ou ajustez le solde de crédits de chaque utilisateur.</p>
        </div>
      </div>

      {msg && <div className={`admin-credits-msg ${msg.error ? 'error' : 'success'}`}>{msg.text}</div>}

      <div className="admin-credits-select-row">
        <label className="admin-credits-label">Utilisateur</label>
        <select
          className="admin-credits-select"
          value={selectedUserId}
          onChange={e => setSelectedUserId(e.target.value)}
        >
          {users.map(u => (
            <option key={u.id} value={String(u.id)}>
              {u.name} ({u.email}) — {u.credit_balance?.toFixed(2) ?? '0.00'} crédits
            </option>
          ))}
        </select>
      </div>

      {loadingCredits ? (
        <div className="admin-credits-loading">Chargement…</div>
      ) : creditData ? (
        <>
          <div className="admin-credits-balance-card">
            <div className="admin-credits-balance-label">Solde actuel</div>
            <div className="admin-credits-balance-value">{creditData.account.credit_balance?.toFixed(2)} crédits</div>
          </div>

          <div className="admin-credits-add-form">
            <div className="admin-credits-add-row">
              <input
                type="number"
                step="1"
                className="admin-credits-amount-input"
                placeholder="Montant (ex: 100 ou -50)"
                value={addAmount}
                onChange={e => setAddAmount(e.target.value)}
              />
              <input
                type="text"
                className="admin-credits-desc-input"
                placeholder="Description (optionnel)"
                value={addDesc}
                onChange={e => setAddDesc(e.target.value)}
                maxLength={100}
              />
              <button
                className="admin-credits-add-btn"
                onClick={handleAddCredits}
                disabled={adding || !addAmount}
              >
                {adding ? '…' : 'Appliquer'}
              </button>
            </div>
            <div className="admin-credits-hint">Valeur positive = rechargement, valeur négative = déduction</div>
          </div>

          {creditData.transactions.length > 0 && (
            <div className="admin-credits-history">
              <div className="admin-credits-history-title">Historique (50 dernières opérations)</div>
              <div className="admin-credits-history-list">
                {creditData.transactions.map(t => (
                  <div key={t.id} className={`admin-credits-tx ${t.amount >= 0 ? 'credit' : 'debit'}`}>
                    <div className="admin-credits-tx-left">
                      <span className="admin-credits-tx-amount">{t.amount >= 0 ? '+' : ''}{t.amount.toFixed(4)}</span>
                      <span className="admin-credits-tx-desc">{t.description || '—'}</span>
                      {t.tokens_used && <span className="admin-credits-tx-tokens">{t.tokens_used} tokens</span>}
                    </div>
                    <span className="admin-credits-tx-date">{formatDateTime(t.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Verification Section
// ─────────────────────────────────────────────────────────────
function VerificationSection() {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [triggers, setTriggers] = useState([]);
  const [newText, setNewText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const showMsg = (text, error = false) => {
    setMsg({ text, error });
    setTimeout(() => setMsg(null), 3500);
  };

  useEffect(() => {
    axios.get(`${API_URL}/admin/profiles`)
      .then(r => {
        setProfiles(r.data);
        if (r.data.length > 0) setSelectedProfileId(String(r.data[0].id));
      })
      .catch(() => {});
  }, []);

  const loadTriggers = useCallback(async (profileId) => {
    if (!profileId) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/verification-triggers/${profileId}`);
      setTriggers(r.data);
    } catch {
      setTriggers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProfileId) loadTriggers(selectedProfileId);
  }, [selectedProfileId, loadTriggers]);

  const handleAdd = async () => {
    if (!newText.trim() || !selectedProfileId) return;
    setSaving(true);
    try {
      const r = await axios.post(`${API_URL}/admin/verification-triggers`, {
        profile_id: parseInt(selectedProfileId),
        text: newText.trim()
      });
      setTriggers(prev => [...prev, r.data]);
      setNewText('');
      showMsg('Déclencheur ajouté');
    } catch (err) {
      showMsg(err.response?.data?.error || 'Erreur', true);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (trigger) => {
    try {
      const r = await axios.patch(`${API_URL}/admin/verification-triggers/${trigger.id}`, {
        is_active: !trigger.is_active
      });
      setTriggers(prev => prev.map(t => t.id === trigger.id ? r.data : t));
    } catch {
      showMsg('Erreur mise à jour', true);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_URL}/admin/verification-triggers/${id}`);
      setTriggers(prev => prev.filter(t => t.id !== id));
      showMsg('Déclencheur supprimé');
    } catch {
      showMsg('Erreur suppression', true);
    }
  };

  return (
    <div className="admin-verif-section">
      <div className="admin-verif-header">
        <div className="admin-verif-title-row">
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" className="admin-verif-icon">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
          </svg>
          <h3 className="admin-verif-title">Vérification WhatsApp</h3>
        </div>
        <p className="admin-verif-desc">
          Quand un utilisateur envoie exactement l'un de ces textes, le bot vérifie son numéro via l'API externe et lui renvoie le résultat. L'IA ne répond pas.
        </p>
      </div>

      {profiles.length === 0 ? (
        <div className="admin-verif-empty-profiles">Aucun profil WhatsApp configuré.</div>
      ) : (
        <>
          <div className="admin-verif-profile-row">
            <label className="admin-verif-label">Profil WhatsApp</label>
            <select
              className="admin-verif-select"
              value={selectedProfileId}
              onChange={e => setSelectedProfileId(e.target.value)}
            >
              {profiles.map(p => (
                <option key={p.id} value={String(p.id)}>
                  {p.phone_number}{p.display_name ? ` — ${p.display_name}` : ''}{p.is_connected ? ' ●' : ''}
                </option>
              ))}
            </select>
          </div>

          {msg && (
            <div className={`admin-verif-msg ${msg.error ? 'error' : 'success'}`}>{msg.text}</div>
          )}

          <div className="admin-verif-add-row">
            <input
              className="admin-verif-input"
              type="text"
              placeholder="Texte déclencheur exact (ex: confirm whatsapp)"
              value={newText}
              onChange={e => setNewText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button
              className="admin-verif-add-btn"
              onClick={handleAdd}
              disabled={saving || !newText.trim()}
            >
              {saving ? '…' : '+ Ajouter'}
            </button>
          </div>

          {loading ? (
            <div className="admin-verif-loading">Chargement…</div>
          ) : triggers.length === 0 ? (
            <div className="admin-verif-no-triggers">Aucun déclencheur configuré pour ce profil.</div>
          ) : (
            <div className="admin-verif-list">
              {triggers.map(t => (
                <div key={t.id} className={`admin-verif-item ${t.is_active ? 'active' : 'inactive'}`}>
                  <span className="admin-verif-item-text">"{t.text}"</span>
                  <div className="admin-verif-item-actions">
                    <label className="admin-verif-toggle" title={t.is_active ? 'Désactiver' : 'Activer'}>
                      <input
                        type="checkbox"
                        checked={t.is_active}
                        onChange={() => handleToggle(t)}
                      />
                      <span className="admin-verif-toggle-track">
                        <span className="admin-verif-toggle-thumb" />
                      </span>
                      <span className="admin-verif-toggle-label">{t.is_active ? 'Actif' : 'Inactif'}</span>
                    </label>
                    <button
                      className="admin-verif-delete-btn"
                      onClick={() => handleDelete(t.id)}
                      title="Supprimer"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// Dressur Queue Section
// ─────────────────────────────────────────────────────────────
function DressurQueueSection() {
  const [profiles, setProfiles] = useState([]);
  const [profileId, setProfileId] = useState('');
  const [queue, setQueue] = useState(null);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [minDelay, setMinDelay] = useState(10);
  const [maxDelay, setMaxDelay] = useState(30);
  const [batchSize, setBatchSize] = useState(10);
  const [order, setOrder] = useState('asc');
  const [source, setSource] = useState('online');
  const [localItems, setLocalItems] = useState([]);
  const [status, setStatus] = useState({ running: false, paused: false, sent: 0, failed: 0, total: 0, nextIndex: 0, current: null, results: [], pending: [] });
  const [msg, setMsg] = useState(null);
  const pollRef = useRef(null);

  const showMsg = (text, error = false) => {
    setMsg({ text, error });
    setTimeout(() => setMsg(null), 4000);
  };

  const refreshStatus = useCallback(async () => {
    try { const r = await axios.get(`${API_URL}/admin/dressur-queue/status`); setStatus(r.data); return r.data; } catch (_) { return null; }
  }, []);

  useEffect(() => {
    axios.get(`${API_URL}/admin/profiles`).then(r => { setProfiles(r.data); if (r.data.length > 0) setProfileId(String(r.data[0].id)); }).catch(() => {});
    refreshStatus();
  }, [refreshStatus]);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const data = await refreshStatus();
      if (data && !data.running) { clearInterval(pollRef.current); pollRef.current = null; }
    }, 1000);
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const loadQueue = async () => {
    setLoadingQueue(true); setMsg(null);
    try { const r = await axios.get(`${API_URL}/admin/dressur-queue`); setQueue(r.data.items); setBatchSize(prev => Math.min(Math.max(1, prev), Math.max(1, r.data.items.length))); }
    catch (err) { showMsg(err.response?.data?.error || 'Erreur de connexion à dressur.site', true); }
    finally { setLoadingQueue(false); }
  };

  const loadLocalQueue = async () => {
    try { const r = await axios.get(`${API_URL}/admin/dressur-queue/local`); setLocalItems(r.data.items || []); setBatchSize(prev => Math.min(Math.max(1, prev), Math.max(1, r.data.count || 1))); }
    catch (err) { showMsg(err.response?.data?.error || 'Impossible de lire la file locale', true); }
  };

  const syncLocalQueue = async () => {
    try { const r = await axios.post(`${API_URL}/admin/dressur-queue/local/sync`); setLocalItems(r.data.items || []); setQueue(r.data.items || []); showMsg(`${r.data.count || 0} message(s) synchronisé(s) localement`); }
    catch (err) { showMsg(err.response?.data?.error || 'Synchronisation impossible', true); }
  };

  const clearLocalQueue = async () => {
    if (!window.confirm('Vider toute la file locale ? Les statuts locaux seront supprimés.')) return;
    try { await axios.delete(`${API_URL}/admin/dressur-queue/local`); setLocalItems([]); showMsg('File locale vidée'); }
    catch (err) { showMsg(err.response?.data?.error || 'Impossible de vider la file locale', true); }
  };

  const handleStart = async () => {
    if (!profileId) return showMsg('Sélectionnez un profil WhatsApp', true);
    const min = Number(minDelay), max = Number(maxDelay), batch = Number(batchSize);
    if (min > max) return showMsg('Le délai minimum doit être ≤ au maximum', true);
    if (!Number.isInteger(batch) || batch < 1) return showMsg('Le nombre de messages doit être supérieur à 0', true);
    try {
      const startResponse = await axios.post(`${API_URL}/admin/dressur-queue/start`, { profileId: parseInt(profileId), minDelay: min, maxDelay: max, batchSize: batch, order, source });
      await refreshStatus(); startPolling(); showMsg(startResponse.data?.resumed ? 'Envoi repris' : 'Envoi démarré');
    } catch (err) { showMsg(err.response?.data?.error || 'Erreur lors du démarrage', true); }
  };

  const handleStop = async () => {
    try { await axios.post(`${API_URL}/admin/dressur-queue/stop`); await refreshStatus(); if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } showMsg('Envoi mis en pause'); }
    catch (err) { showMsg(err.response?.data?.error || 'Erreur lors de la mise en pause', true); }
  };

  const isRunning = status?.running === true;
  const results = status?.results || [];
  const processed = status?.processed ?? ((status?.sent || 0) + (status?.failed || 0));
  const pct = status?.total > 0 ? Math.round((processed / status.total) * 100) : 0;
  const pending = status?.pending || (queue || []).map((item, i) => ({ ...item, index: i + 1, status: 'pending' }));

  return (
    <div className="admin-dressur-section">
      <div className="admin-dressur-header">
        <div className="admin-dressur-title-row"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" className="admin-dressur-icon"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg><h3 className="admin-dressur-title">File d'attente WhatsApp — dressur.site</h3></div>
        <p className="admin-dressur-desc">Choisissez l’ordre et le nombre de messages à envoyer. La pause reprend exactement au prochain numéro en attente.</p>
      </div>
      {msg && <div className={`admin-dressur-msg ${msg.error ? 'error' : 'success'}`}>{msg.text}</div>}
      <div className="admin-dressur-controls">
        <div className="admin-dressur-row"><label className="admin-dressur-label">Profil WhatsApp</label><select className="admin-verif-select" value={profileId} onChange={e => setProfileId(e.target.value)} disabled={isRunning}>{profiles.length === 0 && <option value="">Aucun profil</option>}{profiles.map(p => <option key={p.id} value={String(p.id)}>{p.phone_number}{p.display_name ? ` — ${p.display_name}` : ''}{p.is_connected ? ' ●' : ''}</option>)}</select></div>
        <div className="admin-dressur-row"><label className="admin-dressur-label">Source de la file</label><select className="admin-verif-select" value={source} onChange={e => { setSource(e.target.value); if (e.target.value === 'local') loadLocalQueue(); }} disabled={isRunning}><option value="online">File en ligne (dressur.site)</option><option value="local">File locale (base Botora)</option></select></div>
        <div className="admin-dressur-row"><label className="admin-dressur-label">Gestion de la file locale</label><div className="admin-dressur-delay-row"><button className="admin-dressur-fetch-btn" onClick={syncLocalQueue} disabled={isRunning}>↻ Recharger depuis le site</button><button className="admin-dressur-fetch-btn" onClick={loadLocalQueue} disabled={isRunning}>Lire le local</button><button className="admin-dressur-stop-btn" onClick={clearLocalQueue} disabled={isRunning}>Vider le local</button></div></div>
        <div className="admin-dressur-row"><label className="admin-dressur-label">Ordre des numéros</label><select className="admin-verif-select" value={order} onChange={e => setOrder(e.target.value)} disabled={isRunning}><option value="asc">Croissant</option><option value="desc">Décroissant</option><option value="random">Aléatoire</option></select></div>
        <div className="admin-dressur-row"><label className="admin-dressur-label">Messages à envoyer maintenant</label><input type="number" min="1" max="100000" className="admin-dressur-delay-input" value={batchSize} onChange={e => setBatchSize(Math.max(1, parseInt(e.target.value) || 1))} disabled={isRunning} /><span className="admin-dressur-delay-hint">dans la liste restante</span></div>
        <div className="admin-dressur-row"><label className="admin-dressur-label">Délai aléatoire entre envois (sec)</label><div className="admin-dressur-delay-row"><span className="admin-dressur-delay-lbl">Min</span><input type="number" min="1" max="300" className="admin-dressur-delay-input" value={minDelay} onChange={e => setMinDelay(Math.max(1, parseInt(e.target.value) || 1))} disabled={isRunning} /><span className="admin-dressur-delay-lbl">Max</span><input type="number" min="1" max="300" className="admin-dressur-delay-input" value={maxDelay} onChange={e => setMaxDelay(Math.max(1, parseInt(e.target.value) || 1))} disabled={isRunning} /><span className="admin-dressur-delay-hint">secondes</span></div></div>
      </div>
      <div className="admin-dressur-actions"><button className="admin-dressur-fetch-btn" onClick={loadQueue} disabled={loadingQueue || isRunning}>{loadingQueue ? 'Chargement…' : '↻ Charger la file'}</button><button className="admin-dressur-start-btn" onClick={handleStart} disabled={isRunning || !profileId}>{status.paused ? '▶ Reprendre' : '▶ Déclencher'}</button><button className="admin-dressur-stop-btn" onClick={handleStop} disabled={!isRunning}>Ⅱ Pause</button></div>
      {(isRunning || processed > 0 || status.paused) && <div className="admin-dressur-progress"><div className="admin-dressur-progress-stats"><span className="admin-dressur-stat ok">✅ {status.sent} envoyés</span><span className="admin-dressur-stat ko">❌ {status.failed} échoués</span><span className="admin-dressur-stat tot">⏳ {Math.max(0, (status.total || 0) - processed)} en attente</span><span className="admin-dressur-stat tot">📋 {status.total} total</span><span className={`admin-dressur-badge ${isRunning ? 'running' : 'done'}`}>{isRunning ? 'En cours…' : status.paused ? 'En pause' : 'Terminé'}</span></div>{isRunning && status.current && <div className="admin-dressur-current">Envoi {status.current.index}/{status.total} → <strong>{status.current.numero}</strong></div>}{status.total > 0 && <div className="admin-dressur-bar-wrap"><div className="admin-dressur-bar-fill" style={{ width: `${pct}%` }} /><span className="admin-dressur-bar-pct">{pct}%</span></div>}</div>}
      {source === 'local' && localItems.length > 0 && <div className="admin-dressur-list-section"><div className="admin-dressur-list-title">File locale persistée ({localItems.length} messages)</div><div className="admin-dressur-list">{localItems.slice(0, 30).map(item => <div key={item.id} className="admin-dressur-item"><span className="admin-dressur-item-num">{item.numero}</span><span className="admin-dressur-item-msg">{item.status === 'sent' ? '✅ Envoyé' : item.status === 'failed' ? '❌ Échec' : '⏳ En attente'} — {String(item.message).slice(0, 70)}</span></div>)}{localItems.length > 30 && <div className="admin-dressur-more">+{localItems.length - 30} autres…</div>}</div></div>}
      {queue !== null && source !== 'local' && <div className="admin-dressur-list-section"><div className="admin-dressur-list-title">File source ({queue.length} messages) — ordre {order === 'asc' ? 'croissant' : order === 'desc' ? 'décroissant' : 'aléatoire'}</div><div className="admin-dressur-list">{queue.slice(0, 30).map((item, i) => <div key={i} className="admin-dressur-item"><span className="admin-dressur-item-num">{item.numero}</span><span className="admin-dressur-item-msg">{String(item.message).slice(0, 90)}{String(item.message).length > 90 ? '…' : ''}</span></div>)}{queue.length > 30 && <div className="admin-dressur-more">+{queue.length - 30} autres…</div>}</div></div>}
      {(results.length > 0 || pending.length > 0) && <div className="admin-dressur-results"><div className="admin-dressur-list-title">Suivi des numéros ({results.length + pending.length})</div><div className="admin-dressur-result-list">{results.map((r, i) => <div key={`result-${i}`} className={`admin-dressur-result-item ${r.status}`}><span className="admin-dressur-result-icon">{r.status === 'sent' ? '✅' : '❌'}</span><span className="admin-dressur-result-num">{r.numero}</span><span className="admin-dressur-result-preview">{r.status === 'sent' ? 'Message reçu' : 'Échec'}</span>{r.error && <span className="admin-dressur-result-err">{r.error}</span>}</div>)}{pending.slice(0, 100).map((r, i) => <div key={`pending-${i}`} className="admin-dressur-result-item pending"><span className="admin-dressur-result-icon">⏳</span><span className="admin-dressur-result-num">{r.numero}</span><span className="admin-dressur-result-preview">En attente</span></div>)}{pending.length > 100 && <div className="admin-dressur-more">+{pending.length - 100} numéros en attente…</div>}</div></div>}
    </div>
  );
}

// Main AdminPanel
// ─────────────────────────────────────────────────────────────
export default function AdminPanel({ section = 'overview' } = {}) {
  const { account: currentAccount } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [roleLoadingId, setRoleLoadingId] = useState(null);
  const [blockLoadingId, setBlockLoadingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get(`${API_URL}/admin/users`);
      setUsers(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const showMsg = (msg, isError = false) => {
    setActionMsg({ text: msg, error: isError });
    setTimeout(() => setActionMsg(null), 4000);
  };

  const handleDeleteConfirm = async (userId) => {
    setDeletingId(userId);
    try {
      const res = await axios.delete(`${API_URL}/admin/users/${userId}`);
      showMsg(res.data.message);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      showMsg(err.response?.data?.error || 'Erreur lors de la suppression', true);
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  const handleRoleToggle = async (user) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    setRoleLoadingId(user.id);
    try {
      await axios.patch(`${API_URL}/admin/users/${user.id}/role`, { role: newRole });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
      showMsg(`${user.name} est maintenant ${newRole === 'admin' ? 'administrateur' : 'utilisateur'}`);
    } catch (err) {
      showMsg(err.response?.data?.error || 'Erreur lors du changement de rôle', true);
    } finally {
      setRoleLoadingId(null);
    }
  };

  const handleBlockToggle = async (user) => {
    const newBlocked = !user.is_blocked;
    setBlockLoadingId(user.id);
    try {
      await axios.patch(`${API_URL}/admin/users/${user.id}/block`, { is_blocked: newBlocked });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_blocked: newBlocked } : u));
      showMsg(`${user.name} — compte ${newBlocked ? 'bloqué' : 'débloqué'}`);
    } catch (err) {
      showMsg(err.response?.data?.error || 'Erreur lors du blocage', true);
    } finally {
      setBlockLoadingId(null);
    }
  };

  const totalMessages = users.reduce((s, u) => s + u.msgSent + u.msgReceived, 0);
  const totalProfiles = users.reduce((s, u) => s + u.profileCount, 0);
  const totalContacts = users.reduce((s, u) => s + u.contactCount, 0);

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2 className="admin-title">Administration</h2>
        <button className="admin-refresh-btn" onClick={loadUsers} disabled={loading} title="Rafraîchir">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
          </svg>
        </button>
      </div>

      {section === 'features' && <PlatformConfigSection />}
      {section === 'verification' && <VerificationSection />}
      {section === 'dressur' && <DressurQueueSection />}
      {section === 'credits' && <CreditsSection users={users} />}
      {section === 'subscriptions' && <SubscriptionManager />}

      {(section === 'overview' || section === 'users') && <div className="admin-stats-row">
        <div className="admin-stat-card">
          <div className="admin-stat-value">{users.length}</div>
          <div className="admin-stat-label">Utilisateurs</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{totalProfiles}</div>
          <div className="admin-stat-label">Profils WhatsApp</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{totalContacts}</div>
          <div className="admin-stat-label">Contacts totaux</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{totalMessages}</div>
          <div className="admin-stat-label">Messages traités</div>
        </div>
      </div>}

      {(section === 'overview' || section === 'users') && actionMsg && (
        <div className={`admin-action-msg ${actionMsg.error ? 'error' : 'success'}`}>
          {actionMsg.text}
        </div>
      )}

      {(section === 'overview' || section === 'users') && (loading ? (
        <div className="admin-loading">Chargement des utilisateurs…</div>
      ) : error ? (
        <div className="admin-error">{error}</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Crédits</th>
                <th>Profils</th>
                <th>Contacts</th>
                <th>Msg reçus</th>
                <th>Msg envoyés</th>
                <th>FAQs</th>
                <th>Dernière activité</th>
                <th>Inscrit le</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className={`${user.id === currentAccount?.id ? 'admin-row-self' : ''} ${user.is_blocked ? 'admin-row-blocked' : ''}`}>
                  <td className="admin-cell-user">
                    <div className="admin-user-avatar">{user.name.charAt(0).toUpperCase()}</div>
                    <div>
                      <div className="admin-user-name">
                        {user.name}
                        {user.id === currentAccount?.id && <span className="admin-you-badge">moi</span>}
                      </div>
                      <div className="admin-user-email">{user.email}</div>
                    </div>
                  </td>
                  <td>
                    <span className={`admin-role-badge ${user.role}`}>
                      {user.role === 'admin' ? 'Admin' : 'User'}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-status-badge ${user.is_blocked ? 'blocked' : 'active'}`}>
                      {user.is_blocked ? '🔒 Bloqué' : '✓ Actif'}
                    </span>
                  </td>
                  <td className="admin-cell-num">
                    <span className={`admin-credits-badge ${user.credit_balance <= 0 ? 'empty' : ''}`}>
                      {(user.credit_balance ?? 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="admin-cell-num">{user.profileCount} {user.connectedProfiles > 0 && <span className="admin-connected-dot">●</span>}</td>
                  <td className="admin-cell-num">{user.contactCount}</td>
                  <td className="admin-cell-num">{user.msgReceived}</td>
                  <td className="admin-cell-num">{user.msgSent}</td>
                  <td className="admin-cell-num">{user.faqCount}</td>
                  <td className="admin-cell-date">{formatDateTime(user.lastActivity)}</td>
                  <td className="admin-cell-date">{formatDate(user.created_at)}</td>
                  <td className="admin-cell-actions">
                    {user.id !== currentAccount?.id && (
                      <>
                        <button
                          className="admin-btn-role"
                          onClick={() => handleRoleToggle(user)}
                          disabled={roleLoadingId === user.id}
                          title={user.role === 'admin' ? 'Rétrograder en utilisateur' : 'Promouvoir en admin'}
                        >
                          {roleLoadingId === user.id ? '…' : user.role === 'admin' ? '↓ User' : '↑ Admin'}
                        </button>
                        <button
                          className={`admin-btn-block ${user.is_blocked ? 'unblock' : 'block'}`}
                          onClick={() => handleBlockToggle(user)}
                          disabled={blockLoadingId === user.id}
                          title={user.is_blocked ? 'Débloquer' : 'Bloquer'}
                        >
                          {blockLoadingId === user.id ? '…' : user.is_blocked ? '🔓' : '🔒'}
                        </button>
                        <button
                          className="admin-btn-delete"
                          onClick={() => setConfirmDelete(user)}
                          disabled={deletingId === user.id}
                          title="Supprimer ce compte"
                        >
                          {deletingId === user.id ? '…' : <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {confirmDelete && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-modal">
            <div className="admin-confirm-title">Supprimer ce compte ?</div>
            <div className="admin-confirm-desc">
              Vous êtes sur le point de supprimer <strong>{confirmDelete.name}</strong> ({confirmDelete.email}) ainsi que toutes ses données (profils, contacts, messages, FAQs).
              <br /><strong>Cette action est irréversible.</strong>
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-confirm-cancel" onClick={() => setConfirmDelete(null)}>Annuler</button>
              <button
                className="admin-confirm-ok"
                onClick={() => handleDeleteConfirm(confirmDelete.id)}
                disabled={deletingId === confirmDelete.id}
              >
                {deletingId === confirmDelete.id ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
