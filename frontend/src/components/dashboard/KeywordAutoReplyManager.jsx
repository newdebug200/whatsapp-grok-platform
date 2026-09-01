import React, { useEffect, useState } from 'react';
import axios from 'axios';

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
      const { data } = await axios.get('/api/config/keyword-replies');
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
      if (editingId) await axios.patch(`/api/config/keyword-replies/${editingId}`, { keyword, response_text: responseText });
      else await axios.post('/api/config/keyword-replies', { keyword, response_text: responseText });
      reset(); await loadRules(); setNotice(editingId ? 'Réponse automatique mise à jour.' : 'Réponse automatique ajoutée.');
    } catch (err) { setError(err.response?.data?.error || 'La sauvegarde n’a pas pu être effectuée.'); }
    finally { setSaving(false); }
  };

  const edit = (rule) => { setEditingId(rule.id); setKeyword(rule.keyword); setResponseText(rule.response_text); setError(''); setNotice(''); };

  const toggle = async (rule) => {
    setError('');
    try { await axios.patch(`/api/config/keyword-replies/${rule.id}`, { is_active: !rule.is_active }); await loadRules(); }
    catch (err) { setError(err.response?.data?.error || 'Impossible de modifier cette réponse.'); }
  };

  const remove = async (rule) => {
    if (!window.confirm(`Supprimer la réponse pour « ${rule.keyword} » ?`)) return;
    setError('');
    try { await axios.delete(`/api/config/keyword-replies/${rule.id}`); await loadRules(); setNotice('Réponse automatique supprimée.'); }
    catch (err) { setError(err.response?.data?.error || 'Impossible de supprimer cette réponse.'); }
  };

  if (!activeProfile) return <div className="settings-empty">Connectez d’abord un compte WhatsApp pour configurer les réponses automatiques.</div>;

  return <section className="settings-panel">
    <div className="settings-panel-header">
      <div><h2>Réponses automatiques</h2><p>Répondez automatiquement à un message exact. La casse est ignorée : « Bonjour », « bonjour » et « BONJOUR » correspondent au même mot-clé.</p></div>
    </div>
    {error && <div className="settings-alert error">{error}</div>}
    {notice && <div className="settings-alert success">{notice}</div>}
    <form onSubmit={submit} className="settings-form-grid">
      <label>Mot-clé<input value={keyword} onChange={e => setKeyword(e.target.value)} maxLength={255} placeholder="Bonjour" /></label>
      <label>Réponse à envoyer<textarea value={responseText} onChange={e => setResponseText(e.target.value)} maxLength={4000} rows={3} placeholder="Bonjour, comment pouvons-nous vous aider ?" /></label>
      <div className="settings-form-actions"><button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : editingId ? 'Mettre à jour' : 'Ajouter'}</button>{editingId && <button type="button" className="secondary" onClick={reset}>Annuler</button>}</div>
    </form>
    <div className="settings-list">
      {loading ? <p>Chargement…</p> : rules.length === 0 ? <p className="muted">Aucune réponse automatique configurée.</p> : rules.map(rule => <article className={`settings-list-item ${rule.is_active ? '' : 'is-disabled'}`} key={rule.id}>
        <div><strong>{rule.keyword}</strong><p>{rule.response_text}</p></div>
        <div className="settings-item-actions"><button type="button" onClick={() => toggle(rule)}>{rule.is_active ? 'Désactiver' : 'Activer'}</button><button type="button" onClick={() => edit(rule)}>Modifier</button><button type="button" className="danger" onClick={() => remove(rule)}>Supprimer</button></div>
      </article>)}
    </div>
  </section>;
}
