import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function ConversationList({ contacts, selectedContact, onSelectContact, onContactsUpdate, waStatus, socket, onConnectWhatsApp }) {
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState([]);
  const [activeTagId, setActiveTagId] = useState(null);

  const loadTags = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/tags`);
      setTags(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  useEffect(() => {
    if (socket) {
      const refresh = () => loadConversations();
      socket.on('new-message', refresh);
      return () => socket.off('new-message', refresh);
    }
  }, [socket]);

  const loadConversations = async () => {
    try {
      const res = await axios.get(`${API_URL}/messages/conversations`);
      const sorted = res.data.sort((a, b) => {
        const da = a.messages[0]?.created_at || a.created_at;
        const db = b.messages[0]?.created_at || b.created_at;
        return new Date(db) - new Date(da);
      });
      onContactsUpdate(sorted);
    } catch (err) {
      console.error('Erreur chargement conversations:', err);
    }
  };

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.phone_number?.toLowerCase().includes(q) || c.name?.toLowerCase().includes(q);
    const matchTag = !activeTagId || c.tags?.some(ct => ct.tag_id === activeTagId);
    return matchSearch && matchTag;
  });

  const formatTime = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / 86400000);
    if (days === 0) return format(date, 'HH:mm');
    if (days === 1) return 'Hier';
    if (days < 7) return format(date, 'EEEE', { locale: fr });
    return format(date, 'dd/MM/yy');
  };

  const getInitial = (contact) => (contact.name || contact.phone_number || '?').charAt(0).toUpperCase();
  const getDisplayName = (contact) => contact.name || contact.phone_number;
  const avatarColors = ['#25d366', '#128c7e', '#075e54', '#34b7f1', '#667eea', '#f6c90e', '#fd79a8'];
  const getColor = (id) => avatarColors[id % avatarColors.length];

  return (
    <div className="conversation-list">
      {!waStatus.isConnected && (
        <div className="wa-connect-banner">
          <span>WhatsApp non connecté</span>
          <button onClick={onConnectWhatsApp}>Connecter</button>
        </div>
      )}

      <div className="search-container">
        <div className="search-input-wrapper">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Rechercher une discussion..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
          />
          {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="tag-filter-bar">
          <button
            className={`tag-filter-chip ${!activeTagId ? 'active' : ''}`}
            onClick={() => setActiveTagId(null)}
          >
            Tous
          </button>
          {tags.map(tag => (
            <button
              key={tag.id}
              className={`tag-filter-chip ${activeTagId === tag.id ? 'active' : ''}`}
              style={activeTagId === tag.id ? { background: tag.color, borderColor: tag.color } : { borderColor: tag.color, color: tag.color }}
              onClick={() => setActiveTagId(prev => prev === tag.id ? null : tag.id)}
            >
              <span
                className="tag-filter-dot"
                style={{ background: activeTagId === tag.id ? '#fff' : tag.color }}
              />
              {tag.name}
            </button>
          ))}
        </div>
      )}

      <div className="contacts-scroll">
        {filtered.length === 0 ? (
          <div className="empty-list">
            {search || activeTagId ? 'Aucun résultat' : 'Aucune conversation'}
          </div>
        ) : (
          filtered.map(contact => {
            const lastMsg = contact.messages[0];
            const isSelected = selectedContact?.id === contact.id;
            const isPaused = contact.ia_paused;
            const contactTags = contact.tags?.map(ct => ct.tag).filter(Boolean) || [];
            return (
              <div
                key={contact.id}
                className={`contact-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectContact(contact)}
              >
                <div className="contact-avatar" style={{ background: getColor(contact.id) }}>
                  {getInitial(contact)}
                </div>
                <div className="contact-info">
                  <div className="contact-row">
                    <span className="contact-name">{getDisplayName(contact)}</span>
                    <div className="contact-row-right">
                      {isPaused && contact.sensitive_flagged ? (
                        <span className="contact-mode-badge flagged" title="En attente humain — sujet sensible détecté">🚨</span>
                      ) : (
                        <span className={`contact-mode-badge ${isPaused ? 'human' : 'ai'}`} title={isPaused ? 'Prise en main humaine' : 'IA active'}>
                          {isPaused ? '👤' : '🤖'}
                        </span>
                      )}
                      {lastMsg && <span className="contact-time">{formatTime(lastMsg.created_at)}</span>}
                    </div>
                  </div>
                  {contactTags.length > 0 && (
                    <div className="contact-tags-row">
                      {contactTags.slice(0, 3).map(tag => (
                        <span
                          key={tag.id}
                          className="contact-tag-chip"
                          style={{ background: tag.color + '22', color: tag.color, borderColor: tag.color + '55' }}
                        >
                          {tag.name}
                        </span>
                      ))}
                      {contactTags.length > 3 && (
                        <span className="contact-tag-chip" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.1)' }}>
                          +{contactTags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="contact-row">
                    <span className="contact-preview">
                      {lastMsg
                        ? (lastMsg.direction === 'sent' ? '✓ ' : '') + lastMsg.content.substring(0, 45) + (lastMsg.content.length > 45 ? '…' : '')
                        : 'Aucun message'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
