import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './SubscriptionPlans.css';
import { useAuth } from '../../context/AuthContext';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
export default function SubscriptionPlans({ onBack }) {
  const { token } = useAuth();
  const [plans, setPlans] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => {
    if (!token) { setError('Connectez-vous pour consulter les abonnements.'); setLoading(false); return undefined; }
    let cancelled = false;
    axios.get(`${API_URL}/subscriptions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(response => { if (!cancelled) setPlans(Array.isArray(response.data) ? response.data : []); })
      .catch(err => { if (!cancelled) setError(err.response?.data?.error || 'Les abonnements ne sont pas disponibles pour le moment.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);
  return <section className="subscription-public"><header className="subscription-public-hero"><div><span>Offres Botora</span><h1>Choisissez l’offre adaptée à votre activité</h1><p>Des formules simples pour automatiser vos conversations WhatsApp avec clarté.</p></div>{onBack && <button onClick={onBack}>← Retour</button>}</header>{loading ? <div className="subscription-public-state">Chargement des offres…</div> : error ? <div className="subscription-public-state error">{error}</div> : plans.length === 0 ? <div className="subscription-public-state">Aucune offre disponible pour le moment.</div> : <div className="subscription-public-grid">{plans.map((plan, index) => <article className={`subscription-public-card ${index === 1 ? 'featured' : ''}`} key={plan.id}><div className="subscription-public-card-top"><span>{index === 1 ? 'Recommandé' : 'Botora'}</span><h2>{plan.name}</h2><p>{plan.description || 'Une formule pensée pour votre organisation.'}</p></div><div className="subscription-public-price">{plan.price.toLocaleString('fr-FR')} <small>{plan.currency}</small></div><div className="subscription-public-meta">{plan.credits} crédits · {plan.duration_days} jours · {plan.max_profiles} profil(s)</div><ul>{plan.features.map((feature, i) => <li key={i}>✓ {feature}</li>)}</ul><button className="subscription-public-cta">Choisir cette offre</button></article>)}</div>}</section>;
}
