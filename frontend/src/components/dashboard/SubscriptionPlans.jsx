import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import './SubscriptionPlans.css';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function SubscriptionPlans({ onBack }) {
  const { token, refreshAccount } = useAuth();
  const { language, t } = useLanguage();
  const [offer, setOffer] = useState(null);
  const [access, setAccess] = useState(null);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) { setError(t('Please log in to view subscriptions.')); setLoading(false); return; }
    try {
      const response = await axios.get(`${API_URL}/subscriptions`);
      setOffer(response.data?.offer || null);
      setAccess(response.data?.access || null);
      const payments = await axios.get(`${API_URL}/payments/subscription/transactions`);
      setPendingPayment((payments.data || []).find(item => item.status === 'pending') || null);
    } catch (err) {
      setError(err.response?.data?.error || t('The annual offer is not available right now.'));
    } finally { setLoading(false); }
  }, [token, t]);

  useEffect(() => { load(); }, [load]);

  const subscribe = async () => {
    setPaying(true); setError(''); setMessage('');
    try {
      const response = await axios.post(`${API_URL}/payments/subscription/checkout`);
      setPendingPayment({ id: response.data.paymentId, paymentUrl: response.data.paymentUrl, status: 'pending' });
      setMessage(t('Payment page opened. Complete the payment, then click Verify payment.'));
      window.open(response.data.paymentUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err.response?.data?.error || t('Unable to create the subscription payment.'));
    } finally { setPaying(false); }
  };

  const verify = async () => {
    if (!pendingPayment?.id) return;
    setVerifying(true); setError(''); setMessage('');
    try {
      const response = await axios.post(`${API_URL}/payments/subscription/${pendingPayment.id}/verify`);
      if (response.data?.approved || response.data?.status === 'approved') {
        setMessage(t('Subscription activated for one year.'));
        setPendingPayment(null);
        await refreshAccount();
        await load();
      } else setMessage(response.data?.message || t('Payment is not approved yet.'));
    } catch (err) {
      setError(err.response?.data?.error || t('Subscription payment verification is temporarily unavailable.'));
    } finally { setVerifying(false); }
  };

  const dateLabel = (date) => date ? new Date(date).toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR') : '—';
  const active = access?.access_allowed && access?.access_type !== 'expired';

  return <section className="subscription-public">
    <header className="subscription-public-hero"><div><span>{t('Botora offer')}</span><h1>{t('Annual subscription')}</h1><p>{t('Use the full platform during your trial or with an active annual subscription.')}</p></div>{onBack && <button onClick={onBack}>← {t('Back')}</button>}</header>
    {access && <div className={`subscription-access-banner ${active ? 'active' : 'expired'}`}>
      <strong>{active ? (access.access_type === 'trial' ? t('Free trial active') : t('Annual subscription active')) : t('Subscription required')}</strong>
      <span>{active ? `${t('Access until')} ${dateLabel(access.access_ends_at)}` : t('Your trial or subscription has ended. Subscribe to continue using the platform.')}</span>
    </div>}
    {message && <div className="subscription-public-state success">{message}</div>}
    {error && <div className="subscription-public-state error">{error}</div>}
    {pendingPayment && <div className="subscription-pending-payment"><span>{t('A payment is awaiting confirmation.')}</span><button onClick={verify} disabled={verifying}>{verifying ? t('Verifying...') : t('Verify payment')}</button></div>}
    {loading ? <div className="subscription-public-state">{t('Loading...')}</div> : !offer || !offer.is_active || offer.price <= 0 ? <div className="subscription-public-state">{t('The annual offer is not available right now.')}</div> : <div className="subscription-public-grid"><article className="subscription-public-card featured"><div className="subscription-public-card-top"><span>{t('One year')}</span><h2>{offer.name}</h2><p>{t('One annual payment. Renewals extend access and never recreate the trial.')}</p></div><div className="subscription-public-price">{Number(offer.price).toLocaleString(language === 'en' ? 'en-GB' : 'fr-FR')} <small>{offer.currency}</small></div><div className="subscription-public-meta">{offer.duration_days} {t('days')} · {t('Unlimited access during the period')}</div><ul><li>✓ {t('All enabled platform features')}</li><li>✓ {t('Server-side access protection')}</li><li>✓ {t('Credits remain separately consumable')}</li></ul><button className="subscription-public-cta" onClick={subscribe} disabled={paying}>{paying ? t('Opening payment...') : t('Subscribe for one year')}</button></article></div>}
  </section>;
}
