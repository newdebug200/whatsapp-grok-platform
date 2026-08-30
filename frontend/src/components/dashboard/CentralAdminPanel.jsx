import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import './CentralAdminPanel.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const money = value => `${Number(value || 0).toLocaleString('fr-FR')} F CFA`;
const credits = value => Number(value || 0).toFixed(3);

export default function CentralAdminPanel({ section }) {
  const [data, setData] = useState(null);
  const [creditUsers, setCreditUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedEmail, setSelectedEmail] = useState('');
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const request = useCallback(async (path, options = {}) => {
    const response = await axios({ url: `${API}/admin-central/${path}`, ...options });
    return response.data;
  }, []);
  const load = useCallback(async () => {
    setLoading(true); setNotice(null);
    try {
      const path = section === 'overview' ? 'overview' : section === 'users' ? `users${query ? `?q=${encodeURIComponent(query)}` : ''}` : section === 'credits' ? (selectedEmail ? `credits?email=${encodeURIComponent(selectedEmail)}` : 'users') : section === 'subscriptions' ? 'plans' : 'features';
      const result = section === 'overview' ? await (async () => { const [summary, activity] = await Promise.all([request('overview'), request('activities')]); return { ...summary, activities: activity.activities || [] }; })() : await request(path); setData(result); if (section === 'credits' && result.users) setCreditUsers(result.users);
    } catch (error) { setNotice({ error: error.response?.data?.error || 'API admin indisponible.' }); }
    finally { setLoading(false); }
  }, [request, section, query, selectedEmail]);
  useEffect(() => { load(); }, [load]);

  const saveCredits = async () => {
    const value = Number(amount); if (!selectedEmail || !Number.isFinite(value) || value === 0) return setNotice({ error: 'Sélectionnez un utilisateur et un montant valide.' });
    setSaving(true); try { await request('credits', { method: 'POST', data: { email: selectedEmail, amount: value, reason: 'Ajustement depuis whatsapp-grok-platform' } }); setAmount(''); setNotice({ text: 'Solde mis à jour.' }); await load(); } catch (error) { setNotice({ error: error.response?.data?.error || 'Modification impossible.' }); } finally { setSaving(false); }
  };
  const toggleFeature = async (key, value) => { setData(prev => ({ ...prev, features: prev.features.map(item => item.feature_key === key ? { ...item, enabled: value ? 1 : 0 } : item) })); try { await request('features', { method: 'PUT', data: { features: { [key]: value } } }); } catch { setNotice({ error: 'Fonctionnalité non sauvegardée.' }); await load(); } };

  if (loading) return <div className="central-admin-state">Chargement sécurisé de l’API centrale…</div>;
  if (notice?.error && !data) return <div className="central-admin-state error">{notice.error}<button onClick={load}>Réessayer</button></div>;
  if (section === 'overview') return <><div className="central-admin-grid">{[['Utilisateurs', data?.users, 'Comptes dans la base centrale'], ['Crédits en circulation', credits(data?.credits_balance), 'Solde cumulé'], ['Paiements approuvés', data?.approved_payments, 'Transactions FedaPay'], ['Chiffre d’affaires', money(data?.revenue_xof), 'Paiements confirmés'], ['Abonnements actifs', data?.active_plans, 'Offres disponibles']].map(([title, value, desc]) => <article className="central-admin-stat" key={title}><span>{title}</span><strong>{value}</strong><small>{desc}</small></article>)}</div><section className="central-admin-card central-activity-card"><div className="central-admin-toolbar"><div><h3>Activités récentes</h3><p>Événements remontés par whatsapp-grok-platform.</p></div><button onClick={load}>Actualiser</button></div><div className="central-admin-table">{(data?.activities || []).slice(0, 12).map(activity => <div className="central-admin-row" key={activity.id}><div><strong>{activity.event_type}</strong><span>{activity.name || activity.email || 'Compte inconnu'}</span></div><small>{new Date(activity.created_at).toLocaleString('fr-FR')}</small><b>{activity.tokens_used ? `${activity.tokens_used} tokens` : '—'}</b></div>)}</div></section></>;
  if (section === 'users') return <section className="central-admin-card"><div className="central-admin-toolbar"><div><h3>Utilisateurs centraux</h3><p>Comptes et licences gérés par botora-admin.</p></div><div className="central-admin-search"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher…" /><button onClick={load}>Rechercher</button></div></div><div className="central-admin-table">{(data?.users || []).map(user => <div className="central-admin-row" key={user.id}><div><strong>{user.name}</strong><span>{user.email}</span><small>{user.license_key}</small></div><span className={`central-status ${user.status}`}>{user.status}</span><b>{credits(user.credits_balance)} crédits</b></div>)}</div></section>;
  if (section === 'credits') return <section className="central-admin-card"><div className="central-admin-toolbar"><div><h3>Crédits centraux</h3><p>Solde et journal des opérations.</p></div><select value={selectedEmail} onChange={e => setSelectedEmail(e.target.value)}><option value="">Choisir un utilisateur</option>{(creditUsers.length ? creditUsers : (data?.users || [])).map(user => <option key={user.id} value={user.email}>{user.name} — {user.email}</option>)}</select></div>{data?.user && <><div className="central-balance">{credits(data.user.credits_balance)} <small>crédits</small></div><div className="central-credit-form"><input type="number" step="0.001" value={amount} onChange={e => setAmount(e.target.value)} placeholder="+ crédits ou - crédits" /><button disabled={saving} onClick={saveCredits}>{saving ? '…' : 'Appliquer'}</button></div><div className="central-admin-table">{(data.transactions || []).map(tx => <div className="central-admin-row" key={tx.id}><div><strong>{credits(tx.amount)} crédits</strong><span>{tx.reason || tx.type}</span></div><small>{new Date(tx.created_at).toLocaleString('fr-FR')}</small><b>{credits(tx.balance_after)}</b></div>)}</div></>}</section>;
  if (section === 'subscriptions') return <section className="central-admin-card"><div className="central-admin-toolbar"><div><h3>Abonnements</h3><p>Offres actuellement publiées par botora-admin.</p></div><button onClick={load}>Actualiser</button></div><div className="central-plan-grid">{(data?.plans || []).map(plan => <article key={plan.id} className="central-plan"><span>{plan.is_active ? 'Actif' : 'Inactif'}</span><h4>{plan.name}</h4><strong>{money(plan.price_xof)}</strong><p>{credits(plan.credits_per_month)} crédits/mois</p><small>{plan.max_profiles} profil(s)</small></article>)}</div></section>;
  return <section className="central-admin-card"><div className="central-admin-toolbar"><div><h3>Fonctionnalités centrales</h3><p>Les changements sont appliqués par l’API centrale.</p></div><button onClick={load}>Actualiser</button></div><div className="central-feature-list">{(data?.features || []).map(feature => <label key={feature.feature_key}><span><strong>{feature.label}</strong><small>{feature.description}</small></span><input type="checkbox" checked={Boolean(Number(feature.enabled))} onChange={e => toggleFeature(feature.feature_key, e.target.checked)} /><i /></label>)}</div></section>;
}
