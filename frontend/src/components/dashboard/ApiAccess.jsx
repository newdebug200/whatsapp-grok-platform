import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useLanguage } from '../../context/LanguageContext';
import './ApiAccess.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const API_BASE_URL = `${API_URL}/v1`;

function ApiCodeExample({ title, description, code, onCopy, copied }) {
  return (
    <article className="api-code-example">
      <div className="api-code-example-heading">
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        <button type="button" className="api-copy-button" onClick={() => onCopy(code)}>
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </article>
  );
}

function ApiDocumentation({ onCopy, copiedCode }) {
  const examples = [
    {
      title: '1. Envoyer un message',
      description: 'Envoie un message texte à un numéro WhatsApp.',
      code: `curl -X POST "${API_BASE_URL}/messages/send" \\\n  -H "X-API-Key: btr_live_votre_cle" \\\n  -H "Content-Type: application/json" \\\n  -d '{"to":"229XXXXXXXX","message":"Bonjour depuis mon application"}'`,
    },
    {
      title: '2. Envoyer plusieurs messages',
      description: 'Envoie jusqu’à 100 messages dans une seule requête.',
      code: `curl -X POST "${API_BASE_URL}/messages/send-batch" \\\n  -H "X-API-Key: btr_live_votre_cle" \\\n  -H "Content-Type: application/json" \\\n  -d '{"messages":[{"to":"229XXXXXXXX","message":"Bonjour Jean"},{"to":"229YYYYYYYY","message":"Bonjour Marie"}]}'`,
    },
    {
      title: '3. Vérifier un numéro WhatsApp',
      description: 'Retourne is_whatsapp à true ou false pour un numéro.',
      code: `curl -X POST "${API_BASE_URL}/whatsapp/check-number" \\\n  -H "X-API-Key: btr_live_votre_cle" \\\n  -H "Content-Type: application/json" \\\n  -d '{"phone_number":"229XXXXXXXX","profile_id":1}'`,
    },
    {
      title: '4. Vérifier plusieurs numéros',
      description: 'Vérifie jusqu’à 100 numéros et retourne le résultat de chacun.',
      code: `curl -X POST "${API_BASE_URL}/whatsapp/check-numbers" \\\n  -H "X-API-Key: btr_live_votre_cle" \\\n  -H "Content-Type: application/json" \\\n  -d '{"numbers":["229XXXXXXXX","229YYYYYYYY"],"profile_id":1}'`,
    },
    {
      title: '5. Vérifier l’état du service',
      description: 'Contrôle si le service API d’envoi est opérationnel.',
      code: `curl -X GET "${API_BASE_URL}/messages/health" \\\n  -H "X-API-Key: btr_live_votre_cle"`,
    },
  ];

  return (
    <section className="api-documentation api-documentation-bottom">
      <div className="api-documentation-heading">
        <span className="api-doc-eyebrow">Documentation API</span>
        <h2>Exemples et détails d’intégration</h2>
        <p>Utilisez ces exemples pour connecter votre application à Botora et exploiter les cinq endpoints disponibles.</p>
      </div>

      <div className="api-base-url-card">
        <div>
          <strong>Base URL</strong>
          <p>Toutes les routes publiques de l’API commencent par cette adresse.</p>
        </div>
        <code>{API_BASE_URL}</code>
        <button type="button" className="api-copy-button" onClick={() => onCopy(API_BASE_URL)}>
          {copiedCode === API_BASE_URL ? 'Copié' : 'Copier'}
        </button>
      </div>

      <div className="api-doc-grid">
        <article className="api-doc-block">
          <h3>Endpoints disponibles</h3>
          <div className="api-endpoint"><code>POST /messages/send</code><span>Un message</span></div>
          <div className="api-endpoint"><code>POST /messages/send-batch</code><span>Jusqu’à 100 messages</span></div>
          <div className="api-endpoint"><code>POST /whatsapp/check-number</code><span>Un numéro</span></div>
          <div className="api-endpoint"><code>POST /whatsapp/check-numbers</code><span>Jusqu’à 100 numéros</span></div>
          <div className="api-endpoint"><code>GET /messages/health</code><span>État du service</span></div>
        </article>
        <article className="api-doc-block">
          <h3>Authentification</h3>
          <p>Envoyez votre clé dans l’un des en-têtes suivants :</p>
          <code className="api-inline-code">X-API-Key: btr_live_votre_cle</code>
          <code className="api-inline-code">Authorization: Bearer btr_live_votre_cle</code>
          <p className="api-muted">Conservez votre clé côté serveur. Elle n’est jamais affichée une seconde fois après sa création.</p>
        </article>
        <article className="api-doc-block">
          <h3>Champs utiles</h3>
          <p><code>to</code> : numéro du destinataire au format international.</p>
          <p><code>message</code> : texte du message.</p>
          <p><code>media</code> : média Base64 optionnel, limité à 7 Mo.</p>
          <p><code>profile_id</code> : profil WhatsApp précis à utiliser lorsque plusieurs profils sont connectés.</p>
          <p><code>numbers</code> : tableau de numéros, limité à 100 éléments.</p>
        </article>
      </div>

      <div className="api-examples-list">
        <h3 className="api-examples-title">Exemples copiables</h3>
        {examples.map(example => (
          <ApiCodeExample
            key={example.title}
            {...example}
            onCopy={onCopy}
            copied={copiedCode === example.code}
          />
        ))}
      </div>
    </section>
  );
}

