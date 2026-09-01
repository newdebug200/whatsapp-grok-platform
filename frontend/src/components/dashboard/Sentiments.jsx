import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import './Sentiments.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const SENTIMENT_LABELS = {
  positif: 'Positif', neutre: 'Neutre', negatif: 'Négatif', colere: 'Colère',
  satisfait: 'Satisfait', frustre: 'Frustré', inquiet: 'Inquiet', confus: 'Confus',
  reconnaissant: 'Reconnaissant', urgent: 'Urgent'
};

export default function Sentiments({ onSelectContact, onBack }) {
  const [filter, setFilter] = useState('negative');
  const [messages, setMessages] = useState([]);
  const [counts, setCounts] = useState({ all: 0, angry: 0, negative: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_URL}/dashboard/sentiments`, { params: { filter } });
      setMessages(response.data.messages || []);
      setCounts(response.data.counts || { all: 0, angry: 0, negative: 0 });
    } catch (err) {
      setError('Impossible de charger les alertes de sentiment.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="sentiments-page">
      <header className="sentiments-hero">
        <div>
          <span className="sentiments-eyebrow">Analyse client</span>
          <h1>Traitement des sentiments</h1>
          <p>Identifiez rapidement les clients qui nécessitent une réponse ou une intervention.</p>
        </div>
        <div className="sentiments-header-actions">
          {onBack && <button className="sentiments-back" onClick={onBack}>← Retour</button>}
          <button className="sentiments-refresh" onClick={load} disabled={loading} aria-label="Actualiser">↻ Actualiser</button>
        </div>
      </header>

      <div className="sentiments-stats">
        <div className="sentiment-stat sentiment-stat-total"><span>Total analysé</span><strong>{counts.all || 0}</strong><small>Messages classés</small></div>
        <div className="sentiment-stat sentiment-stat-angry"><span>Colère</span><strong>{counts.colere || 0}</strong><small>Intervention prioritaire</small></div>
        <div className="sentiment-stat sentiment-stat-negative"><span>Frustré</span><strong>{counts.frustre || 0}</strong><small>À surveiller</small></div>
        <div className="sentiment-stat sentiment-stat-worried"><span>Inquiet</span><strong>{counts.inquiet || 0}</strong><small>Rassurer le client</small></div>
        <div className="sentiment-stat sentiment-stat-urgent"><span>Urgent</span><strong>{counts.urgent || 0}</strong><small>Action rapide</small></div>
      </div>

      <div className="sentiments-toolbar">
        <div><h2>À traiter maintenant</h2><p>Les messages non lus classés par sentiment négatif.</p></div>
        <div className="sentiments-filters" role="group" aria-label="Filtrer les sentiments">
          {[['negative', 'Prioritaires'], ['angry', 'Colère'], ['frustrated', 'Frustrés'], ['worried', 'Inquiets'], ['confused', 'Confus'], ['urgent', 'Urgents'], ['all', 'Tous']].map(([key, label]) => (
            <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
      </div>

      {error && <div className="sentiments-error">{error} <button onClick={load}>Réessayer</button></div>}
      {loading ? <div className="sentiments-empty">Chargement des alertes…</div> : messages.length === 0 ? (
        <div className="sentiments-empty sentiments-success"><span>✓</span><strong>Aucune alerte en attente</strong><p>Les sentiments négatifs non lus apparaîtront ici.</p></div>
      ) : (
        <div className="sentiments-list">
          {messages.map(message => (
            <article className={`sentiment-row ${message.sentiment === 'colere' ? 'is-angry' : ''}`} key={message.id}>
              <div className="sentiment-avatar">{(message.contact?.name || message.contact?.phone_number || '?').charAt(0).toUpperCase()}</div>
              <div className="sentiment-message">
                <div className="sentiment-row-head"><strong>{message.contact?.name || message.contact?.phone_number}</strong><span>{SENTIMENT_LABELS[message.sentiment] || 'À surveiller'}</span></div>
                <p>{message.content || 'Message sans contenu'}</p>
                <small>{new Date(message.created_at).toLocaleString('fr-FR')}</small>
              </div>
              <button className="sentiment-open" onClick={() => onSelectContact?.(message.contact)}>Ouvrir la discussion →</button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
