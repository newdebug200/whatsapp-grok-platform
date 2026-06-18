import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function ConversationList({ contacts, selectedContact, onSelectContact, onContactsUpdate, waStatus, socket, onConnectWhatsApp }) {
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState([]);
  const [activeTagId, setActiveTagId] = useState(null);
  const [showOlderConversations, setShowOlderConversations] = useState(false);
  const [hoveredContact, setHoveredContact] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const contextMenuRef = useRef(null);
  const [activeTab, setActiveTab] = useState('all');
  const activeTabRef = useRef('all');
  const [unreadBadge, setUnreadBadge] = useState(0);
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeout = useRef(null);

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const loadTags = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/tags`);
      setTags(res.data);
    } catch {}
  }, []);

  useEffect(() => { loadTags(); }, [loadTags]);

  const loadConversations = useCallback(async (tabOverride) => {
    const tab = tabOverride ?? activeTabRef.current;
    try {
      const params = tab !== 'all' ? { filter: tab } : {};
      const res = await axios.get(`${API_URL}/messages/conversations`, { params });
      const sorted = res.data.sort((a, b) => {
        const da = a.messages[0]?.created_at || a.created_at;
        const db = b.messages[0]?.created_at || b.created_at;
        return new Date(db) - new Date(da);
      });
      onContactsUpdate(sorted);
      if (tab === 'all') {
        setUnreadBadge(sorted.filter(c => c.unread_count > 0).length);
      }
    } catch (err) {
      console.error('Erreur chargement conversations:', err);
    }
  }, [onContactsUpdate]);

  useEffect(() => {
    loadConversations(activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (socket) {
      const refresh = () => loadConversations();
      socket.on('new-message', refresh);
      socket.on('sync-complete', refresh);
      return () => {
        socket.off('new-message', refresh);
        socket.off('sync-complete', refresh);
      };
    }
  }, [socket, loadConversations]);

  useEffect(() => {
    const handleClick = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu]);

  const handleArchive = async (contact, e) => {
    e?.stopPropagation();
    setContextMenu(null);
    try {
      await axios.post(`${API_URL}/messages/conversations/archive/${contact.id}`);
      onContactsUpdate(contacts.filter(c => c.id !== contact.id));
      if (selectedContact?.id === contact.id) onSelectContact(null);
      loadConversations();
    } catch (err) {
      console.error('Erreur archivage:', err);
    }
  };

  const handleUnarchive = async (contact, e) => {
    e?.stopPropagation();
    setContextMenu(null);
    try {
      await axios.post(`${API_URL}/messages/conversations/unarchive/${contact.id}`);
      loadConversations();
    } catch (err) {
      console.error('Erreur désarchivage:', err);
    }
  };

  const handleFavoriteToggle = async (contact, e) => {
    e?.stopPropagation();
    setContextMenu(null);
    try {
      await axios.post(`${API_URL}/messages/favorites/${contact.id}`);
      loadConversations();
      setUnreadBadge(prev => prev);
    } catch (err) {
      console.error('Erreur favori:', err);
    }
  };

  const handleContextMenu = (e, contact) => {
    e.preventDefault();
    setContextMenu({ contactId: contact.id, contact, x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!search.trim()) { setSearchResults(null); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await axios.get(`${API_URL}/messages/search`, { params: { q: search.trim() } });
        setSearchResults(res.data);
      } catch { setSearchResults(null); }
      finally { setSearchLoading(false); }
    }, 400);
    return () => clearTimeout(searchTimeout.current);
  }, [search]);

  const filtered = searchResults !== null
    ? contacts.filter(c => searchResults.some(m => m.contact_id === c.id || m.contactId === c.id))
    : contacts.filter(c => {
        const q = search.toLowerCase();
        const matchSearch = !q || c.phone_number?.toLowerCase().includes(q) || c.name?.toLowerCase().includes(q);
        const matchTag = !activeTagId || c.tags?.some(ct => ct.tag_id === activeTagId);
        return matchSearch && matchTag;
      });

  const getLastMessageTime = (contact) => {
    if (contact.messages[0]?.created_at) return new Date(contact.messages[0].created_at).getTime();
    return new Date(contact.created_at).getTime();
  };

  const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
  const recentFiltered = filtered.filter(c => getLastMessageTime(c) >= cutoff24h);
  const olderFiltered = filtered.filter(c => getLastMessageTime(c) < cutoff24h);

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

  const isArchivedTab = activeTab === 'archived';

  const renderContact = (contact) => {
    const lastMsg = contact.messages[0];
    const isSelected = selectedContact?.id === contact.id;
    const isPaused = contact.ia_paused;
    const isHovered = hoveredContact === contact.id;
    const contactTags = contact.tags?.map(ct => ct.tag).filter(Boolean) || [];
    return (
      <div
        key={contact.id}
        className={`contact-item ${isSelected ? 'selected' : ''}`}
        onClick={() => { setContextMenu(null); onSelectContact(contact); }}
        onMouseEnter={() => setHoveredContact(contact.id)}
        onMouseLeave={() => setHoveredContact(null)}
        onContextMenu={(e) => handleContextMenu(e, contact)}
        style={{ position: 'relative' }}
      >
        <div className="contact-avatar" style={{ background: getColor(contact.id) }}>
          {getInitial(contact)}
        </div>
        <div className="contact-info">
          <div className="contact-row">
            <span className="contact-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {contact.is_favorite && (
                <svg viewBox="0 0 24 24" fill="#f6c90e" width="11" height="11" style={{ flexShrink: 0 }}>
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                </svg>
              )}
              {getDisplayName(contact)}
            </span>
            <div className="contact-row-right">
              {isArchivedTab ? (
                <span className="contact-mode-badge" title="Archivé" style={{ opacity: 0.6, fontSize: '0.9em' }}>📁</span>
              ) : (
                isPaused && contact.sensitive_flagged ? (
                  <span className="contact-mode-badge flagged" title="En attente humain — sujet sensible détecté">🚨</span>
                ) : (
                  <span className={`contact-mode-badge ${isPaused ? 'human' : 'ai'}`} title={isPaused ? 'Prise en main humaine' : 'IA active'}>
                    {isPaused ? '👤' : '🤖'}
                  </span>
                )
              )}
              {lastMsg && <span className="contact-time">{formatTime(lastMsg.created_at)}</span>}
              {!isArchivedTab && contact.unread_count > 0 && (
                <span style={{
                  minWidth: 18, height: 18, borderRadius: 9, background: '#25d366',
                  color: '#fff', fontSize: '0.72rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 5px', marginLeft: 4, flexShrink: 0
                }}>
                  {contact.unread_count > 99 ? '99+' : contact.unread_count}
                </span>
              )}
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
            <span className="contact-preview" style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
              {lastMsg && lastMsg.direction === 'sent' && (
                <svg viewBox="0 0 16 11" fill="#8e9baa" width="14" height="10" style={{ flexShrink: 0 }}>
                  <path d="M11.071.653a.75.75 0 0 1 .206 1.04l-5.5 8a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.4 2.4 4.947-7.2a.75.75 0 0 1 1.04-.294z"/>
                  <path d="M14.571.653a.75.75 0 0 1 .206 1.04l-5.5 8a.75.75 0 0 1-1.04.206.75.75 0 0 1-.114-.32l.108-.157 5.3-7.71a.75.75 0 0 1 1.04-.06z"/>
                </svg>
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lastMsg
                  ? lastMsg.content.substring(0, 45) + (lastMsg.content.length > 45 ? '…' : '')
                  : 'Aucun message'}
              </span>
            </span>
          </div>
        </div>

        {isHovered && !isArchivedTab && (
          <button
            className="contact-archive-btn"
            onClick={(e) => handleArchive(contact, e)}
            title="Archiver cette discussion"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/>
            </svg>
          </button>
        )}
        {isHovered && isArchivedTab && (
          <button
            className="contact-archive-btn"
            onClick={(e) => handleUnarchive(contact, e)}
            title="Désarchiver cette discussion"
            style={{ color: '#25d366' }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 6.5l5.5 5.5H14v2h-4v-2H6.5L12 6.5zM5.12 5l.81-1h12l.94 1H5.12z"/>
            </svg>
          </button>
        )}
      </div>
    );
  };

  const TABS = [
    { id: 'all', label: 'Toutes' },
    { id: 'unread', label: 'Non lues', badge: unreadBadge },
    { id: 'favorites', label: 'Favoris' },
    { id: 'groups', label: 'Groupes' },
    { id: 'archived', label: 'Archivées' },
  ];

  const hasNoResults = filtered.length === 0;

  const emptyLabel = activeTab === 'unread' ? 'Aucun message non lu'
    : activeTab === 'favorites' ? 'Aucun favori — clic droit sur une discussion pour en ajouter'
    : activeTab === 'groups' ? 'Aucun groupe'
    : activeTab === 'archived' ? 'Aucune discussion archivée'
    : search || activeTagId ? 'Aucun résultat' : 'Aucune conversation';

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
            onChange={e => { setSearch(e.target.value); setShowOlderConversations(true); }}
            className="search-input"
          />
          {searchLoading && <span style={{ fontSize: '0.75rem', color: '#25d366', marginRight: 4 }}>…</span>}
          {search && <button className="search-clear" onClick={() => { setSearch(''); setShowOlderConversations(false); setSearchResults(null); }}>✕</button>}
        </div>
      </div>

      {/* Tab bar — style WhatsApp Web */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'var(--bg-primary, #111b21)',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        flexShrink: 0,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: '1 1 0',
              minWidth: 52,
              padding: '9px 4px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #25d366' : '2px solid transparent',
              color: activeTab === tab.id ? '#25d366' : 'var(--text-secondary, #8e9baa)',
              fontSize: '0.73rem',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
            {tab.badge > 0 && (
              <span style={{
                background: '#25d366', color: '#fff',
                borderRadius: 999, fontSize: '0.65rem', fontWeight: 700,
                padding: '0 4px', minWidth: 14, textAlign: 'center', lineHeight: '1.5',
              }}>
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        ))}
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
        {hasNoResults ? (
          <div className="empty-list">{emptyLabel}</div>
        ) : (
          <>
            {recentFiltered.length === 0 && !showOlderConversations && olderFiltered.length > 0 && (
              <div className="empty-list" style={{ paddingBottom: 8 }}>
                Aucune discussion dans les dernières 24h
              </div>
            )}

            {recentFiltered.map(contact => renderContact(contact))}

            {olderFiltered.length > 0 && (
              showOlderConversations ? (
                <>
                  <div className="older-conversations-separator">
                    <span>Discussions plus anciennes</span>
                  </div>
                  {olderFiltered.map(contact => renderContact(contact))}
                </>
              ) : (
                <button
                  className="load-older-btn"
                  onClick={() => setShowOlderConversations(true)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                  {olderFiltered.length} discussion{olderFiltered.length > 1 ? 's' : ''} plus ancienne{olderFiltered.length > 1 ? 's' : ''}
                </button>
              )
            )}
          </>
        )}
      </div>

      {/* Context menu (clic droit) */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="conv-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button onClick={(e) => handleFavoriteToggle(contextMenu.contact, e)}>
            <svg viewBox="0 0 24 24" fill={contextMenu.contact.is_favorite ? '#f6c90e' : 'currentColor'} width="14" height="14">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>
            {contextMenu.contact.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          </button>
          {!contextMenu.contact.archived ? (
            <button onClick={(e) => handleArchive(contextMenu.contact, e)}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/>
              </svg>
              Archiver la discussion
            </button>
          ) : (
            <button onClick={(e) => handleUnarchive(contextMenu.contact, e)}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 6.5l5.5 5.5H14v2h-4v-2H6.5L12 6.5zM5.12 5l.81-1h12l.94 1H5.12z"/>
              </svg>
              Désarchiver
            </button>
          )}
        </div>
      )}
    </div>
  );
}
