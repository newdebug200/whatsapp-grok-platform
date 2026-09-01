import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './KeywordAutoReplyManager.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function KeywordAutoReplyManager({ activeProfile }) {
  const [rules, setRules] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [responseText, setResponseText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadRules = async () => {
    if (!activeProfile) return;
    setLoading(true); setError('');
    try {
      const { data } = await axios.get(`${API_URL}/config/keyword-replies`);
      setRules(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger les réponses automatiques.');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadRules(); }, [activeProfile?.id]);

  const reset = () => { setKeyword(''); setResponseText(''); setEditingId(null); };

  const submit = async (event) => {
    event.preventDefault(); setError(''); setNotice('');
    if (!keyword.trim() || !responseText.trim()) { setError('Renseignez un mot-clé et une réponse.'); return; }
    setSaving(true);
    try {
      if (editingId) await axios.patch(`${API_URL}/config/keyword-replies/${editingId}`, { keyword, response_text: responseText });
      else await axios.post(`${API_URL}/config/keyword-replies`, { keyword, response_text: responseText });
      reset(); await loadRules(); setNotice(editingId ? 'Réponse automatique mise à jour.' : 'Réponse automatique ajoutée.');
    } catch (err) { setError(err.response?.data?.error || 'La sauvegarde n’a pas pu être effectuée.'); }
    finally { setSaving(false); }
  };

  const edit = (rule) => { setEditingId(rule.id); setKeyword(rule.keyword); setResponseText(rule.response_text); setError(''); setNotice(''); };

  const toggle = async (rule) => {
    setError('');
    try { await axios.patch(`${API_URL}/config/keyword-replies/${rule.id}`, { is_active: !rule.is_active }); await loadRules(); }
    catch (err) { setError(err.response?.data?.error || 'Impossible de modifier cette réponse.'); }
  };

  const remove = async (rule) => {
    if (!window.confirm(`Supprimer la réponse pour « ${rule.keyword} » ?`)) return;
    setError('');
    try { await axios.delete(`${API_URL}/config/keyword-replies/${rule.id}`); await loadRules(); setNotice('Réponse automatique supprimée.'); }
    catch (err) { setError(err.response?.data?.error || 'Impossible de supprimer cette réponse.'); }
  };

  if (!activeProfile) return <div className="keyword-replies-empty"><span className="keyword-replies-empty-icon">↪</span><strong>Connectez un compte WhatsApp</strong><p>Associez d’abord un profil WhatsApp pour configurer vos réponses automatiques.</p></div>;

  return <section className="keyword-replies-panel">
    <div className="keyword-replies-header">
      <div><h2>Réponses automatiques</h2><p>Répondez automatiquement à un message exact. La casse est ignorée : « Bonjour », « bonjour » et « BONJOUR » correspondent au même mot-clé.</p></div>
    </div>
    {error && <div className="keyword-replies-alert keyword-replies-alert-error" role="alert"><strong>Un problème est survenu</strong><span>{error}</span></div>}
    {notice && <div className="keyword-replies-alert keyword-replies-alert-success" role="status"><strong>Modification enregistrée</strong><span>{notice}</span></div>}
    <form onSubmit={submit} className="keyword-replies-form">
      <div className="keyword-replies-form-heading"><div><span className="keyword-replies-section-label">Nouvelle règle</span><h3>{editingId ? 'Modifier la réponse' : 'Créer une réponse automatique'}</h3><p>La règle s’applique lorsque le message reçu correspond au mot-clé, sans tenir compte des majuscules et minuscules.</p></div><span className="keyword-replies-form-badge">{editingId ? 'Modification' : 'Disponible'}</span></div>
      <div className="keyword-replies-fields"><label><span>Mot-clé</span><small>Le texte à reconnaître</small><input value={keyword} onChange={e => setKeyword(e.target.value)} maxLength={255} placeholder="Bonjour" /></label>
      <label><span>Réponse à envoyer</span><small>Le message envoyé automatiquement</small><textarea value={responseText} onChange={e => setResponseText(e.target.value)} maxLength={4000} rows={4} placeholder="Bonjour, comment pouvons-nous vous aider ?" /></label></div>
      <div className="keyword-replies-form-actions"><button type="submit" className="keyword-replies-primary-action" disabled={saving}>{saving ? 'Enregistrement…' : editingId ? 'Mettre à jour' : 'Ajouter la réponse'}</button>{editingId && <button type="button" className="keyword-replies-secondary-action" onClick={reset}>Annuler</button>}</div>
    </form>
    <div className="keyword-replies-list-section">
      <div className="keyword-replies-list-heading"><div><span className="keyword-replies-section-label">Règles enregistrées</span><h3>Vos réponses automatiques</h3></div><span className="keyword-replies-count">{rules.length} {rules.length === 1 ? 'règle' : 'règles'}</span></div>
      <div className="keyword-replies-list">
      {loading ? <div className="keyword-replies-state"><span className="keyword-replies-spinner" />Chargement des règles…</div> : rules.length === 0 ? <div className="keyword-replies-state keyword-replies-state-empty"><span className="keyword-replies-state-icon">＋</span><strong>Aucune réponse automatique</strong><p>Créez votre première règle ci-dessus pour répondre automatiquement à un mot-clé.</p></div> : rules.map(rule => <article className={`keyword-replies-item ${rule.is_active ? '' : 'is-disabled'}`} key={rule.id}>
        <div className="keyword-replies-item-content"><div className="keyword-replies-item-keyword"><span className="keyword-replies-keyword-dot" />{rule.keyword}<span className={`keyword-replies-status ${rule.is_active ? 'active' : 'inactive'}`}>{rule.is_active ? 'Active' : 'Inactive'}</span></div><p>{rule.response_text}</p></div>
        <div className="keyword-replies-item-actions"><button type="button" className="keyword-replies-action" onClick={() => toggle(rule)}>{rule.is_active ? 'Désactiver' : 'Activer'}</button><button type="button" className="keyword-replies-action" onClick={() => edit(rule)}>Modifier</button><button type="button" className="keyword-replies-action keyword-replies-danger" onClick={() => remove(rule)}>Supprimer</button></div>
      </article>)}
      </div>
    </div>
  </section>;
}
