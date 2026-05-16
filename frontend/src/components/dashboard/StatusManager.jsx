import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './StatusManager.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function formatDate(d) {
  const date = new Date(d);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) +
    ' à ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function StatusManager({ socket }) {
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [type, setType] = useState('text');
  const [textContent, setTextContent] = useState('');
  const [imageBase64, setImageBase64] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [caption, setCaption] = useState('');

  const loadStatuses = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/status`);
      setStatuses(res.data);
    } catch (err) {
      console.error('Erreur chargement statuts:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatuses(); }, [loadStatuses]);

  // Real-time view count update
  useEffect(() => {
    if (!socket) return;
    const handler = ({ waMsgId }) => {
      setStatuses(prev => prev.map(s =>
        s.wa_msg_id === waMsgId ? { ...s, view_count: s.view_count + 1 } : s
      ));
    };
    socket.on('status-view-update', handler);
    return () => socket.off('status-view-update', handler);
  }, [socket]);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Seules les images sont acceptées (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image trop lourde (max 5 Mo).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target.result;
      setImagePreview(result);
      // Strip prefix: "data:image/jpeg;base64,..."
      setImageBase64(result.split(',')[1]);
    };
    reader.readAsDataURL(file);
  };

  const resetModal = () => {
    setType('text');
    setTextContent('');
    setImageBase64(null);
    setImagePreview(null);
    setCaption('');
    setShowModal(false);
  };

  const handlePublish = async () => {
    if (type === 'text' && !textContent.trim()) return;
    if (type === 'image' && !imageBase64) return;
    setPublishing(true);
    try {
      const body = type === 'text'
        ? { content: textContent.trim(), type: 'text' }
        : { content: caption.trim() || 'Image', type: 'image', mediaBase64: imageBase64 };
      const res = await axios.post(`${API_URL}/status`, body);
      setStatuses(prev => [res.data, ...prev]);
      resetModal();
    } catch (err) {
      alert('Erreur lors de la publication: ' + (err.response?.data?.error || err.message));
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce statut ?')) return;
    try {
      await axios.delete(`${API_URL}/status/${id}`);
      setStatuses(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      alert('Erreur suppression: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="status-manager">
      <div className="status-header">
        <h2>Statuts WhatsApp</h2>
        <button className="btn-new-status" onClick={() => setShowModal(true)}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          Nouveau statut
        </button>
      </div>

      <div className="status-notice">
        <strong>ℹ️ Comment ça fonctionne :</strong> Publiez du <strong>texte</strong> ou des <strong>images</strong> (JPG, PNG — max 5 Mo) directement depuis Botora. Les vidéos ne sont pas supportées. Les statuts expirent automatiquement après <strong>24h</strong> sur WhatsApp. Le compteur de vues se met à jour en temps réel à chaque fois qu'un contact visionne votre statut.
      </div>

      <div className="status-list">
        {loading ? (
          <div className="status-empty"><p>Chargement…</p></div>
        ) : statuses.length === 0 ? (
          <div className="status-empty">
            <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
            <p>Aucun statut publié</p>
          </div>
        ) : statuses.map(s => (
          <div key={s.id} className="status-card">
            <div className="status-type-icon">
              {s.type === 'image' ? '🖼️' : '📝'}
            </div>
            <div className="status-card-body">
              <div className="status-card-content">{s.content}</div>
              <div className="status-card-meta">
                <span>{formatDate(s.created_at)}</span>
                <span className="status-views">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                  {s.view_count} vue{s.view_count !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <div className="status-card-actions">
              <button className="btn-delete-status" onClick={() => handleDelete(s.id)} title="Supprimer">
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="status-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) resetModal(); }}>
          <div className="status-modal">
            <h3>Publier un statut</h3>

            <div className="status-type-tabs">
              <button className={`type-tab ${type === 'text' ? 'active' : ''}`} onClick={() => setType('text')}>
                <span>📝</span> Texte
              </button>
              <button className={`type-tab ${type === 'image' ? 'active' : ''}`} onClick={() => setType('image')}>
                <span>🖼️</span> Image
              </button>
            </div>

            {type === 'text' ? (
              <textarea
                className="status-textarea"
                placeholder="Écrivez votre statut…"
                value={textContent}
                onChange={e => setTextContent(e.target.value)}
                maxLength={700}
                autoFocus
              />
            ) : (
              <div>
                {imagePreview ? (
                  <>
                    <img src={imagePreview} alt="Aperçu" className="status-image-preview" />
                    <button className="btn-cancel" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => { setImageBase64(null); setImagePreview(null); }}>
                      Changer l'image
                    </button>
                  </>
                ) : (
                  <label className="status-image-upload">
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageSelect} />
                    <svg viewBox="0 0 24 24" fill="currentColor" width="36" height="36" style={{ opacity: 0.3 }}><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                    <p>Cliquez pour choisir une image (JPG, PNG, WebP — max 5 Mo)</p>
                  </label>
                )}
                <input
                  className="status-caption-input"
                  placeholder="Légende (optionnel)"
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  maxLength={200}
                />
              </div>
            )}

            <div className="status-modal-actions">
              <button className="btn-cancel" onClick={resetModal}>Annuler</button>
              <button
                className="btn-publish"
                onClick={handlePublish}
                disabled={publishing || (type === 'text' && !textContent.trim()) || (type === 'image' && !imageBase64)}
              >
                {publishing ? 'Publication…' : 'Publier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
