import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import './SubscriptionManager.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const empty = { name: '', slug: '', description: '', price: '0', currency: 'XOF', credits: '0', duration_days: '30', max_profiles: '1', features: '', is_active: true, sort_order: '0' };

export default function SubscriptionManager() {
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); try { const r = await axios.get(`${API_URL}/admin/subscription-plans`); setPlans(r.data); } catch { setError('Impossible de charger les abonnements.'); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const change = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const submit = async e => { e.preventDefault(); setSaving(true); setError(''); setMessage(''); try { if (editing) await axios.patch(`${API_URL}/admin/subscription-plans/${editing}`, form); else await axios.post(`${API_URL}/admin/subscription-plans`, form); setMessage(editing ? 'Abonnement modifié.' : 'Abonnement créé.'); setForm(empty); setEditing(null); await load(); } catch (err) { setError(err.response?.data?.error || 'Enregistrement impossible.'); } finally { setSaving(false); } };
  const edit = plan => { setEditing(plan.id); setForm({ ...plan, features: plan.features || '', description: plan.description || '' }); };
  const remove = async plan => { if (!window.confirm(`Supprimer l’abonnement « ${plan.name} » ?`)) return; try { await axios.delete(`${API_URL}/admin/subscription-plans/${plan.id}`); setMessage('Abonnement supprimé.'); await load(); } catch { setError('Suppression impossible.'); } };
  return <section className="subscription-admin">
    <header className="subscription-admin-head"><div><span className="subscription-eyebrow">Administration commerciale</span><h2>Abonnements</h2><p>Créez les offres, définissez le taux de crédits et choisissez celles visibles par les utilisateurs.</p></div><span className="subscription-admin-badge">Admin uniquement</span></header>
    {(message || error) && <div className={`subscription-feedback ${error ? 'error' : ''}`}>{error || message}</div>}
    <form className="subscription-form" onSubmit={submit}><div className="subscription-form-title">{editing ? 'Modifier une offre' : 'Ajouter une offre'}</div><div className="subscription-form-grid">
      <label>Nom<input name="name" value={form.name} onChange={change} required placeholder="Essentiel" /></label><label>Identifiant<input name="slug" value={form.slug} onChange={change} required placeholder="essentiel" /></label><label>Prix<input name="price" type="number" min="0" step="0.01" value={form.price} onChange={change} /></label><label>Devise<input name="currency" maxLength="3" value={form.currency} onChange={change} /></label><label>Crédits inclus<input name="credits" type="number" min="0" step="0.01" value={form.credits} onChange={change} /></label><label>Durée (jours)<input name="duration_days" type="number" min="1" value={form.duration_days} onChange={change} /></label><label>Profils max.<input name="max_profiles" type="number" min="1" value={form.max_profiles} onChange={change} /></label><label>Ordre<input name="sort_order" type="number" min="0" value={form.sort_order} onChange={change} /></label>
      <label className="subscription-wide">Description<textarea name="description" rows="2" value={form.description} onChange={change} placeholder="Pour les petites équipes…" /></label><label className="subscription-wide">Avantages — un par ligne<textarea name="features" rows="3" value={form.features} onChange={change} placeholder="Accès au bot IA\n1 profil WhatsApp\nSupport standard" /></label>
    </div><div className="subscription-form-actions"><label className="subscription-active"><input name="is_active" type="checkbox" checked={form.is_active} onChange={change} /> Offre visible</label><span />{editing && <button type="button" className="subscription-secondary" onClick={() => { setEditing(null); setForm(empty); }}>Annuler</button>}<button className="subscription-primary" disabled={saving}>{saving ? 'Enregistrement…' : editing ? 'Enregistrer les changements' : 'Créer l’abonnement'}</button></div></form>
    <div className="subscription-list">{loading ? <div className="subscription-empty">Chargement…</div> : plans.length === 0 ? <div className="subscription-empty">Aucune offre. Créez le premier abonnement ci-dessus.</div> : plans.map(plan => <article className={`subscription-plan-row ${!plan.is_active ? 'inactive' : ''}`} key={plan.id}><div><strong>{plan.name}</strong><span>{plan.description || 'Sans description'}</span><small>{plan.credits} crédits · {plan.duration_days} jours · {plan.max_profiles} profil(s)</small></div><div className="subscription-plan-price">{plan.price.toLocaleString('fr-FR')} {plan.currency}</div><span className={`subscription-plan-status ${plan.is_active ? 'active' : ''}`}>{plan.is_active ? 'Visible' : 'Masqué'}</span><button className="subscription-edit" onClick={() => edit(plan)}>Modifier</button><button className="subscription-remove" onClick={() => remove(plan)}>Supprimer</button></article>)}</div>
  </section>;
}