export default function ApiAccess({ onBack }) {
  const { t } = useLanguage();
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState('');

  const loadKeys = async () => {
    try {
      const response = await axios.get(`${API_URL}/api-keys`);
      setKeys(response.data || []);
    } catch (err) {
      setError(err.response?.data?.error || t('Unable to load API keys.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadKeys(); }, []);

  const createKey = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    setNewKey('');
    try {
      const response = await axios.post(`${API_URL}/api-keys`, { name: name.trim() });
      setNewKey(response.data.key);
      setName('');
      await loadKeys();
    } catch (err) {
      setError(err.response?.data?.error || t('Unable to create the API key.'));
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id) => {
    if (!window.confirm(t('Revoke this API key?'))) return;
    try {
      await axios.delete(`${API_URL}/api-keys/${id}`);
      await loadKeys();
    } catch (err) {
      setError(err.response?.data?.error || t('Unable to revoke the API key.'));
    }
  };

  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCode(value);
      setTimeout(() => setCopiedCode(''), 1800);
    } catch (_) {
      setCopiedCode('');
    }
  };

  return (
    <section className="api-access-page">
      <header className="api-access-header">
        <div>
          <span>{t('Developer access')}</span>
          <h1>{t('API keys')}</h1>
          <p>{t('Connect your applications to Botora and send WhatsApp messages through your connected profile.')}</p>
        </div>
        {onBack && <button onClick={onBack}>← {t('Back')}</button>}
      </header>

      {error && <div className="api-access-alert error">{error}</div>}
      {newKey && (
        <div className="api-access-alert success">
          <strong>{t('Copy this key now. It will not be displayed again.')}</strong>
          <div className="api-key-reveal"><code>{newKey}</code><button onClick={() => copy(newKey)}>{copiedCode === newKey ? t('Copied') : t('Copy')}</button></div>
        </div>
      )}

      <div className="api-access-grid api-key-management-grid">
        <div className="api-access-card">
          <h2>{t('Create an API key')}</h2>
          <p>{t('Use a separate key for each application so you can revoke access independently.')}</p>
          <form onSubmit={createKey}>
            <label htmlFor="api-key-name">{t('Key name')}</label>
            <div className="api-create-row"><input id="api-key-name" value={name} onChange={event => setName(event.target.value)} placeholder={t('Example: CRM production')} maxLength={80} /><button type="submit" disabled={saving || !name.trim()}>{saving ? t('Creating...') : t('Create key')}</button></div>
          </form>
        </div>
        <div className="api-access-card">
          <h2>Bonnes pratiques</h2>
          <p>Créez une clé par application, révoquez immédiatement une clé exposée et conservez-la côté serveur.</p>
          <p className="api-muted">Une clé complète n’est affichée qu’une seule fois après sa création.</p>
        </div>
      </div>

      <div className="api-access-card api-keys-card">
        <h2>{t('Your keys')}</h2>
        {loading ? <p>{t('Loading...')}</p> : keys.length === 0 ? <p className="api-muted">{t('No API key created yet.')}</p> : <div className="api-key-list">{keys.map(key => <div className={`api-key-row ${key.revoked_at ? 'revoked' : ''}`} key={key.id}><div><strong>{key.name}</strong><span>{key.prefix}•••••••• · {key.revoked_at ? t('Revoked') : t('Active')}</span></div>{!key.revoked_at && <button className="api-danger-button" onClick={() => revoke(key.id)}>{t('Revoke')}</button>}</div>)}</div>}
      </div>

      <section className="api-access-grid api-reference-grid">
        <div className="api-access-card">
          <h2>Règles d’utilisation</h2>
          <ul className="api-reference-list">
            <li>Un média ne doit pas dépasser <strong>7 Mo</strong>.</li>
            <li>Un lot peut contenir au maximum <strong>100 messages</strong> ou <strong>100 numéros</strong>.</li>
            <li>La limite d’envoi est de <strong>120 requêtes par minute</strong>.</li>
            <li>Un profil WhatsApp connecté et opérationnel est nécessaire.</li>
            <li>Utilisez <code>profile_id</code> lorsque plusieurs numéros sont connectés.</li>
          </ul>
        </div>
        <div className="api-access-card">
          <h2>Réponses d’erreur</h2>
          <ul className="api-reference-list">
            <li><code>401</code> : clé absente, invalide ou révoquée.</li>
            <li><code>403</code> : abonnement requis pour l’accès API.</li>
            <li><code>502</code> : vérification WhatsApp temporairement indisponible.</li>
            <li><code>503</code> : aucun profil connecté ou profil indisponible.</li>
          </ul>
        </div>
      </section>

      <ApiDocumentation onCopy={copy} copiedCode={copiedCode} />
    </section>
  );
}
