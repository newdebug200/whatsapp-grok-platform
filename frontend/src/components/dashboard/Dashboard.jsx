import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';
import Stats from './Stats';
import Broadcast from './Broadcast';
import TagManager from './TagManager';
import SettingsHub from './SettingsHub';
import DashboardHome from './DashboardHome';
import FunnelPage from './FunnelPage';
import './Dashboard.css';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const AVATAR_COLORS = ['#25d366', '#128c7e', '#075e54', '#34b7f1', '#667eea', '#f6c90e', '#fd79a8'];
const getColor = (id) => AVATAR_COLORS[(id || 0) % AVATAR_COLORS.length];
const getInitial = (contact) => (contact.name || contact.phone_number || '?').charAt(0).toUpperCase();

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
  const [activePanel, setActivePanel] = useState('home');
  const [settingsInitialTab, setSettingsInitialTab] = useState('config');
  const [mobileView, setMobileView] = useState('list');
  const [showMenu, setShowMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [editName, setEditName] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('botora-notif-sound') !== 'off');
  const [botError, setBotError] = useState(null);
  const [platformConfig, setPlatformConfig] = useState({});
  const [creditBalance, setCreditBalance] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [globalQuery, setGlobalQuery] = useState('');
  const [messageMatchIds, setMessageMatchIds] = useState(null);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const globalSearchTimeout = useRef(null);
  const searchWrapperRef = useRef(null);

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

  // Load platform config + credit balance
  useEffect(() => {
    if (!token) return;
    axios.get(`${API_URL}/platform-config`)
      .then(r => setPlatformConfig(r.data))
      .catch(() => {});
  }, [token]);

  // Refresh credit balance when account changes
  useEffect(() => {
    if (account?.credit_balance !== undefined) {
      setCreditBalance(account.credit_balance);
    }
  }, [account]);

  // Refresh credit balance periodically
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      axios.get(`${API_URL}/auth/me`)
        .then(r => setCreditBalance(r.data.credit_balance))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [token]);

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

  const handleSelectContact = (contact) => {
    setSelectedContact(contact);
    setMobileView('chat');
    if (contact.unread_count > 0) {
      axios.post(`${API_URL}/messages/conversations/read/${contact.id}`).catch(() => {});
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, unread_count: 0 } : c));
      setUnreadCount(prev => Math.max(0, prev - (contact.unread_count || 0)));
    }
  };
  const handleBack = () => { setSelectedContact(null); setMobileView('list'); };
  const handleContactsUpdate = (updated) => setContacts(updated);

  const handleNavClick = (key) => {
    setActivePanel(key);
    if (key === 'chat') setUnreadCount(0);
    if (key === 'bot') setSettingsInitialTab('config');
    if (key === 'settings') setSettingsInitialTab('account');
  };

  // Global search: matches contacts already loaded (by name/phone) plus, once
  // the query is long enough, message content matches from the server.
  useEffect(() => {
    if (globalSearchTimeout.current) clearTimeout(globalSearchTimeout.current);
    const q = globalQuery.trim();
    if (q.length < 2) { setMessageMatchIds(null); return; }
    const controller = new AbortController();
    globalSearchTimeout.current = setTimeout(async () => {
      setGlobalSearchLoading(true);
      try {
        const res = await axios.get(`${API_URL}/messages/search`, { params: { q }, signal: controller.signal });
        setMessageMatchIds(new Set((res.data || []).map(m => m.contact_id ?? m.contactId)));
      } catch (err) {
        if (!axios.isCancel(err) && err.code !== 'ERR_CANCELED') setMessageMatchIds(null);
      } finally {
        if (!controller.signal.aborted) setGlobalSearchLoading(false);
      }
    }, 350);
    return () => { clearTimeout(globalSearchTimeout.current); controller.abort(); };
  }, [globalQuery]);

  useEffect(() => {
    if (!showSearch) return;
    const onClickOutside = (e) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target)) {
        setShowSearch(false);
      }
    };
    const onEscape = (e) => { if (e.key === 'Escape') setShowSearch(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [showSearch]);

  const globalSearchResults = (() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q) return [];
    return contacts
      .filter(c => (
        c.name?.toLowerCase().includes(q) ||
        c.phone_number?.toLowerCase().includes(q) ||
        messageMatchIds?.has(c.id)
      ))
      .slice(0, 8);
  })();

  const handleGlobalResultClick = (contact) => {
    handleSelectContact(contact);
    setActivePanel('chat');
    setUnreadCount(c => Math.max(0, c - (contact.unread_count || 0)));
    setShowSearch(false);
    setGlobalQuery('');
  };

  const goHome = () => setActivePanel('home');

  const goToSettings = (tab = 'config') => {
    setSettingsInitialTab(tab);
    setActivePanel(tab === 'config' ? 'bot' : 'settings');
    setShowMenu(false);
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

  const isAdmin = account?.role === 'admin';
  const campaignsEnabled = isAdmin || platformConfig.campaigns_enabled !== 'false';
  const creditsEnabled = platformConfig.credits_enabled === 'true';
  const iaGlobalEnabled = isAdmin || platformConfig.ia_enabled_global !== 'false';

  const navItems = [
    {
      key: 'chat', label: 'Discussions',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
    },
    ...(campaignsEnabled ? [{
      key: 'broadcast', label: 'Campagnes',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.39.4.53.8 1.07 1.2 1.61.96-.72 2.21-1.66 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v4h2v-4h1l5 3V6L8 9H4zm11.5 3c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z"/></svg>
    }] : []),
    {
      key: 'stats', label: 'Statistiques',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"/></svg>
    },
    {
      key: 'bot', label: 'Bot & WhatsApp',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.33C18.33 14.33 19 13.66 19 12.83C19 12 18.33 11.33 17.5 11.33C16.67 11.33 16 12 16 12.83C16 13.66 16.67 14.33 17.5 14.33M13 2.05V4.06C16.39 4.54 19 7.45 19 11C19 12.44 18.53 13.77 17.75 14.86L16.29 13.4C16.74 12.76 17 12 17 11.17C17 8.61 14.87 6.5 12.28 6.5H12V8.5L9 5.5L12 2.5V4.5H12.28C15.97 4.5 19 7.47 19 11.17C19 12.95 18.26 14.57 17.07 15.74L18.5 17.17C20.04 15.65 21 13.54 21 11.17C21 6.5 17.5 2.63 13 2.05M10 12.5C10 12.5 10 12.5 10 12.5C8.9 12.5 8 13.4 8 14.5C8 15.6 8.9 16.5 10 16.5C11.1 16.5 12 15.6 12 14.5C12 13.4 11.1 12.5 10 12.5M6.5 14.33C6.5 13.5 7.17 12.83 8 12.83C8.83 12.83 9.5 13.5 9.5 14.33C9.5 15.16 8.83 15.83 8 15.83C7.17 15.83 6.5 15.16 6.5 14.33M12 20C9.24 20 6.86 18.34 5.68 15.96L4.08 17.08C5.61 20.09 8.59 22 12 22C15.41 22 18.39 20.09 19.92 17.08L18.32 15.96C17.14 18.34 14.76 20 12 20Z"/></svg>
    },
    {
      key: 'settings', label: 'Paramètres',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 15.5A3.5 3.5 0 018.5 12 3.5 3.5 0 0112 8.5a3.5 3.5 0 013.5 3.5 3.5 3.5 0 01-3.5 3.5m7.43-2.92c.04-.3.07-.62.07-.95s-.03-.66-.07-1l2.16-1.65c.19-.15.24-.42.12-.64l-2.05-3.55c-.12-.22-.39-.3-.61-.22l-2.55 1.03c-.52-.4-1.08-.73-1.7-.98l-.38-2.71C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.71c-.62.25-1.18.58-1.7.98L4.88 5.08c-.22-.08-.49 0-.61.22L2.22 8.85c-.13.22-.07.49.12.64l2.16 1.65c-.04.34-.07.67-.07 1s.03.65.07.97l-2.16 1.66c-.19.15-.24.42-.12.64l2.05 3.55c.12.22.39.3.61.22l2.55-1.02c.52.4 1.08.73 1.7.98l.38 2.71c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.71c.62-.25 1.18-.58 1.7-.98l2.55 1.02c.22.08.49 0 .61-.22l2.05-3.55c.12-.22.07-.49-.12-.64l-2.16-1.66z"/></svg>
    },
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

  if (activePanel === 'home') {
    return (
      <div className="dashboard dashboard-home-fullscreen">
        <DashboardHome
          account={account}
          waStatus={waStatus}
          creditBalance={creditBalance}
          isAdmin={isAdmin}
          campaignsEnabled={campaignsEnabled}
          unreadCount={unreadCount}
          onLogout={logout}
          onGoTo={(key) => {
            if (key.startsWith('settings-')) return goToSettings(key.replace('settings-', ''));
            if (key === 'admin') return goToSettings('admin');
            return handleNavClick(key);
          }}
          onSelectContact={(contact) => { handleSelectContact(contact); setActivePanel('chat'); }}
        />
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

  const appNavItems = [
    ...navItems,
    { key: 'funnel', label: 'Entonnoir', icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18l-7 8v6l-4 2v-8L3 4zm4.2 2l4.8 5.5L16.8 6H7.2z"/></svg> }
  ];
  const appSettingsItems = [
    ['config', 'Réglages du bot'], ['faq', 'FAQ'], ['templates', 'Réponses rapides'],
    ['tags', 'Tags'], ['journal', 'Alertes'], ['account', 'Mon compte'],
    ...(isAdmin ? [['admin', 'Administration']] : [])
  ];

  return (
    <div className="dashboard">
      {activePanel !== 'chat' && (
        <aside className="app-navigation" aria-label="Navigation principale">
          <button className="app-navigation-brand" onClick={goHome} title="Retour au tableau de bord">
            <img src="/icons/icon-192.png" alt="Botora" />
            <span>Botora</span>
          </button>
          <div className="app-navigation-profile">
            <span className={`app-navigation-status ${waStatus.isConnected ? 'connected' : ''}`} />
            <span>{profileLabel}</span>
          </div>
          <div className="app-navigation-links">
            {appNavItems.map(item => (
              <button key={item.key} className={`app-navigation-link ${activePanel === item.key ? 'active' : ''}`} onClick={() => item.key === 'funnel' ? setActivePanel('funnel') : handleNavClick(item.key)}>
                <span className="app-navigation-icon">{item.icon}</span><span>{item.label}</span>
                {item.key === 'chat' && unreadCount > 0 && <b>{unreadCount > 99 ? '99+' : unreadCount}</b>}
              </button>
            ))}
          </div>
          <div className="app-navigation-group">
            <div className="app-navigation-heading">Paramètres</div>
            {appSettingsItems.map(([tab, label]) => (
              <button key={tab} className="app-navigation-sub-link" onClick={() => goToSettings(tab)}>
                <span className="app-navigation-sub-dot" />{label}
              </button>
            ))}
          </div>
          <div className="app-navigation-footer">
            <button onClick={goHome}>← Tableau de bord</button>
            <button className="app-navigation-logout" onClick={logout}>Déconnexion</button>
          </div>
        </aside>
      )}
      <div className={`sidebar ${activePanel !== 'chat' ? 'sidebar-context-hidden' : ''} ${mobileView === 'chat' ? 'sidebar-hidden-mobile' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-header-top">
            <button className="sidebar-logo sidebar-logo-btn" onClick={goHome} title="Retour au tableau de bord">
              <img src="/icons/icon-192.png" alt="Botora" className="logo-icon" />
              <span className="logo-text">Botora</span>
            </button>
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
              <div className="menu-wrapper" ref={searchWrapperRef}>
                <button className="icon-btn" onClick={() => setShowSearch(s => !s)} title="Recherche">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                </button>
                {showSearch && (
                  <div className="dropdown-menu search-menu">
                    <div className="search-input-wrap">
                      <input
                        type="text"
                        autoFocus
                        className="search-input"
                        placeholder="Rechercher un contact, un message…"
                        value={globalQuery}
                        onChange={(e) => setGlobalQuery(e.target.value)}
                      />
                    </div>
                    {globalQuery.trim().length > 0 && (
                      <div className="search-results">
                        {globalSearchLoading && <div className="search-hint">Recherche…</div>}
                        {!globalSearchLoading && globalSearchResults.length === 0 && (
                          <div className="search-hint">Aucun résultat</div>
                        )}
                        {globalSearchResults.map(c => (
                          <button key={c.id} className="dropdown-item search-result-item" onClick={() => handleGlobalResultClick(c)}>
                            <span className="search-result-avatar" style={{ background: getColor(c.id) }}>{getInitial(c)}</span>
                            <span className="search-result-info">
                              <span className="search-result-name">{c.name || c.phone_number}</span>
                              <span className="search-result-phone">{c.phone_number}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
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
                        {creditBalance !== null && (
                          <div className={`dropdown-credits ${creditBalance <= 0 ? 'empty' : creditBalance < 10 ? 'low' : ''}`}>
                            💳 {creditBalance.toFixed(2)} crédits
                          </div>
                        )}
                      </div>
                    </div>
                    {!iaGlobalEnabled && !isAdmin && (
                      <div className="dropdown-flag-warn">⚠️ Bot IA désactivé par l'admin</div>
                    )}
                    {!isAdmin && creditBalance !== null && creditBalance <= 0 && (
                      <div className="dropdown-flag-warn">⚠️ Solde de crédits épuisé</div>
                    )}
                    <div className="dropdown-divider" />
                    <div className="dropdown-section-label">Navigation</div>
                    <button className="dropdown-item" onClick={() => { setShowMenu(false); goHome(); }}>Tableau de bord</button>
                    {navItems.map(item => (
                      <button
                        key={item.key}
                        className="dropdown-item"
                        onClick={() => { setShowMenu(false); handleNavClick(item.key); }}
                      >
                        {item.label}
                      </button>
                    ))}
                    <button className="dropdown-item" onClick={() => { setShowMenu(false); setActivePanel('funnel'); }}>Entonnoir</button>
                    <div className="dropdown-divider" />
                    <div className="dropdown-section-label">Compte</div>
                    <button className="dropdown-item" onClick={() => { goToSettings('account'); }}>Mon compte</button>
                    {account?.role === 'admin' && (
                      <button className="dropdown-item" onClick={() => goToSettings('admin')}>Administration</button>
                    )}
                    <div className="dropdown-divider" />
                    <button className="dropdown-item danger" onClick={logout}>Déconnexion</button>
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
                    goToSettings('config');
                    handleConnectWhatsApp(true);
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
          <div className="sidebar-settings-nav">
            <div className="sidebar-settings-title">Paramètres</div>
            {[
              ['config', 'Réglages du bot'], ['faq', 'FAQ'], ['templates', 'Réponses rapides'],
              ['tags', 'Tags'], ['journal', 'Alertes'], ['account', 'Mon compte'],
              ...(isAdmin ? [['admin', 'Administration']] : [])
            ].map(([tab, label]) => (
              <button key={tab} className="sidebar-settings-link" onClick={() => goToSettings(tab)}>
                <span className="sidebar-settings-dot" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {creditBalance !== null && (
            <div className={`sidebar-credits-bar ${creditBalance <= 0 ? 'empty' : creditBalance < 10 ? 'low' : ''}`}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z"/>
              </svg>
              <span>{creditBalance.toFixed(2)} crédits</span>
            </div>
          )}
        </div>

        <div className="sidebar-content">
          {activePanel === 'funnel' && (
            <FunnelPage
              onBack={goHome}
              onSelectContact={(contact) => { handleSelectContact(contact); setActivePanel('chat'); }}
            />
          )}
          {activePanel === 'chat' && (
            noProfile ? (
              <div className="no-profile-msg">
                <p>Connectez un numéro WhatsApp pour commencer.</p>
                <button className="btn-connect" onClick={() => goToSettings('config')}>
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
            noProfile ? <NoProfilePlaceholder onGoConfig={() => goToSettings('config')} /> : <Stats socket={socket} />
          )}
          {activePanel === 'broadcast' && campaignsEnabled && (
            noProfile
              ? <NoProfilePlaceholder onGoConfig={() => goToSettings('config')} />
              : <Broadcast socket={socket} activeProfile={activeProfile} />
          )}
          {(activePanel === 'bot' || activePanel === 'settings') && (
            <SettingsHub
              waStatus={waStatus}
              onConnectWhatsApp={handleConnectWhatsApp}
              onLogoutWhatsApp={handleLogoutWhatsApp}
              activeProfile={activeProfile}
              account={account}
              initialTab={settingsInitialTab}
            />
          )}
        </div>
      </div>

      <main className={`main-area feature-main-area ${mobileView === 'list' ? 'main-hidden-mobile' : ''}`}>
        {activePanel === 'chat' ? (
          <ChatWindow
            contact={selectedContact}
            socket={socket}
            waStatus={waStatus}
            onBack={handleBack}
          />
        ) : (
          <div className="feature-page-shell">
            {activePanel === 'funnel' && <FunnelPage onBack={goHome} onSelectContact={(contact) => { handleSelectContact(contact); setActivePanel('chat'); }} />}
            {activePanel === 'stats' && (noProfile ? <NoProfilePlaceholder onGoConfig={() => goToSettings('config')} /> : <Stats socket={socket} />)}
            {activePanel === 'broadcast' && campaignsEnabled && (noProfile ? <NoProfilePlaceholder onGoConfig={() => goToSettings('config')} /> : <Broadcast socket={socket} activeProfile={activeProfile} />)}
            {(activePanel === 'bot' || activePanel === 'settings') && <SettingsHub waStatus={waStatus} onConnectWhatsApp={handleConnectWhatsApp} onLogoutWhatsApp={handleLogoutWhatsApp} activeProfile={activeProfile} account={account} initialTab={settingsInitialTab} />}
          </div>
        )}
      </main>

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
