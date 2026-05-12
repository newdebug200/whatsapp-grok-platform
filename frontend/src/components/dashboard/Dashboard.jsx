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
  const { account, token, logout } = useAuth();
  const [socket, setSocket] = useState(null);
  const [waStatus, setWaStatus] = useState({ isConnected: false, qrCode: null, status: 'not_initialized' });
  const [selectedContact, setSelectedContact] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [activePanel, setActivePanel] = useState('chat');
  const [mobileView, setMobileView] = useState('list');
  const [showMenu, setShowMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('botora-notif-sound') !== 'off');

  const activePanelRef = useRef(activePanel);
  const selectedContactRef = useRef(selectedContact);
  const soundEnabledRef = useRef(soundEnabled);
  const socketRef = useRef(null);

  useEffect(() => { activePanelRef.current = activePanel; }, [activePanel]);
  useEffect(() => { selectedContactRef.current = selectedContact; }, [selectedContact]);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  useEffect(() => {
    const handler = (e) => setSoundEnabled(e.detail);
    window.addEventListener('botora-sound-change', handler);
    return () => window.removeEventListener('botora-sound-change', handler);
  }, []);

  const handleNewMessage = useCallback((msg) => {
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
      s.emit('get-initial-data');
    });

    s.on('connect_error', (err) => {
      console.error('Erreur socket:', err.message);
    });

    s.on('status', (status) => setWaStatus(status));
    s.on('qr', (qr) => setWaStatus(prev => ({ ...prev, qrCode: qr, status: 'qr', isConnected: false })));
    s.on('ready', () => setWaStatus({ isConnected: true, qrCode: null, status: 'connected' }));
    s.on('disconnected', () => setWaStatus({ isConnected: false, qrCode: null, status: 'disconnected' }));
    s.on('auth_failure', () => setWaStatus({ isConnected: false, qrCode: null, status: 'auth_failure' }));

    s.on('initial-contacts', (data) => {
      if (Array.isArray(data)) setContacts(data);
    });

    s.on('new-message', (msg) => {
      s.emit('get-initial-data');
      handleNewMessage(msg);
    });

    setSocket(s);
    return () => { s.disconnect(); socketRef.current = null; };
  }, [token, handleNewMessage]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedContactRef.current) handleBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleConnectWhatsApp = () => {
    socketRef.current?.emit('connect-whatsapp');
  };

  const handleLogoutWhatsApp = async () => {
    try {
      await axios.post(`${API_URL}/messages/logout`);
      setWaStatus({ isConnected: false, qrCode: null, status: 'disconnected' });
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
      key: 'config', label: 'Bot Config',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>
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
                    <button className="dropdown-item" onClick={() => { setActivePanel('settings'); setShowMenu(false); }}>Paramètres</button>
                    <div className="dropdown-divider" />
                    <button className="dropdown-item danger" onClick={logout}>Déconnexion du compte</button>
                  </div>
                )}
              </div>
            </div>
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
            <ConversationList
              contacts={contacts}
              selectedContact={selectedContact}
              onSelectContact={handleSelectContact}
              onContactsUpdate={handleContactsUpdate}
              waStatus={waStatus}
              socket={socket}
              onConnectWhatsApp={handleConnectWhatsApp}
            />
          )}
          {activePanel === 'stats' && <Stats socket={socket} />}
          {activePanel === 'faq' && <FAQManager />}
          {activePanel === 'config' && (
            <BotConfig
              waStatus={waStatus}
              onConnectWhatsApp={handleConnectWhatsApp}
              onLogoutWhatsApp={handleLogoutWhatsApp}
            />
          )}
          {activePanel === 'settings' && <Settings />}
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

      {showMenu && <div className="overlay" onClick={() => setShowMenu(false)} />}
    </div>
  );
}
