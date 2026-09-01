import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useLanguage } from '../../context/LanguageContext';
import './CreditUsage.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const PAGE_SIZES = [50, 100, 500, 1000];
const fmt = (value, max = 3) => Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits: max });

export default function CreditUsage({ onBack }) {
  const { t, language } = useLanguage();
  const [usage, setUsage] = useState([]);
  const [summary, setSummary] = useState({ occurrences: 0, tokens_used: 0, credits_used: 0 });
  const [pagination, setPagination] = useState({ page: 1, pages: 1, per_page: 50, total: 0 });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (nextPage = page, nextPerPage = perPage) => {
    setLoading(true); setError('');
    try {
      const response = await axios.get(`${API_URL}/payments/usage`, { params: { page: nextPage, per_page: nextPerPage } });
      setUsage(response.data?.usage || []);
      setSummary(response.data?.summary || { occurrences: 0, tokens_used: 0, credits_used: 0 });
      setPagination(response.data?.pagination || { page: nextPage, pages: 1, per_page: nextPerPage, total: 0 });
    } catch (err) {
      setError(err.response?.data?.error || (language === 'fr' ? 'Impossible de charger l’utilisation des crédits.' : 'Unable to load credit usage.'));
    } finally { setLoading(false); }
  }, [language]);

  useEffect(() => { load(1, perPage); }, [load, perPage]);

  const changePage = (nextPage) => { setPage(nextPage); load(nextPage, perPage); };
  const changeSize = (event) => { const next = Number(event.target.value); setPerPage(next); setPage(1); load(1, next); };

  return <section className="credit-usage-page">
    <header className="credit-usage-header"><div><span className="credit-usage-eyebrow">Botora</span><h1>{t('Credit usage')}</h1><p>{t('View how your credits are consumed by the platform.')}</p></div><button className="credit-usage-back" onClick={onBack}>← {t('Back')}</button></header>
    <div className="credit-usage-summary">
      <article><span>{t('Usage details')}</span><strong>{fmt(summary.occurrences, 0)}</strong><small>occurrence(s)</small></article>
      <article><span>{t('Tokens used')}</span><strong>{fmt(summary.tokens_used, 0)}</strong><small>tokens</small></article>
      <article><span>{t('Credits consumed')}</span><strong>{fmt(summary.credits_used, 6)}</strong><small>crédit(s)</small></article>
    </div>
    <div className="credit-usage-card">
      <div className="credit-usage-toolbar"><div><h2>{t('Credit usage history')}</h2><span>{fmt(pagination.total, 0)} occurrence(s)</span></div><label>{t('Rows per page')}<select value={perPage} onChange={changeSize}>{PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select></label></div>
      {error && <div className="credit-usage-error">{error}</div>}
      {loading ? <div className="credit-usage-empty">{t('Loading...')}</div> : usage.length === 0 ? <div className="credit-usage-empty">{t('No credit usage recorded yet.')}</div> : <div className="credit-usage-table-wrap"><table><thead><tr><th>{t('Date')}</th><th>{t('Event')}</th><th>{t('Tokens used')}</th><th>{t('Credits consumed')}</th><th>{t('Conversion applied')}</th><th>{t('Usage details')}</th></tr></thead><tbody>{usage.map(row => { let meta = {}; try { meta = JSON.parse(row.metadata || '{}'); } catch (_) {} return <tr key={row.id}><td>{new Date(row.created_at).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-US')}</td><td><span className="credit-event">{row.event_type}</span></td><td>{fmt(row.tokens_used, 0)}</td><td><strong>{fmt(row.credits_used, 6)}</strong></td><td>100 000 → {fmt(row.credits_per_unit, 6)} crédit(s)<br /><small>{fmt(row.xof_per_unit, 2)} XOF</small></td><td><details><summary>{t('View')}</summary><pre>{JSON.stringify(meta, null, 2)}</pre></details></td></tr>; })}</tbody></table></div>}
      <div className="credit-usage-pagination"><span>{t('Page')} {pagination.page} / {pagination.pages}</span><div><button disabled={pagination.page <= 1 || loading} onClick={() => changePage(pagination.page - 1)}>← {t('Previous')}</button><button disabled={pagination.page >= pagination.pages || loading} onClick={() => changePage(pagination.page + 1)}>{t('Next')} →</button></div></div>
    </div>
  </section>;
}
