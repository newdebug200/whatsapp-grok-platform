import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';
import BotConfig from './BotConfig';
import FAQManager from './FAQManager';
import Stats from './Stats';
import Settings from './Settings';
import AdminPanel from './AdminPanel';
import Broadcast from './Broadcast';
import './Dashboard.css';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch (_) {}
}

export default function Dashboard() {
  const { account, token, logout, profiles, activeProfile, selectProfile, loadProfiles } = useAuth();
  const [socket, setSocket] = useState(null);
  const [waStatus, setWaStatus] = useState({ isConnected: false, qrCode: null, status: 'not_initialized' });
  const [selectedContact, setSelectedContact] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [activePanel, setActivePanel] = useState('chat');
  const [mobileView, setMobileView] = useState('list');
  const [showMenu, setShowMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [editName, setEditName] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('botora-notif-sound') !== 'off');
  const [botError, setBotError] = useState(null);

  const activePanelRef = useRef(activePanel);
  const selectedContactRef = useRef(selectedContact);
  const soundEnabledRef = useRef(soundEnabled);
  const socketRef = useRef(null);
  const activeProfileRef = useRef(activeProfile);

  useEffect(() => { activePanelRef.current = activePanel; }, [activePanel]);
  useEffect(() => { selectedContactRef.current = selectedContact; }, [selectedContact]);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { activeProfileRef.current = activeProfile; }, [activeProfile]);

  useEffect(() => {
    const handler = (e) => setSoundEnabled(e.detail);
    window.addEventListener('botora-sound-change', handler);
    return () => window.removeEventListener('botora-sound-change', handler);
  }, []);

  const loadContactsForProfile = useCallback((profileId, sock) => {
    const s = sock || socketRef.current;
    if (s) {
      s.emit('get-initial-data', { profileId });
    }
  }, []);

  const handleNewMessage = useCallback((msg) => {
    if (msg.profileId && activeProfileRef.current?.id !== msg.profileId) return;

    const isOnThisConversation = (
      activePanelRef.current === 'chat' &&
      selectedContactRef.current &&
      msg?.from === selectedContactRef.current?.phone_number
    );
    if (!isOnThisConversation) setUnreadCount(c => c + 1);
    if (soundEnabledRef.current) playNotifSound();
    if (document.hidden && Notification.permission === 'granted') {
      new Notification('Botora — Nouveau message', {
        body: msg?.body || 'Nouveau message WhatsApp reçu',
        icon: '/icons/icon-96.png',
        silent: true
      });
    }
  }, []);

  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const s = io(SOCKET_URL, {
      auth: { token },
      reconnectionAttempts: 5,
      reconnectionDelay: 2000
    });

    socketRef.current = s;

    s.on('connect', () => {
      console.log('Socket connecté');
      s.emit('get-status');
      if (activeProfileRef.current?.id) {
        loadContactsForProfile(activeProfileRef.current.id, s);
      } else {
        s.emit('get-initial-data', {});
      }
    });

    s.on('connect_error', (err) => {
      console.error('Erreur socket:', err.message);
    });

    s.on('status', (status) => setWaStatus(status));
    s.on('qr', (qr) => setWaStatus(prev => ({ ...prev, qrCode: qr, status: 'qr', isConnected: false })));
    s.on('ready', () => setWaStatus({ isConnected: true, qrCode: null, status: 'connected' }));
    s.on('disconnected', () => setWaStatus({ isConnected: false, qrCode: null, status: 'disconnected' }));
    s.on('auth_failure', () => setWaStatus({ isConnected: false, qrCode: null, status: 'auth_failure' }));

    s.on('profile-ready', async (profile) => {
      selectProfile(profile);
      await loadProfiles();
      loadContactsForProfile(profile.id, s);
    });

    s.on('initial-contacts', (data) => {
      if (Array.isArray(data)) setContacts(data);
    });

    s.on('new-message', (msg) => {
      if (!msg.profileId || msg.profileId === activeProfileRef.current?.id) {
        loadContactsForProfile(activeProfileRef.current?.id, s);
      }
      handleNewMessage(msg);
    });

    s.on('bot-error', (data) => {
      setBotError(data);
      setTimeout(() => setBotError(null), 8000);
    });

    s.on('reconnect', () => {
      console.log('Socket reconnecté — resync statut WA');
      s.emit('get-status');
      if (activeProfileRef.current?.id) {
        loadContactsForProfile(activeProfileRef.current.id, s);
      }
    });

    setSocket(s);
    return () => { s.disconnect(); socketRef.current = null; };
  }, [token, handleNewMessage, loadContactsForProfile, selectProfile, loadProfiles]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedContactRef.current) handleBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSwitchProfile = (profile) => {
    selectProfile(profile);
    setShowProfileMenu(false);
    setSelectedContact(null);
    setContacts([]);
    loadContactsForProfile(profile.id);
  };

  const handleConnectWhatsApp = (forceNew = false) => {
    const profileId = !forceNew && activeProfileRef.current?.id ? activeProfileRef.current.id : null;
    socketRef.current?.emit('connect-whatsapp', profileId ? { profileId } : {});
  };

  const handleLogoutWhatsApp = async (profileId) => {
    const pid = profileId || activeProfile?.id;
    if (!pid) return;
    try {
      await axios.post(`${API_URL}/messages/logout`, { profileId: pid });
      setWaStatus({ isConnected: false, qrCode: null, status: 'disconnected' });
      await loadProfiles();
    } catch (err) {
      console.error('Erreur déconnexion WhatsApp:', err.message);
      setWaStatus({ isConnected: false, qrCode: null, status: 'disconnected' });
    }
  };

  const handleSelectContact = (contact) => { setSelectedContact(contact); setMobileView('chat'); };
  const handleBack = () => { setSelectedContact(null); setMobileView('list'); };
  const handleContactsUpdate = (updated) => setContacts(updated);

  const handleNavClick = (key) => {
    setActivePanel(key);
    if (key === 'chat') setUnreadCount(0);
  };

  const handleRenameProfile = async (profileId, name) => {
    try {
      await axios.put(`${API_URL}/profiles/${profileId}`, { display_name: name.trim() || null });
      await loadProfiles();
    } catch (err) {
      console.error('Erreur renommage:', err.message);
    }
    setEditingProfileId(null);
  };

  const navItems = [
    {
      key: 'chat', label: 'Discussions',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
    },
    {
      key: 'stats', label: 'Statistiques',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"/></svg>
    },
    {
      key: 'faq', label: 'FAQ',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
    },
    {
      key: 'broadcast', label: 'Campagnes',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.39.4.53.8 1.07 1.2 1.61.96-.72 2.21-1.66 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v4h2v-4h1l5 3V6L8 9H4zm11.5 3c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z"/></svg>
    },
    {
      key: 'config', label: 'Bot Config',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a2 2 0 012 2 2 2 0 01-2 2 2 2 0 01-2-2 2 2 0 012-2m0 5c.55 0 1 .45 1 1h1a3 3 0 013 3v1a1 1 0 011 1v3a1 1 0 01-1 1v1a3 3 0 01-3 3H9a3 3 0 01-3-3v-1a1 1 0 01-1-1v-3a1 1 0 011-1v-1a3 3 0 013-3h1c0-.55.45-1 1-1zm-3 4a1 1 0 00-1 1v5a1 1 0 001 1h6a1 1 0 001-1v-5a1 1 0 00-1-1H9zm1.5 2a1 1 0 110 2 1 1 0 010-2zm3 0a1 1 0 110 2 1 1 0 010-2zm-4 3h5l-.5 1h-4l-.5-1z"/></svg>
    },
    {
      key: 'settings', label: 'Paramètres',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 15.5A3.5 3.5 0 018.5 12 3.5 3.5 0 0112 8.5a3.5 3.5 0 013.5 3.5 3.5 3.5 0 01-3.5 3.5m7.43-2.92c.04-.3.07-.62.07-.95s-.03-.66-.07-1l2.16-1.65c.19-.15.24-.42.12-.64l-2.05-3.55c-.12-.22-.39-.3-.61-.22l-2.55 1.03c-.52-.4-1.08-.73-1.7-.98l-.38-2.71C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.71c-.62.25-1.18.58-1.7.98L4.88 5.08c-.22-.08-.49 0-.61.22L2.22 8.85c-.13.22-.07.49.12.64l2.16 1.65c-.04.34-.07.67-.07 1s.03.65.07.97l-2.16 1.66c-.19.15-.24.42-.12.64l2.05 3.55c.12.22.39.3.61.22l2.55-1.02c.52.4 1.08.73 1.7.98l.38 2.71c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.71c.62-.25 1.18-.58 1.7-.98l2.55 1.02c.22.08.49 0 .61-.22l2.05-3.55c.12-.22.07-.49-.12-.64l-2.16-1.66z"/></svg>
    },
    ...(account?.role === 'admin' ? [{
      key: 'admin', label: 'Administration',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4c1.4 0 2.8 1.1 2.8 2.5v.5h.7c.4 0 .5.1.5.5v4c0 .4-.1.5-.5.5H8.5c-.4 0-.5-.1-.5-.5v-4c0-.4.1-.5.5-.5h.7v-.5C9.2 6.1 10.6 5 12 5zm0 1.2c-.8 0-1.3.6-1.3 1.3v.5h2.6v-.5c0-.7-.5-1.3-1.3-1.3zm0 4.1c-.6 0-1 .4-1 1s.4 1 1 1 1-.4 1-1-.4-1-1-1z"/></svg>
    }] : []),
  ];

  const toggleSound = () => {
    const v = !soundEnabled;
    setSoundEnabled(v);
    localStorage.setItem('botora-notif-sound', v ? 'on' : 'off');
  };

  const profileLabel = activeProfile
    ? (activeProfile.display_name || activeProfile.phone_number || 'Profil')
    : 'Aucun profil';

  const noProfile = !activeProfile;

  return (
    <div className="dashboard">
      <div className={`sidebar ${mobileView === 'chat' ? 'sidebar-hidden-mobile' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-header-top">
            <div className="sidebar-logo">
              <span className="logo-icon">B</span>
              <span className="logo-text">Botora</span>
            </div>
            <div className="sidebar-actions">
              <button
                className={`sound-toggle-btn ${soundEnabled ? 'on' : 'off'}`}
                onClick={toggleSound}
                title={soundEnabled ? 'Désactiver le son' : 'Activer le son'}
              >
                {soundEnabled ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                )}
              </button>
              <div
                className={`wa-status-badge ${waStatus.isConnected ? 'connected' : 'disconnected'}`}
                title={waStatus.isConnected ? 'WhatsApp connecté' : 'WhatsApp non connecté'}
              >●</div>
              <div className="menu-wrapper">
                <button className="icon-btn" onClick={() => setShowMenu(!showMenu)}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                </button>
                {showMenu && (
                  <div className="dropdown-menu">
                    <div className="dropdown-user">
                      <div className="dropdown-avatar">{account?.name?.charAt(0).toUpperCase()}</div>
                      <div>
                        <div className="dropdown-name">{account?.name}</div>
                        <div className="dropdown-email">{account?.email}</div>
                      </div>
                    </div>
                    <div className="dropdown-divider" />
                    <button className="dropdown-item" onClick={() => { setActivePanel('config'); setShowMenu(false); }}>Configuration du bot</button>
                    <button className="dropdown-item" onClick={() => { setActivePanel('faq'); setShowMenu(false); }}>Gestion FAQ</button>
                    <button className="dropdown-item" onClick={() => { setActivePanel('stats'); setShowMenu(false); }}>Statistiques</button>
                    <button className="dropdown-item" onClick={() => { setActivePanel('broadcast'); setShowMenu(false); }}>Campagnes</button>
                    <button className="dropdown-item" onClick={() => { setActivePanel('settings'); setShowMenu(false); }}>Paramètres</button>
                    <div className="dropdown-divider" />
                    <button className="dropdown-item danger" onClick={logout}>Déconnexion du compte</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="profile-selector-wrapper">
            <button
              className="profile-selector-btn"
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              title="Changer de profil WhatsApp"
            >
              <span className="profile-selector-dot" style={{ background: waStatus.isConnected ? '#25d366' : '#aaa' }} />
              <span className="profile-selector-label">{profileLabel}</span>
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style={{ marginLeft: 'auto', opacity: 0.5 }}>
                <path d="M7 10l5 5 5-5z"/>
              </svg>
            </button>

            {showProfileMenu && (
              <div className="profile-dropdown">
                {profiles.length === 0 && (
                  <div className="profile-dropdown-empty">Aucun profil — connectez WhatsApp</div>
                )}
                {profiles.map(p => (
                  <div key={p.id} className="profile-dropdown-item-wrap">
                    {editingProfileId === p.id ? (
                      <form
                        className="profile-rename-form"
                        onSubmit={(e) => { e.preventDefault(); handleRenameProfile(p.id, editName); }}
                      >
                        <input
                          className="profile-rename-input"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder={p.phone_number}
                          autoFocus
                          maxLength={40}
                        />
                        <button type="submit" className="profile-rename-ok">✓</button>
                        <button type="button" className="profile-rename-cancel" onClick={() => setEditingProfileId(null)}>✕</button>
                      </form>
                    ) : (
                      <button
                        className={`profile-dropdown-item ${activeProfile?.id === p.id ? 'active' : ''}`}
                        onClick={() => handleSwitchProfile(p)}
                      >
                        <span className="profile-item-dot" style={{ background: p.is_connected ? '#25d366' : '#aaa' }} />
                        <span className="profile-item-label">{p.display_name || p.phone_number}</span>
                        <button
                          className="profile-rename-btn"
                          title="Renommer"
                          onClick={(e) => { e.stopPropagation(); setEditingProfileId(p.id); setEditName(p.display_name || ''); }}
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                        </button>
                      </button>
                    )}
                  </div>
                ))}
                <div className="profile-dropdown-divider" />
                <button
                  className="profile-dropdown-add"
                  onClick={() => {
                    setShowProfileMenu(false);
                    setActivePanel('config');
                    handleConnectWhatsApp();
                  }}
                >
                  <span className="profile-add-icon">+</span>
                  <span>Ajouter un numéro WhatsApp</span>
                </button>
              </div>
            )}
          </div>

          <div className="sidebar-nav">
            {navItems.map(item => (
              <button
                key={item.key}
                className={`nav-btn ${activePanel === item.key ? 'active' : ''}`}
                onClick={() => handleNavClick(item.key)}
                title={item.label}
              >
                <span className="nav-icon-wrap">
                  <span className="nav-icon">{item.icon}</span>
                  {item.key === 'chat' && unreadCount > 0 && (
                    <span className="nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                  )}
                </span>
                <span className="nav-label">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-content">
          {activePanel === 'chat' && (
            noProfile ? (
              <div className="no-profile-msg">
                <p>Connectez un numéro WhatsApp pour commencer.</p>
                <button className="btn-connect" onClick={() => { setActivePanel('config'); }}>
                  Configurer WhatsApp
                </button>
              </div>
            ) : (
              <ConversationList
                contacts={contacts}
                selectedContact={selectedContact}
                onSelectContact={handleSelectContact}
                onContactsUpdate={handleContactsUpdate}
                waStatus={waStatus}
                socket={socket}
                onConnectWhatsApp={handleConnectWhatsApp}
              />
            )
          )}
          {activePanel === 'stats' && (
            noProfile ? <NoProfilePlaceholder onGoConfig={() => setActivePanel('config')} /> : <Stats socket={socket} />
          )}
          {activePanel === 'faq' && (
            noProfile ? <NoProfilePlaceholder onGoConfig={() => setActivePanel('config')} /> : <FAQManager />
          )}
          {activePanel === 'broadcast' && (
            noProfile
              ? <NoProfilePlaceholder onGoConfig={() => setActivePanel('config')} />
              : <Broadcast socket={socket} activeProfile={activeProfile} />
          )}
          {activePanel === 'config' && (
            <BotConfig
              waStatus={waStatus}
              onConnectWhatsApp={handleConnectWhatsApp}
              onLogoutWhatsApp={handleLogoutWhatsApp}
              activeProfile={activeProfile}
            />
          )}
          {activePanel === 'settings' && <Settings />}
          {activePanel === 'admin' && account?.role === 'admin' && <AdminPanel />}
        </div>
      </div>

      <div className={`main-area ${mobileView === 'list' ? 'main-hidden-mobile' : ''}`}>
        <ChatWindow
          contact={selectedContact}
          socket={socket}
          waStatus={waStatus}
          onBack={handleBack}
        />
      </div>

      {(showMenu || showProfileMenu) && (
        <div className="overlay" onClick={() => { setShowMenu(false); setShowProfileMenu(false); }} />
      )}

      {botError && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
          background: '#c0392b', color: '#fff', borderRadius: 10,
          padding: '12px 18px', maxWidth: 340, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'flex-start', gap: 10
        }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>Erreur bot IA</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>{botError.error}</div>
            {botError.contactPhone && (
              <div style={{ fontSize: '0.78rem', opacity: 0.7, marginTop: 2 }}>Contact : {botError.contactPhone}</div>
            )}
          </div>
          <button
            onClick={() => setBotError(null)}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, marginLeft: 4, opacity: 0.8 }}
          >✕</button>
        </div>
      )}
    </div>
  );
}

function NoProfilePlaceholder({ onGoConfig }) {
  return (
    <div className="no-profile-msg">
      <p>Sélectionnez ou connectez un profil WhatsApp pour accéder à cette section.</p>
      <button className="btn-connect" onClick={onGoConfig}>Configurer WhatsApp</button>
    </div>
  );
}
