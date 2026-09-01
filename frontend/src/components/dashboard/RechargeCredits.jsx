import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import './RechargeCredits.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const fmt = (n, max = 3) => Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: max });

export default function RechargeCredits({ creditBalance, onBack, onBalanceRefresh }) {
  const [config, setConfig] = useState({ minCredits: 5, xofPerCredit: 120, tokensPerUnit: 100000, creditsPerTokenUnit: 1, xofPerTokenUnit: 120, feesNotice: '' });
  const [credits, setCredits] = useState('5');
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState(null);
  const [pollingId, setPollingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([axios.get(`${API_URL}/payments/config`), axios.get(`${API_URL}/payments/transactions`)]);
      setConfig(c.data); setTransactions(t.data);
    } catch { setMessage({ error: 'Impossible de charger les informations de paiement.' }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment')) { setMessage({ text: 'Retour de FedaPay reçu. Votre solde sera actualisé dès confirmation du paiement.' }); load(); }
  }, [load]);

  const qty = Math.max(0, Number(credits) || 0);
  const amount = Math.round(qty * (config.xofPerCredit || 120));
  const startPolling = useCallback((id) => {
    let attempts = 0;
    const finalStatuses = new Set(['approved', 'canceled', 'declined', 'deleted', 'creation_failed']);
    const timer = window.setInterval(async () => {
      attempts += 1;
      try {
        const r = await axios.post(`${API_URL}/payments/transactions/${id}/verify`);
        const status = String(r.data?.status || 'pending').toLowerCase();
        await load();
        if (status === 'approved') {
          setMessage({ text: `Paiement approuvé. ${fmt(r.data.credits)} crédit(s) ont été ajoutés.` });
          onBalanceRefresh?.();
        } else if (finalStatuses.has(status) && status !== 'pending') {
          setMessage({ error: r.data?.message || `Paiement terminé avec le statut : ${status}.` });
        } else if (attempts >= 36) {
          setMessage({ error: 'La vérification automatique a expiré. Consultez l’historique ou relancez une vérification.' });
        } else return;
        window.clearInterval(timer); setPollingId(null);
      } catch (_) {
        if (attempts >= 36) { window.clearInterval(timer); setPollingId(null); setMessage({ error: 'Le suivi du paiement a expiré. Vous pouvez vérifier son statut depuis l’historique.' }); }
      }
    }, 5000);
    setPollingId(timer);
  }, [load, onBalanceRefresh]);

  useEffect(() => () => { if (pollingId) window.clearInterval(pollingId); }, [pollingId]);

  const checkout = async () => {
    if (qty < config.minCredits) return setMessage({ error: `Le minimum est de ${config.minCredits} crédits.` });
    setPaying(true); setMessage(null);
    try {
      const r = await axios.post(`${API_URL}/payments/checkout`, { credits: qty });
      if (!r.data?.paymentUrl || !/^https:\/\/.+fedapay\.com\//i.test(r.data.paymentUrl)) throw new Error('L’API n’a pas retourné une URL FedaPay valide.');
      const paymentWindow = window.open(r.data.paymentUrl, '_blank', 'noopener,noreferrer');
      if (!paymentWindow) window.location.assign(r.data.paymentUrl);
      setMessage({ text: 'Paiement ouvert dans un nouvel onglet. Botora vérifie automatiquement son statut toutes les 5 secondes.' });
      startPolling(r.data.paymentId);
    } catch (e) {
      setMessage({ error: e.response?.data?.error || e.response?.data?.details || e.message || 'Création du paiement impossible.' });
    } finally { setPaying(false); }
  };
  const verify = async (id) => {
    try { const r = await axios.post(`${API_URL}/payments/transactions/${id}/verify`); setMessage(r.data.status === 'approved' ? { text: r.data.message || 'Paiement approuvé et crédits ajoutés.' } : { text: r.data.message || `Statut : ${r.data.status}` }); await load(); if (r.data.status === 'approved') onBalanceRefresh?.(); }
    catch (e) { setMessage({ error: e.response?.data?.error || 'Vérification impossible.' }); }
  };
  const statusLabel = { pending: 'En attente', approved: 'Approuvée', canceled: 'Annulée', declined: 'Refusée', deleted: 'Supprimée', creation_failed: 'Échec' };
  return <section className="recharge-page">
    <header className="recharge-header"><div><span className="recharge-eyebrow">Portefeuille Botora</span><h1>Recharger mes crédits</h1><p>{fmt(config.tokensPerUnit, 0)} tokens = {fmt(config.creditsPerTokenUnit, 6)} crédit(s) = {fmt(config.xofPerTokenUnit, 2)} F CFA.</p></div><button className="recharge-back" onClick={onBack}>← Tableau de bord</button></header>
    <div className="recharge-grid">
      <article className="recharge-card recharge-form-card"><div className="recharge-balance"><span>Solde actuel</span><strong>{fmt(creditBalance)} crédits</strong></div><label>Nombre de crédits<input type="number" min={config.minCredits} step="0.001" value={credits} onChange={e => setCredits(e.target.value)} /></label><div className="recharge-total"><span>Montant à payer</span><strong>{fmt(amount, 0)} F CFA</strong></div><p className="recharge-fees">{config.feesNotice || 'Les frais FedaPay, estimés entre 1,5 % et 4 %, restent à votre charge. Prévoyez jusqu’à 4 % supplémentaires.'}</p><button className="recharge-submit" onClick={checkout} disabled={paying || pollingId}>{paying ? 'Préparation du paiement…' : 'Payer avec FedaPay'}</button>{message && <div className={`recharge-message ${message.error ? 'error' : ''}`}>{message.error || message.text}</div>}</article>
      <article className="recharge-card recharge-info-card"><span className="recharge-icon">◉</span><h2>Une tarification simple</h2><p>Le montant est calculé automatiquement selon le nombre de crédits choisi. Les crédits peuvent être décimaux et sont conservés avec une précision de dix chiffres.</p><div className="recharge-equation"><strong>{fmt(config.tokensPerUnit, 0)} tokens</strong><span>=</span><strong>{fmt(config.creditsPerTokenUnit, 6)} crédit(s)</strong><span>=</span><strong>{fmt(config.xofPerTokenUnit, 2)} F CFA</strong></div></article>
    </div>
    <section className="recharge-history"><div className="recharge-section-title"><div><span className="recharge-eyebrow">Suivi des paiements</span><h2>Mes transactions</h2></div><button onClick={load}>Actualiser</button></div>{loading ? <div className="recharge-empty">Chargement…</div> : transactions.length === 0 ? <div className="recharge-empty">Aucune transaction pour le moment.</div> : <div className="recharge-table">{transactions.map(t => { const isPending = (t.status || 'pending') === 'pending'; const lessThan2Hours = Date.now() - new Date(t.created_at).getTime() < 7200000; return <div className="recharge-row" key={t.id}><div><strong>{fmt(t.credits)} crédits</strong><span>{fmt(t.amount_xof, 0)} F CFA · {new Date(t.created_at).toLocaleString('fr-FR')}</span><span style={{ display: 'block', marginTop: 4, fontSize: 12, opacity: 0.8 }}>Transaction: {t.external_id || t.transaction_id || '—'}</span></div><span className={`recharge-status ${t.status}`}>{statusLabel[t.status] || t.status}</span>{isPending && lessThan2Hours && <button onClick={() => verify(t.id)}>Vérifier</button>}</div>; })}</div>}</section>
  </section>;
}
