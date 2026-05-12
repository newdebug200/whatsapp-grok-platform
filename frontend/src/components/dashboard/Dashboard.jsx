import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';
import BotConfig from './BotConfig';
import FAQManager from './FAQManager';
import Stats from './Stats';
import './Dashboard.css';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

export default function Dashboard() {
  const { account, token, logout } = useAuth();
  const [socket, setSocket] = useState(null);
  const [waStatus, setWaStatus] = useState({ isConnected: false, qrCode: null, status: 'not_initialized' });
  const [selectedContact, setSelectedContact] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [activePanel, setActivePanel] = useState('chat');
  const [mobileView, setMobileView] = useState('list');
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const s = io(SOCKET_URL, { auth: { token } });

    s.on('connect', () => {
      s.emit('get-status');
      s.emit('get-initial-data');
    });

    s.on('status', (status) => setWaStatus(status));
    s.on('qr', (qr) => setWaStatus({ isConnected: false, qrCode: qr, status: 'qr' }));
    s.on('ready', () => setWaStatus({ isConnected: true, qrCode: null, status: 'connected' }));
    s.on('disconnected', () => setWaStatus({ isConnected: false, qrCode: null, status: 'disconnected' }));
    s.on('initial-contacts', (data) => setContacts(data));
    s.on('new-message', () => s.emit('get-initial-data'));

    setSocket(s);
    return () => s.disconnect();
  }, [token]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedContact) handleBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedContact]);

  const handleSelectContact = (contact) => {
    setSelectedContact(contact);
    setMobileView('chat');
  };

  const handleBack = () => {
    setSelectedContact(null);
    setMobileView('list');
  };

  const handleContactsUpdate = (updated) => setContacts(updated);

  const navItems = [
    {
      key: 'chat',
      label: 'Discussions',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
    },
    {
      key: 'stats',
      label: 'Statistiques',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"/></svg>
    },
    {
      key: 'faq',
      label: 'FAQ',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
    },
    {
      key: 'config',
      label: 'Bot Config',
      icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>
    },
  ];

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
                    <button className="dropdown-item" onClick={() => { setActivePanel('config'); setShowMenu(false); }}>
                      Configuration du bot
                    </button>
                    <button className="dropdown-item" onClick={() => { setActivePanel('faq'); setShowMenu(false); }}>
                      Gestion FAQ
                    </button>
                    <button className="dropdown-item" onClick={() => { setActivePanel('stats'); setShowMenu(false); }}>
                      Statistiques
                    </button>
                    <div className="dropdown-divider" />
                    <button className="dropdown-item danger" onClick={logout}>
                      Déconnexion
                    </button>
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
                onClick={() => setActivePanel(item.key)}
                title={item.label}
              >
                <span className="nav-icon">{item.icon}</span>
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
              onConnectWhatsApp={() => socket?.emit('connect-whatsapp')}
            />
          )}
          {activePanel === 'stats' && <Stats socket={socket} />}
          {activePanel === 'faq' && <FAQManager />}
          {activePanel === 'config' && (
            <BotConfig
              waStatus={waStatus}
              onConnectWhatsApp={() => socket?.emit('connect-whatsapp')}
              onLogoutWhatsApp={() => {}}
            />
          )}
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
