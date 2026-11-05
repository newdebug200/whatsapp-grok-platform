import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { getContactDisplayName, getContactInitial } from '../../utils/contactDisplay';
import { useLanguage } from '../../context/LanguageContext';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function ConversationList({ contacts, selectedContact, onSelectContact, onContactsUpdate, waStatus, socket, onConnectWhatsApp }) {
  const { language, t } = useLanguage();
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState([]);
  const [activeTagId, setActiveTagId] = useState(null);
  const [showOlderConversations, setShowOlderConversations] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const contextMenuRef = useRef(null);
  const actionMenuRef = useRef(null);
  const [actionMenuContactId, setActionMenuContactId] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const activeTabRef = useRef('all');
  const [unreadBadge, setUnreadBadge] = useState(0);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinningContactId, setPinningContactId] = useState(null);
  const searchTimeout = useRef(null);
  const searchRequestId = useRef(0);

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
      const sorted = [...res.data].sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        const getTimestamp = (contact) => {
          const value = contact.last_message_at || contact.messages?.[0]?.created_at || contact.created_at;
          const timestamp = new Date(value).getTime();
          return Number.isFinite(timestamp) ? timestamp : 0;
        };
        return getTimestamp(b) - getTimestamp(a);
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
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target)) {
        setActionMenuContactId(null);
      }
    };
    if (contextMenu || actionMenuContactId !== null) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu, actionMenuContactId]);

  const handleArchive = async (contact, e) => {
    e?.stopPropagation();
    setContextMenu(null);
    setActionMenuContactId(null);
    try {
      await axios.post(`${API_URL}/messages/conversations/archive/${contact.id}`);
      onContactsUpdate(contacts.filter(c => c.id !== contact.id));
      if (selectedContact?.id === contact.id) onSelectContact(null);
      loadConversations();
    } catch (err) {
      console.error('Erreur archivage:', err);
    }
  };

  const handlePinToggle = async (contact, e) => {
    e?.stopPropagation();
    setActionMenuContactId(null);
    setPinError('');
    setPinningContactId(contact.id);
    try {
      await axios.post(`${API_URL}/messages/conversations/pin/${contact.id}`);
      await loadConversations();
    } catch (err) {
      if (err.response?.status === 409) {
        setPinError(err.response.data?.error || 'Vous pouvez épingler trois discussions maximum.');
      } else {
        console.error('Erreur épinglage:', err);
        setPinError('Impossible de modifier l’épinglage de cette discussion.');
      }
    } finally {
      setPinningContactId(null);
    }
  };

  const handleUnarchive = async (contact, e) => {
    e?.stopPropagation();
    setContextMenu(null);
    setActionMenuContactId(null);
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
    setActionMenuContactId(null);
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
    setActionMenuContactId(null);
    setContextMenu({ contactId: contact.id, contact, x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    const requestId = ++searchRequestId.current;
    if (search.trim().length < 2) {
      setSearchResults([]);
      setSearchError('');
      setSearchLoading(false);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError('');
      try {
        const res = await axios.get(`${API_URL}/messages/search`, { params: { q: search.trim() } });
        if (requestId === searchRequestId.current) setSearchResults(res.data);
      } catch (err) {
        if (requestId === searchRequestId.current) {
          console.error('Erreur recherche messages:', err);
          setSearchResults([]);
          setSearchError('La recherche des messages est temporairement indisponible.');
        }
      }
      finally {
        if (requestId === searchRequestId.current) setSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(searchTimeout.current);
  }, [search]);

  const query = search.toLocaleLowerCase();
  const messageContactIds = new Set((searchResults || []).map(message => message.contact_id ?? message.contactId));
  const filtered = contacts.filter(contact => {
    const contactName = getContactDisplayName(contact) || '';
    const matchSearch = !query
      || contactName.toLocaleLowerCase().includes(query)
      || contact.phone_number?.toLocaleLowerCase().includes(query)
      || contact.wa_id?.toLocaleLowerCase().includes(query)
      || messageContactIds.has(contact.id);
    const matchTag = !activeTagId || contact.tags?.some(contactTag => contactTag.tag_id === activeTagId);
    return matchSearch && matchTag;
  });

  const getLastMessageTime = (contact) => {
    const value = contact.last_message_at || contact.messages?.[0]?.created_at || contact.created_at;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
  const recentFiltered = filtered.filter(c => c.is_pinned || getLastMessageTime(c) >= cutoff24h);
  const olderFiltered = filtered.filter(c => !c.is_pinned && getLastMessageTime(c) < cutoff24h);

  const formatTime = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / 86400000);
    if (days === 0) return format(date, 'HH:mm');
    if (days === 1) return t('Yesterday');
    if (days < 7) return format(date, 'EEEE', { locale: language === 'en' ? enUS : fr });
    return format(date, 'dd/MM/yy');
  };


  const avatarColors = ['#25d366', '#128c7e', '#075e54', '#34b7f1', '#667eea', '#f6c90e', '#fd79a8'];
  const getColor = (id) => avatarColors[id % avatarColors.length];

  const isArchivedTab = activeTab === 'archived';

  const renderContact = (contact) => {
    const lastMsg = contact.messages[0];
    const isSelected = selectedContact?.id === contact.id;
    const isPaused = contact.ia_paused;
    const contactTags = contact.tags?.map(ct => ct.tag).filter(Boolean) || [];
    return (
      <div
        key={contact.id}
        className={`contact-item ${isSelected ? 'selected' : ''} ${actionMenuContactId === contact.id ? 'action-menu-open' : ''}`}
        onClick={() => { setContextMenu(null); setActionMenuContactId(null); onSelectContact(contact); }}
        onContextMenu={(e) => handleContextMenu(e, contact)}
        style={{ position: 'relative' }}
      >
        <div className="contact-avatar" style={{ background: getColor(contact.id) }}>
          {getContactInitial(contact)}
        </div>
        <div className="contact-info">
          <div className="contact-row">
            <span className="contact-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {contact.is_favorite && (
                <svg viewBox="0 0 24 24" fill="#f6c90e" width="11" height="11" style={{ flexShrink: 0 }}>
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                </svg>
              )}
              <span title={getContactDisplayName(contact)}>{getContactDisplayName(contact)}</span>
            </span>
            <div className="contact-row-right">
              {isArchivedTab ? (
                <span className="contact-mode-badge" title="Archivé" style={{ opacity: 0.6, fontSize: '0.9em' }}>📁</span>
              ) : (
                isPaused && contact.sensitive_flagged ? (
                  <span className="contact-mode-badge flagged" title="En attente humain — sujet sensible détecté">🚨</span>
                ) : (
                  <span className={`contact-mode-badge ${isPaused ? 'human' : 'ai'}`} title={isPaused ? 'Prise en main humaine' : 'Agent IA actif'}>
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
                  ? (() => {
                      const t = lastMsg.type;
                      if (t === 'image') return '📷 Photo';
                      if (t === 'video') return '🎥 Vidéo';
                      if (t === 'ptt') return '🎤 Message vocal';
                      if (t === 'audio') return '🎵 Audio';
                      if (t === 'sticker') return '🪄 Sticker';
                      if (t === 'document') return '📄 Document';
                      const c = lastMsg.content || '';
                      return c.substring(0, 45) + (c.length > 45 ? '…' : '');
                    })()
                  : 'Aucun message'}
              </span>
            </span>
          </div>
        </div>

        <div
          className={`conversation-actions ${actionMenuContactId === contact.id ? 'open' : ''}`}
          ref={actionMenuContactId === contact.id ? actionMenuRef : null}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="conversation-actions-trigger"
            onClick={(e) => {
              e.stopPropagation();
              setActionMenuContactId(current => current === contact.id ? null : contact.id);
            }}
            aria-label="Actions de la discussion"
            aria-haspopup="menu"
            aria-expanded={actionMenuContactId === contact.id}
            title="Actions de la discussion"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
              <circle cx="12" cy="5" r="1.8"/>
              <circle cx="12" cy="12" r="1.8"/>
              <circle cx="12" cy="19" r="1.8"/>
            </svg>
          </button>
          {actionMenuContactId === contact.id && (
            <div className="conversation-actions-menu" role="menu">
              <button
                role="menuitem"
                onClick={(e) => handlePinToggle(contact, e)}
                disabled={pinningContactId === contact.id}
              >
                <svg viewBox="0 0 24 24" fill={contact.is_pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" width="16" height="16" aria-hidden="true">
                  <path d="m16 3 5 5-4 1-3 3 1 4-2 2-3-5-5 5-1-1 5-5-5-3 2-2 4 1 3-3z"/>
                </svg>
                {contact.is_pinned ? 'Désépingler' : 'Épingler'}
              </button>
              <button role="menuitem" onClick={(e) => handleFavoriteToggle(contact, e)}>
                <svg viewBox="0 0 24 24" fill={contact.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" width="16" height="16" aria-hidden="true">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                </svg>
                {contact.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              </button>
              {!isArchivedTab ? (
                <button role="menuitem" onClick={(e) => handleArchive(contact, e)}>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
                    <path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/>
                  </svg>
                  Archiver
                </button>
              ) : (
                <button role="menuitem" onClick={(e) => handleUnarchive(contact, e)}>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
                    <path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c-.48-.17-.93-.46-1.27zM12 6.5l5.5 5.5H14v2h-4v-2H6.5L12 6.5zM5.12 5l.81-1h12l.94 1H5.12z"/>
                  </svg>
                  Désarchiver
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    );
  };

  const TABS = [
    { id: 'all', label: t('All') },
    { id: 'unread', label: t('Unread'), badge: unreadBadge },
    { id: 'favorites', label: t('Favorites') },
    { id: 'groups', label: t('Groups') },
    { id: 'archived', label: t('Archived') },
  ];

  const hasNoResults = filtered.length === 0;

  const emptyLabel = activeTab === 'unread' ? t('No unread messages')
    : activeTab === 'favorites' ? t('No favorites — use the star on a conversation to add one')
    : activeTab === 'groups' ? t('No groups')
    : activeTab === 'archived' ? t('No archived conversations')
    : search || activeTagId ? t('No results found') : t('No conversations');

  return (
    <div className="conversation-list">
      {!waStatus.isConnected && (
        <div className="wa-connect-banner">
          <span>{t('WhatsApp not connected')}</span>
          <button onClick={onConnectWhatsApp}>{t('Connect')}</button>
        </div>
      )}

      <div className="search-container">
        <div className="search-input-wrapper">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder={t('Search a conversation...')}
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setSearchResults([]);
              setSearchError('');
              setPinError('');
              setShowOlderConversations(true);
            }}
            className="search-input"
          />
          {searchLoading && <span style={{ fontSize: '0.75rem', color: '#25d366', marginRight: 4 }}>…</span>}
          {search && <button className="search-clear" onClick={() => { setSearch(''); setShowOlderConversations(false); setSearchResults([]); setSearchError(''); setPinError(''); }}>✕</button>}
        </div>

        {pinError && <div className="conversation-action-error" role="alert">{pinError}</div>}
        {searchError && <div className="conversation-action-error" role="alert">{searchError}</div>}
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
            onClick={() => { setActiveTab(tab.id); setActionMenuContactId(null); }}
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
                    <span>{t('Older conversations')}</span>
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
