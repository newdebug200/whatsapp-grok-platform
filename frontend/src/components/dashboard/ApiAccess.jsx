import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useLanguage } from '../../context/LanguageContext';
import './ApiAccess.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function ApiAccess({ onBack }) {
  const { t } = useLanguage();
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const loadKeys = async () => {
    try { const response = await axios.get(`${API_URL}/api-keys`); setKeys(response.data || []); }
    catch (err) { setError(err.response?.data?.error || t('Unable to load API keys.')); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadKeys(); }, []);

  const createKey = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError(''); setNewKey('');
    try {
      const response = await axios.post(`${API_URL}/api-keys`, { name: name.trim() });
      setNewKey(response.data.key); setName(''); await loadKeys();
    } catch (err) { setError(err.response?.data?.error || t('Unable to create the API key.')); }
    finally { setSaving(false); }
  };

  const revoke = async (id) => {
    if (!window.confirm(t('Revoke this API key?'))) return;
    try { await axios.delete(`${API_URL}/api-keys/${id}`); await loadKeys(); }
    catch (err) { setError(err.response?.data?.error || t('Unable to revoke the API key.')); }
  };

  const copy = async (value) => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch (_) { setCopied(false); }
  };

  return <section className="api-access-page">
    <header className="api-access-header"><div><span>{t('Developer access')}</span><h1>{t('API keys')}</h1><p>{t('Connect your applications to Botora and send WhatsApp messages through your connected profile.')}</p></div>{onBack && <button onClick={onBack}>← {t('Back')}</button>}</header>
    {error && <div className="api-access-alert error">{error}</div>}
    {newKey && <div className="api-access-alert success"><strong>{t('Copy this key now. It will not be displayed again.')}</strong><div className="api-key-reveal"><code>{newKey}</code><button onClick={() => copy(newKey)}>{copied ? t('Copied') : t('Copy')}</button></div></div>}
    <div className="api-access-grid">
      <div className="api-access-card"><h2>{t('Create an API key')}</h2><p>{t('Use a separate key for each application so you can revoke access independently.')}</p><form onSubmit={createKey}><label htmlFor="api-key-name">{t('Key name')}</label><div className="api-create-row"><input id="api-key-name" value={name} onChange={event => setName(event.target.value)} placeholder={t('Example: CRM production')} maxLength={80} /><button type="submit" disabled={saving || !name.trim()}>{saving ? t('Creating...') : t('Create key')}</button></div></form></div>
      <div className="api-access-card"><h2>{t('Available endpoints')}</h2><p><code>POST /api/v1/messages/send</code> — {t('one message')}</p><p><code>POST /api/v1/messages/send-batch</code> — {t('up to 100 messages')}</p><p className="api-muted">{t('Authentication: X-API-Key header or Authorization: Bearer btr_...')}</p></div>
    </div>
    <div className="api-access-card"><h2>{t('Your keys')}</h2>{loading ? <p>{t('Loading...')}</p> : keys.length === 0 ? <p className="api-muted">{t('No API key created yet.')}</p> : <div className="api-key-list">{keys.map(key => <div className={`api-key-row ${key.revoked_at ? 'revoked' : ''}`} key={key.id}><div><strong>{key.name}</strong><span>{key.prefix}•••••••• · {key.revoked_at ? t('Revoked') : t('Active')}</span></div>{!key.revoked_at && <button className="api-danger-button" onClick={() => revoke(key.id)}>{t('Revoke')}</button>}</div>)}</div>}</div>
    <div className="api-access-card"><h2>{t('Quick example')}</h2><pre><code>{`curl -X POST "$API_URL/v1/messages/send" \\\n  -H "X-API-Key: btr_live_your_key" \\\n  -H "Content-Type: application/json" \\\n  -d '{"to":"229XXXXXXXX","message":"Bonjour depuis mon application"}'`}</code></pre><p className="api-muted">{t('For a file, add media: { data: base64, mimeType: image/png, filename: photo.png }. A caption is optional.')}</p></div>
  </section>;
}
