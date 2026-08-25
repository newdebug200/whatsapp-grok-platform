import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import './StorageManager.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const formatBytes = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} Mo`;
  return `${(bytes / 1024 ** 3).toFixed(2)} Go`;
};

export default function StorageManager({ isAdmin = false }) {
  const [storage, setStorage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const response = await axios.get(`${API_URL}/dashboard/storage`); setStorage(response.data); }
    catch (_) { setError('Impossible de calculer le stockage local.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const cleanup = async (kind, label) => {
    if (!window.confirm(`Confirmer la suppression de ${label} ? Cette action est irréversible.`)) return;
    setDeleting(kind); setNotice(''); setError('');
    try {
      const response = await axios.delete(`${API_URL}/dashboard/storage/${kind}`);
      setNotice(`${response.data.deleted || 0} élément(s) supprimé(s).`);
      await load();
    } catch (_) { setError('La suppression n’a pas pu être effectuée.'); }
    finally { setDeleting(''); }
  };

  const items = storage ? [
    { kind: 'media', icon: '▧', title: 'Médias téléchargés', description: 'Images, vidéos, audios et documents conservés dans les messages ou campagnes.', value: formatBytes(storage.media?.bytes), detail: `${storage.media?.files || 0} fichier(s)`, action: 'Supprimer les médias' },
    ...(isAdmin ? [{ kind: 'local-queue', icon: '≡', title: 'File locale Dressursite', description: 'Numéros et messages copiés dans la file locale. La file en ligne ne sera pas touchée.', value: `${storage.localQueue?.items || 0}`, detail: 'élément(s)', action: 'Vider la file locale' }] : []),
    { kind: 'archived-messages', icon: '⌫', title: 'Messages archivés', description: 'Messages appartenant à des contacts déjà archivés. Les contacts et réglages sont conservés.', value: `${storage.archivedMessages?.items || 0}`, detail: 'message(s)', action: 'Supprimer les messages archivés', danger: true },
  ] : [];

  return (
    <section className="storage-manager">
      <header className="storage-manager-hero"><div><span className="storage-eyebrow">Maintenance</span><h1>Données et stockage</h1><p>Libérez de l’espace local sans supprimer vos réglages ni votre compte.</p></div><button className="storage-refresh" onClick={load} disabled={loading}>↻ Actualiser</button></header>
      <div className="storage-safety"><span>✓</span><div><strong>Nettoyage sécurisé par profil</strong><p>Chaque action est limitée au profil WhatsApp actif. Les suppressions sont définitives et nécessitent une confirmation.</p></div></div>
      {notice && <div className="storage-notice">{notice}</div>}
      {error && <div className="storage-error">{error}</div>}
      {loading ? <div className="storage-loading">Calcul du stockage…</div> : <div className="storage-grid">{items.map(item => <article className={`storage-card ${item.danger ? 'danger' : ''}`} key={item.kind}><div className="storage-card-icon">{item.icon}</div><div className="storage-card-copy"><h2>{item.title}</h2><p>{item.description}</p><div className="storage-card-meta"><strong>{item.value}</strong><span>{item.detail}</span></div></div><button className="storage-delete" onClick={() => cleanup(item.kind, item.title.toLowerCase())} disabled={deleting === item.kind || item.value === '0 o' || item.value === '0'}>{deleting === item.kind ? 'Suppression…' : item.action}</button></article>)}</div>}
      <p className="storage-footnote">Le cache mémoire temporaire est automatiquement libéré au redémarrage du serveur. Les dépendances de l’application ne sont pas supprimables depuis cette page.</p>
    </section>
  );
}
