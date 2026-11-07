import React, { useId, useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { confirmAction } from '../../utils/confirmAction';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const CONNECT_COOLDOWN_MS = 9000;
const KNOWLEDGE_CATEGORIES = [
  ['company', 'Présentation de l’entreprise'],
  ['catalog', 'Produits et services'],
  ['pricing', 'Tarifs et offres'],
  ['policies', 'Conditions et politiques'],
  ['support', 'Procédures de support'],
  ['faq', 'Questions fréquentes'],
  ['other', 'Autre document']
];

const PERSONALITIES = [
  { value: 'autonomous',  label: '🤖 Agent autonome', desc: 'Adapte son ton et sa manière de répondre au besoin et à l’émotion du client.' },
  { value: 'professional', label: '💼 Agent professionnel', desc: 'Courtois, clair et fiable, avec un ton adapté au contexte.' },
  { value: 'friendly',     label: '😊 Agent amical', desc: 'Chaleureux et naturel, avec des emojis utilisés avec modération.' },
  { value: 'commercial',   label: '🤝 Agent conseiller commercial', desc: 'Présente les bénéfices et accompagne la décision sans pression.' },
  { value: 'support',      label: '🛠️ Agent support technique', desc: 'Patient et méthodique, il guide le client étape par étape.' },
  { value: 'empathetic',   label: '💛 Agent empathique', desc: 'À l’écoute et respectueux, notamment face aux préoccupations ou réclamations.' },
  { value: 'concise',      label: '⚡ Agent concis et direct', desc: 'Va à l’essentiel et privilégie des réponses courtes et pratiques.' },
];

export default function BotConfig({ waStatus, onConnectWhatsApp, onLogoutWhatsApp, onResyncWhatsApp }) {
  const personalityGroupId = useId();
  const sensitiveTopicInputId = useId();
  const personalityTouchedRef = useRef(false);
  const [config, setConfig] = useState({
    bot_name: 'Botora',
    bot_info: '',
    bot_behavior: '',
    ia_enabled: false,
    response_delay_seconds: 120,
    personality: 'autonomous',
    sentiment_enabled: false,
    sentiment_alert: false,
    media_auto_reply: false,
    ia_group_enabled: false
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [waError, setWaError] = useState('');
  const [cooldownLeft, setCooldownLeft] = useState(0);

  const [knowledgeDocuments, setKnowledgeDocuments] = useState([]);
  const [activeKnowledgeDocument, setActiveKnowledgeDocument] = useState(null);
  const [knowledgeDraft, setKnowledgeDraft] = useState('');
  const [knowledgeCategory, setKnowledgeCategory] = useState('company');
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeSaving, setKnowledgeSaving] = useState(false);
  const [knowledgeEditing, setKnowledgeEditing] = useState(false);
  const [knowledgeDragActive, setKnowledgeDragActive] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState('');
  const [knowledgeNotice, setKnowledgeNotice] = useState('');

  const [keywords, setKeywords] = useState([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [kwSaving, setKwSaving] = useState(false);
  const [kwMsg, setKwMsg] = useState('');

  const cooldownTimer = useRef(null);
  const cooldownInterval = useRef(null);

  useEffect(() => { loadConfig(); loadKeywords(); loadKnowledgeDocuments(); }, []);

  useEffect(() => {
    const { status, qrCode, isConnected } = waStatus;
    if (qrCode || isConnected) { setConnecting(false); setWaError(''); clearCooldown(); }
    if (status === 'initializing') {
      setConnecting(true);
      setWaError('');
      clearCooldown();
    }
    if (status === 'error' || status === 'auth_failure') {
      setConnecting(false);
      const msg = waStatus.message || (status === 'auth_failure'
        ? 'Authentification WhatsApp refusée. Relancez et scannez le QR code.'
        : 'Chrome ne démarre pas correctement. Assurez-vous que Google Chrome est installé.');
      setWaError(msg);
      startCooldown();
    }
    if (status === 'cooldown') { setConnecting(false); setWaError(waStatus.message || 'Veuillez patienter avant de réessayer.'); }
    if (status === 'disconnected') { setConnecting(false); setWaError(''); clearCooldown(); }
  }, [waStatus]);

  const startCooldown = () => {
    clearCooldown();
    setCooldownLeft(Math.ceil(CONNECT_COOLDOWN_MS / 1000));
    cooldownInterval.current = setInterval(() => {
      setCooldownLeft(prev => { if (prev <= 1) { clearCooldown(); return 0; } return prev - 1; });
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
      setConfig(prev => ({
        ...prev,
        ...res.data,
        personality: personalityTouchedRef.current ? prev.personality : res.data.personality
      }));
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

  const loadKnowledgeDocuments = async () => {
    try {
      const response = await axios.get(`${API_URL}/knowledge-documents`);
      setKnowledgeDocuments(response.data);
    } catch (err) {
      setKnowledgeError(err.response?.data?.error || 'Impossible de charger les documents de référence.');
    }
  };

  const handleKnowledgeUpload = async (files) => {
    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) return;
    const availableSlots = Math.max(0, 20 - knowledgeDocuments.length);
    if (availableSlots === 0) {
      setKnowledgeError('Ce profil a déjà atteint la limite de 20 documents.');
      return;
    }

    const filesToProcess = selectedFiles.slice(0, availableSlots);
    const skippedCount = selectedFiles.length - filesToProcess.length;
    setKnowledgeLoading(true);
    setKnowledgeError('');
    setKnowledgeNotice('');
    let uploadedCount = 0;
    let lastUploaded = null;
    const errors = [];

    try {
      for (const [index, file] of filesToProcess.entries()) {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (!['pdf', 'docx', 'txt', 'csv', 'xlsx'].includes(extension)) {
          errors.push(`${file.name} : format non pris en charge.`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          errors.push(`${file.name} : le fichier dépasse 10 Mo.`);
          continue;
        }

        const formData = new FormData();
        formData.set('category', knowledgeCategory);
        formData.set('file', file);
        setKnowledgeNotice(`Extraction ${index + 1}/${filesToProcess.length} : ${file.name}`);
        try {
          const response = await axios.post(`${API_URL}/knowledge-documents`, formData);
          lastUploaded = response.data;
          uploadedCount += 1;
          setKnowledgeDocuments(current => [response.data, ...current]);
        } catch (err) {
          errors.push(`${file.name} : ${err.response?.data?.error || 'échec de l’extraction.'}`);
        }
      }

      if (lastUploaded) {
        setActiveKnowledgeDocument(lastUploaded);
        setKnowledgeDraft(lastUploaded.extracted_text);
        setKnowledgeEditing(true);
      }
      if (errors.length > 0) setKnowledgeError(errors.join('\n'));
      const summary = `${uploadedCount} document${uploadedCount > 1 ? 's' : ''} extrait${uploadedCount > 1 ? 's' : ''}. Relisez et validez chacun avant qu’il soit utilisé par l’agent.`;
      setKnowledgeNotice(skippedCount > 0 ? `${summary} ${skippedCount} fichier${skippedCount > 1 ? 's' : ''} ignoré${skippedCount > 1 ? 's' : ''} : limite de 20 documents.` : summary);
    } catch (err) {
      setKnowledgeError(err.response?.data?.error || err.message || 'Impossible de traiter les fichiers sélectionnés.');
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const handleSelectKnowledgeDocument = async (document) => {
    setKnowledgeLoading(true);
    setKnowledgeError('');
    setKnowledgeNotice('');
    try {
      const response = await axios.get(`${API_URL}/knowledge-documents/${document.id}`);
      setActiveKnowledgeDocument(response.data);
      setKnowledgeDraft(response.data.extracted_text);
      setKnowledgeEditing(response.data.status !== 'validated');
    } catch (err) {
      setKnowledgeError(err.response?.data?.error || 'Impossible de charger le document sélectionné.');
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const handleValidateKnowledgeDocument = async () => {
    if (!activeKnowledgeDocument || !knowledgeDraft.trim()) {
      setKnowledgeError('Le texte à valider ne peut pas être vide.');
      return;
    }
    setKnowledgeSaving(true);
    setKnowledgeError('');
    setKnowledgeNotice('');
    try {
      const response = await axios.put(
        `${API_URL}/knowledge-documents/${activeKnowledgeDocument.id}/validate`,
        { extracted_text: knowledgeDraft }
      );
      setActiveKnowledgeDocument(response.data);
      setKnowledgeDraft(response.data.extracted_text);
      setKnowledgeDocuments(current => current.map(document => document.id === response.data.id ? response.data : document));
      setKnowledgeEditing(false);
      setKnowledgeNotice('Document validé. L’agent pourra désormais utiliser ces informations.');
    } catch (err) {
      setKnowledgeError(err.response?.data?.error || 'Impossible de valider ce document.');
    } finally {
      setKnowledgeSaving(false);
    }
  };

  const handleDeleteKnowledgeDocument = async (document) => {
    if (!await confirmAction(`Supprimer « ${document.file_name} » des documents de référence ?`)) return;
    setKnowledgeError('');
    setKnowledgeNotice('');
    try {
      await axios.delete(`${API_URL}/knowledge-documents/${document.id}`);
      setKnowledgeDocuments(current => current.filter(item => item.id !== document.id));
      if (activeKnowledgeDocument?.id === document.id) {
        setActiveKnowledgeDocument(null);
        setKnowledgeDraft('');
        setKnowledgeEditing(false);
      }
    } catch (err) {
      setKnowledgeError(err.response?.data?.error || 'Impossible de supprimer ce document.');
    }
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
    if (!await confirmAction('Supprimer ce sujet sensible ? Cette action est irréversible.')) return;
    try {
      await axios.delete(`${API_URL}/config/keywords/${id}`);
      setKeywords(prev => prev.filter(k => k.id !== id));
    } catch {}
  };

  const handleKwKeyDown = (e) => { if (e.key === 'Enter') handleAddKeyword(); };

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
  const handleResync = async () => {
    if (resyncing || !onResyncWhatsApp) return;
    setResyncing(true);
    setWaError('');
    try { await onResyncWhatsApp(); } finally { setTimeout(() => setResyncing(false), 1200); }
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

  const sectionStyle = { marginTop: 24 };
  const labelStyle = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary, #888)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 };
  const fieldStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border, #e0e0e0)', fontSize: '0.9rem', background: 'var(--bg-secondary, #f5f5f5)', color: 'var(--text-primary, #111)' };
  const activeKeywordCount = keywords.filter(kw => kw.is_active).length;

  return (
    <div className="panel-content">
      <div className="panel-title">Configuration de l’agent</div>

      {/* ── WhatsApp ── */}
      <div className="wa-section">
        <div className="section-label">WhatsApp</div>
        <div className={`wa-status-row ${waStatus.status === 'syncing' || waStatus.status === 'synced' || waStatus.status === 'sync-failed' || waStatus.status === 'reconnecting' ? 'connected' : 'disconnected'}`}>
          <span className="wa-dot" />
          <span>{waStatus.status === 'syncing' ? 'Session conservée · synchronisation…' : waStatus.status === 'reconnecting' ? 'Session conservée · reconnexion…' : waStatus.isConnected ? 'Connecté · session conservée' : waStatus.status === 'qr' || waStatus.status === 'auth_failure' || waStatus.status === 'disconnected' ? 'Session WhatsApp perdue' : 'Non connecté'}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {!waStatus.isConnected && (
              <button className="btn-connect" onClick={handleConnect} disabled={isConnectDisabled}>
                {connectLabel()}
              </button>
            )}
            {waStatus.status === 'sync-failed' && (
              <button className="btn-connect" onClick={handleResync} disabled={resyncing}>
                {resyncing ? 'Relance...' : 'Relancer la synchronisation'}
              </button>
            )}
            {waStatus.isConnected && (
              <button className="btn-disconnect" onClick={handleDisconnect} disabled={disconnecting}>
                {disconnecting ? 'Déconnexion...' : 'Déconnecter'}
              </button>
            )}
          </div>
        </div>

        {waStatus.status === 'syncing' && (
          <div className="wa-session-notice wa-session-syncing" role="status">
            <div className="wa-session-spinner" />
            <div><strong>Session WhatsApp conservée</strong><span>Synchronisation des conversations et des données en cours…</span></div>
          </div>
        )}
        {waStatus.status === 'reconnecting' && (
          <div className="wa-session-notice wa-session-syncing" role="status">
            <div className="wa-session-spinner" />
            <div><strong>Reconnexion automatique</strong><span>{waStatus.message || 'La session WhatsApp est conservée. Nouvelle tentative en cours…'}</span></div>
          </div>
        )}
        {waStatus.status === 'synced' && waStatus.message && (
          <div className="wa-session-notice wa-session-synced" role="status">✓ {waStatus.message}</div>
        )}
        {waStatus.status === 'sync-failed' && (
          <div className="wa-session-notice wa-session-warning" role="alert">⚠ {waStatus.message}</div>
        )}
        {(!waStatus.isConnected && (waStatus.status === 'disconnected' || waStatus.status === 'auth_failure')) && waStatus.message && (
          <div className="wa-session-notice wa-session-lost" role="alert">⚠ {waStatus.message}</div>
        )}

        {connecting && !waStatus.qrCode && (
          <div className="qr-waiting">
            <div className="qr-waiting-spinner" />
            <div>
              <div className="qr-waiting-title">Connexion en cours…</div>
              <div className="qr-waiting-desc">Le QR code peut prendre jusqu'à 150 secondes. Ne cliquez pas à nouveau pendant l'initialisation.</div>
            </div>
          </div>
        )}

        {waStatus.qrCode && (
          <div className="qr-wrapper">
            <p className="qr-instructions">Scannez ce QR code avec votre WhatsApp</p>
            <QRCodeDisplay value={waStatus.qrCode} />
            <p className="qr-steps">WhatsApp → ⋮ Menu → Appareils reliés → Relier un appareil</p>
          </div>
        )}

        {waError && (
          <div className="wa-error-banner">
            <strong>Erreur :</strong> {waError}
            {cooldownLeft > 0 && <span className="wa-error-retry"> — réessai possible dans {cooldownLeft}s</span>}
          </div>
        )}
      </div>

      {/* ── Identité de l’agent ── */}
      <div className="config-section">
        <div className="section-label">Identité de l’agent</div>

        <div className="field-group">
          <label>Nom de l’agent</label>
          <input type="text" value={config.bot_name} onChange={e => setConfig({ ...config, bot_name: e.target.value })} placeholder="Botora" />
        </div>

        <div className="field-group">
          <label>Informations à sa disposition</label>
          <textarea value={config.bot_info} onChange={e => setConfig({ ...config, bot_info: e.target.value })}
            placeholder={`Décrivez ici tout ce que l’agent doit connaître : produits, services, tarifs, adresses, horaires…`} rows={7} />
        </div>

        <div className="field-group">
          <label>Documents de référence</label>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #888)', lineHeight: 1.5, margin: '0 0 12px' }}>
            Ajoutez la présentation, le catalogue, les tarifs ou les conditions de l’entreprise. Déposez plusieurs fichiers à la fois ou sélectionnez-les. Botora les extrait un par un pour que vous puissiez relire chaque texte avant validation. Les PDF scannés sans texte ne sont pas encore pris en charge.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <select
              aria-label="Catégorie du document"
              value={knowledgeCategory}
              onChange={event => setKnowledgeCategory(event.target.value)}
              disabled={knowledgeLoading || knowledgeDocuments.length >= 20}
              style={fieldStyle}
            >
              {KNOWLEDGE_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div
            onDragEnter={event => {
              event.preventDefault();
              if (!knowledgeLoading && knowledgeDocuments.length < 20) setKnowledgeDragActive(true);
            }}
            onDragOver={event => {
              event.preventDefault();
              event.dataTransfer.dropEffect = knowledgeLoading || knowledgeDocuments.length >= 20 ? 'none' : 'copy';
            }}
            onDragLeave={event => {
              if (!event.currentTarget.contains(event.relatedTarget)) setKnowledgeDragActive(false);
            }}
            onDrop={event => {
              event.preventDefault();
              setKnowledgeDragActive(false);
              if (!knowledgeLoading) handleKnowledgeUpload(event.dataTransfer.files);
            }}
            style={{
              padding: '22px 16px',
              border: `2px dashed ${knowledgeDragActive ? 'var(--accent, #25d366)' : 'var(--border, #b8c2c8)'}`,
              borderRadius: 10,
              background: knowledgeDragActive ? 'rgba(37,211,102,0.08)' : 'var(--bg-secondary, #f5f5f5)',
              textAlign: 'center',
              opacity: knowledgeDocuments.length >= 20 ? 0.6 : 1,
              transition: 'border-color 0.15s, background 0.15s'
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary, #111)', marginBottom: 5 }}>
              {knowledgeDragActive ? 'Déposez vos fichiers ici' : 'Glissez-déposez vos documents ici'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #888)', marginBottom: 10 }}>
              {knowledgeLoading ? 'Extraction en cours…' : 'Vous pouvez sélectionner ou déposer plusieurs documents à la fois.'}
            </div>
            <label
              className="btn-connect"
              style={{ display: 'inline-flex', alignItems: 'center', opacity: knowledgeLoading || knowledgeDocuments.length >= 20 ? 0.6 : 1, cursor: knowledgeLoading || knowledgeDocuments.length >= 20 ? 'not-allowed' : 'pointer' }}
            >
              Choisir des fichiers
              <input
                type="file"
                accept=".pdf,.docx,.txt,.csv,.xlsx"
                multiple
                aria-label="Choisir des documents de référence"
                disabled={knowledgeLoading || knowledgeDocuments.length >= 20}
                onChange={event => {
                  handleKnowledgeUpload(event.target.files);
                  event.target.value = '';
                }}
                style={{ display: 'none' }}
              />
            </label>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #888)', marginTop: 8, marginBottom: 12 }}>
            PDF, DOCX, TXT, CSV ou XLSX · 10 Mo maximum par fichier · 20 documents maximum · 200 000 caractères cumulés utilisables par l’agent.
          </div>

          {knowledgeError && <div className="config-error" role="alert" style={{ whiteSpace: 'pre-line' }}>{knowledgeError}</div>}
          {knowledgeNotice && <div className="wa-session-notice wa-session-synced" role="status">{knowledgeNotice}</div>}

          {knowledgeDocuments.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              {knowledgeDocuments.map(document => (
                <div key={document.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px',
                  border: '1px solid var(--border, #e0e0e0)', borderRadius: 8,
                  background: activeKnowledgeDocument?.id === document.id ? 'rgba(37,211,102,0.08)' : 'var(--bg-secondary, #f5f5f5)'
                }}>
                  <button
                    type="button"
                    onClick={() => handleSelectKnowledgeDocument(document)}
                    disabled={knowledgeLoading}
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 0, padding: 0, background: 'transparent', color: 'var(--text-primary, #111)', cursor: 'pointer' }}
                  >
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {document.file_name}
                    </span>
                    <span style={{ display: 'block', color: 'var(--text-secondary, #888)', fontSize: '0.75rem', marginTop: 3 }}>
                      {KNOWLEDGE_CATEGORIES.find(([value]) => value === document.category)?.[1] || 'Autre document'}
                      {' · '}
                      {document.status === 'validated' ? 'Validé pour l’agent' : 'À relire et valider'}
                    </span>
                  </button>
                  <button type="button" className="btn-disconnect" onClick={() => handleDeleteKnowledgeDocument(document)}>
                    Supprimer
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeKnowledgeDocument && (
            <div style={{ padding: 12, border: '1px solid var(--border, #e0e0e0)', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <strong style={{ overflowWrap: 'anywhere' }}>{activeKnowledgeDocument.file_name}</strong>
                <span style={{ color: 'var(--text-secondary, #888)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                  {activeKnowledgeDocument.status === 'validated' ? 'Validé' : 'En attente'}
                </span>
              </div>
              <textarea
                aria-label={`Texte extrait de ${activeKnowledgeDocument.file_name}`}
                value={knowledgeDraft}
                onChange={event => setKnowledgeDraft(event.target.value)}
                readOnly={!knowledgeEditing}
                rows={10}
                style={{ ...fieldStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5, opacity: knowledgeEditing ? 1 : 0.8 }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {knowledgeEditing ? (
                  <>
                    <button type="button" className="btn-connect" onClick={handleValidateKnowledgeDocument} disabled={knowledgeSaving || knowledgeLoading}>
                      {knowledgeSaving ? 'Validation…' : activeKnowledgeDocument.status === 'validated' ? 'Enregistrer et valider' : 'Valider le texte'}
                    </button>
                    {activeKnowledgeDocument.status === 'validated' && (
                      <button
                        type="button"
                        className="btn-disconnect"
                        onClick={() => { setKnowledgeDraft(activeKnowledgeDocument.extracted_text); setKnowledgeEditing(false); }}
                        disabled={knowledgeSaving}
                      >
                        Annuler
                      </button>
                    )}
                  </>
                ) : (
                  <button type="button" className="btn-connect" onClick={() => setKnowledgeEditing(true)}>
                    Modifier le texte
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="field-group">
          <label>Comportement & ton souhaité</label>
          <textarea value={config.bot_behavior} onChange={e => setConfig({ ...config, bot_behavior: e.target.value })}
            placeholder={`Décrivez comment l’agent doit se comporter.\n\nExemple :\n- Répondre en français uniquement\n- Être chaleureux et professionnel`} rows={6} />
        </div>

        <div className="field-group" style={{ marginBottom: 16 }}>
          <label>Personnalité de l’agent</label>
          <div role="radiogroup" aria-label="Personnalité de l’agent" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {PERSONALITIES.map(p => {
              const isSelected = config.personality === p.value;
              return (
                <label key={p.value} className="bot-personality-option" style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                  position: 'relative',
                  border: `1.5px solid ${isSelected ? '#25d366' : 'var(--border, rgba(255,255,255,0.1))'}`,
                  background: isSelected ? 'rgba(37,211,102,0.08)' : 'var(--bg-secondary, rgba(255,255,255,0.03))',
                  transition: 'all 0.15s'
                }}>
                  <input
                    type="radio"
                    className="bot-personality-radio"
                    name={`personality-${personalityGroupId}`}
                    value={p.value}
                    checked={isSelected}
                    onChange={() => {
                      personalityTouchedRef.current = true;
                      setConfig(c => ({ ...c, personality: p.value }));
                    }}
                  />
                  <span style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    border: `2px solid ${isSelected ? '#25d366' : 'var(--border, #555)'}`,
                    background: isSelected ? '#25d366' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s'
                  }}>
                    {isSelected && (
                      <svg viewBox="0 0 12 10" width="11" height="9" fill="none">
                        <path d="M1 5l3.5 3.5L11 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary, #e8eaed)' }}>{p.label}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #8e9baa)' }}>{p.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="toggle-row">
          <div>
            <div className="toggle-label">Agent IA</div>
            <div className="toggle-desc">L’agent répond automatiquement grâce à l’IA</div>
          </div>
          <button className={`toggle-btn ${config.ia_enabled ? 'on' : 'off'}`} onClick={() => setConfig({ ...config, ia_enabled: !config.ia_enabled })}>
            <span className="toggle-knob" />
          </button>
        </div>

        <div className="toggle-row" style={{ marginTop: 12 }}>
          <div>
            <div className="toggle-label">🧠 Émotions IA</div>
            <div className="toggle-desc">Analyse les émotions des messages entrants et utilise des crédits IA</div>
          </div>
          <button className={`toggle-btn ${config.sentiment_enabled ? 'on' : 'off'}`} onClick={() => setConfig(c => ({ ...c, sentiment_enabled: !c.sentiment_enabled }))}>
            <span className="toggle-knob" />
          </button>
        </div>

        <div className="toggle-row" style={{ marginTop: 12 }}>
          <div>
            <div className="toggle-label">🔔 Alertes de sentiment</div>
            <div className="toggle-desc">Notifie quand un client semble en colère ou insatisfait</div>
          </div>
          <button className={`toggle-btn ${config.sentiment_alert ? 'on' : 'off'}`} onClick={() => setConfig(c => ({ ...c, sentiment_alert: !c.sentiment_alert }))}>
            <span className="toggle-knob" />
          </button>
        </div>

        <div className="toggle-row" style={{ marginTop: 12 }}>
          <div>
            <div className="toggle-label">🖼️ Réponse automatique aux médias</div>
            <div className="toggle-desc">L’agent répond automatiquement quand un contact envoie une image, vidéo, audio, sticker ou document</div>
          </div>
          <button className={`toggle-btn ${config.media_auto_reply ? 'on' : 'off'}`} onClick={() => setConfig(c => ({ ...c, media_auto_reply: !c.media_auto_reply }))}>
            <span className="toggle-knob" />
          </button>
        </div>

        <div className="toggle-row" style={{ marginTop: 12 }}>
          <div>
            <div className="toggle-label">👥 Autoriser l’agent IA à répondre dans les groupes</div>
            <div className="toggle-desc">Par défaut, les messages de groupe sont enregistrés sans réponse automatique de l’agent IA</div>
          </div>
          <button
            type="button"
            className={`toggle-btn ${config.ia_group_enabled ? 'on' : 'off'}`}
            role="switch"
            aria-checked={config.ia_group_enabled === true}
            aria-label="Autoriser l’agent IA à répondre dans les groupes"
            onClick={() => setConfig(c => ({ ...c, ia_group_enabled: !c.ia_group_enabled }))}
          >
            <span className="toggle-knob" />
          </button>
        </div>

        <div className="field-group" style={{ marginTop: 16 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Délai de regroupement des messages</span>
            <span style={{ fontWeight: 600, color: 'var(--accent, #25d366)', fontSize: '0.85rem' }}>
              {formatDelay(config.response_delay_seconds ?? 120)}
            </span>
          </label>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #888)', margin: '0 0 10px', lineHeight: 1.5 }}>
            Botora attend après le dernier message reçu pour regrouper les messages rapprochés. Ce délai aide à éviter des réponses trop rapides qui pourraient entraîner un blocage temporaire de WhatsApp. Le réglage par défaut est de 2 minutes.
          </p>
          <input type="range" min="60" max="300" step="1" value={config.response_delay_seconds ?? 120}
            onChange={e => setConfig({ ...config, response_delay_seconds: parseInt(e.target.value) })}
            style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent, #25d366)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary, #888)', marginTop: 2 }}>
            <span>1 min</span>
            <span style={{ fontSize: '0.7rem' }}>Délai avant que l’agent réponde après le dernier message reçu</span>
            <span>5min</span>
          </div>
        </div>

        {error && <div className="config-error">{error}</div>}
        <button className="save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Sauvegarde...' : saved ? '✓ Sauvegardé !' : 'Sauvegarder'}
        </button>
      </div>

      {/* ── Sujets sensibles ── */}
      <div className="config-section sensitive-topics-section" style={sectionStyle}>
        <div className="sensitive-topics-header">
          <div className="sensitive-topics-heading">
            <span className="sensitive-topics-icon" aria-hidden="true">!</span>
            <div>
              <div className="section-label">Sujets sensibles</div>
              <p className="sensitive-topics-description">
                Si un message reçu contient l’un de ces termes, l’agent ne répond pas et confie la conversation à un humain.
              </p>
            </div>
          </div>
          <span className="sensitive-topics-count" aria-live="polite">{keywords.length} {keywords.length === 1 ? 'sujet' : 'sujets'}</span>
        </div>

        <div className="sensitive-topics-notice" role="note">
          <span aria-hidden="true">ℹ</span>
          <p>La détection ignore les majuscules : <strong>avocat</strong>, <strong>Avocat</strong> et <strong>AVOCAT</strong> sont tous détectés.</p>
        </div>

        <div className="sensitive-topics-form">
          <label className="sensitive-topics-label" htmlFor={sensitiveTopicInputId}>Ajouter un terme à surveiller</label>
          <div className="sensitive-topics-input-row">
            <input id={sensitiveTopicInputId} type="text" value={newKeyword} onChange={e => setNewKeyword(e.target.value)} onKeyDown={handleKwKeyDown}
              className="sensitive-topics-input"
              placeholder="Ex : avocat, remboursement, plainte…"
            />
            <button type="button" className="sensitive-topics-add" onClick={handleAddKeyword} disabled={kwSaving || !newKeyword.trim()}>
              {kwSaving ? 'Ajout…' : '+ Ajouter'}
            </button>
          </div>
        </div>

        {kwMsg && <div className="sensitive-topics-error" role="alert">{kwMsg}</div>}

        {keywords.length === 0 ? (
          <div className="keyword-replies-state keyword-replies-state-empty"><span className="keyword-replies-state-icon">＋</span><strong>Aucun sujet sensible</strong><p>Ajoutez un mot ou groupe de mots à surveiller ci-dessus.</p></div>
        ) : (
          <div className="sensitive-topics-list">
            <div className="sensitive-topics-list-heading">
              <span>Termes surveillés</span>
              <span>{activeKeywordCount} actif{activeKeywordCount === 1 ? '' : 's'}</span>
            </div>
            <div className="keyword-replies-list">
            {keywords.map(kw => (
              <article key={kw.id} className={`keyword-replies-item ${kw.is_active ? '' : 'is-disabled'}`}>
                <div className="keyword-replies-item-content"><div className="keyword-replies-item-keyword"><span className="keyword-replies-keyword-dot" />{kw.keyword}<span className={`keyword-replies-status ${kw.is_active ? 'active' : 'inactive'}`}>{kw.is_active ? 'Actif' : 'Inactif'}</span></div><p>L’agent transmet ce sujet à un humain sans répondre automatiquement.</p></div>
                <div className="keyword-replies-item-actions">
                <button type="button" className="keyword-replies-action" onClick={() => handleToggleKeyword(kw)} title={kw.is_active ? 'Désactiver' : 'Activer'}>
                  {kw.is_active ? 'Désactiver' : 'Activer'}
                </button>
                <button type="button" className="keyword-replies-action keyword-replies-danger" onClick={() => handleDeleteKeyword(kw.id)} title="Supprimer">
                  Supprimer
                </button>
                </div>
              </article>
            ))}
            </div>
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
      QRCode.toCanvas(canvasRef.current, value, {
        width: 360,
        margin: 5,
        errorCorrectionLevel: 'M',
        color: { dark: '#111111', light: '#ffffff' }
      }, err => {
        if (err) console.error('QR error:', err);
      });
    }).catch(err => console.error('Import qrcode failed:', err));
  }, [value]);
  return <div className="qr-canvas-wrapper"><canvas ref={canvasRef} /></div>;
}
