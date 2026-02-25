import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import QRCode from './components/QRCode';
import ChatInterface from './components/ChatInterface';
import FAQManager from './components/FAQManager';
import DressurConfig from './components/DressurConfig';
import BotConfig from './components/BotConfig';
import './App.css';

const socket = io(import.meta.env.VITE_SOCKET_URL);

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [sidebarExpanded, setSidebarExpanded] = useState(true); // true = version complète, false = version icônes

  useEffect(() => {
    socket.on('qr', (qr) => {
      setQrCode(qr);
      setIsConnected(false);
    });

    socket.on('ready', () => {
      setIsConnected(true);
      setQrCode(null);
    });

    socket.on('disconnected', () => {
      setIsConnected(false);
      setQrCode(null);
    });

    checkStatus();

    return () => {
      socket.off('qr');
      socket.off('ready');
      socket.off('disconnected');
    };
  }, []);

  const checkStatus = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/messages/status`);
      if (response.data.isConnected) {
        setIsConnected(true);
      } else if (response.data.qrCode) {
        setQrCode(response.data.qrCode);
      }
    } catch (error) {
      console.error('Erreur vérification statut:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/messages/logout`);
    } catch (error) {
      console.error('Erreur déconnexion:', error);
    }
  };

  const toggleSidebar = () => {
    setSidebarExpanded(!sidebarExpanded);
  };

  if (!isConnected) {
    return <QRCode qrCode={qrCode} />;
  }

  return (
    <div className="app">
      {/* Sidebar - peut être expanded ou mini */}
      <div className={`sidebar ${sidebarExpanded ? 'expanded' : 'mini'}`}>
        <div className="sidebar-header">
          <div className="header-left">
            <button className="hamburger-btn" onClick={toggleSidebar}>
              <span></span>
              <span></span>
              <span></span>
            </button>
            {sidebarExpanded && <h2 className="logo">WhatsApp Groq</h2>}
            {!sidebarExpanded && <div className="logo-mini">WG</div>}
          </div>
        </div>
        
        <nav className="nav-menu">
          <button 
            className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`} 
            onClick={() => setActiveTab('chat')}
            title={!sidebarExpanded ? "Discussions" : ""}
          >
            <span className="nav-icon">💬</span>
            {sidebarExpanded && <span className="nav-text">Discussions</span>}
          </button>
          
          <button 
            className={`nav-item ${activeTab === 'faq' ? 'active' : ''}`} 
            onClick={() => setActiveTab('faq')}
            title={!sidebarExpanded ? "Gestion FAQ" : ""}
          >
            <span className="nav-icon">❓</span>
            {sidebarExpanded && <span className="nav-text">Gestion FAQ</span>}
          </button>
          
          <button 
            className={`nav-item ${activeTab === 'bot' ? 'active' : ''}`} 
            onClick={() => setActiveTab('bot')}
            title={!sidebarExpanded ? "Configuration Bot" : ""}
          >
            <span className="nav-icon">🤖</span>
            {sidebarExpanded && <span className="nav-text">Configuration Bot</span>}
          </button>
          
          <button 
            className={`nav-item ${activeTab === 'config' ? 'active' : ''}`} 
            onClick={() => setActiveTab('config')}
            title={!sidebarExpanded ? "Configuration Dressur" : ""}
          >
            <span className="nav-icon">⚙️</span>
            {sidebarExpanded && <span className="nav-text">Configuration Dressur</span>}
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout} title={!sidebarExpanded ? "Déconnexion" : ""}>
            <span className="nav-icon">🚪</span>
            {sidebarExpanded && <span className="nav-text">Déconnexion WhatsApp</span>}
          </button>
        </div>
      </div>

      {/* Overlay pour mobile quand sidebar est ouverte (optionnel) */}
      {!sidebarExpanded && window.innerWidth <= 768 && (
        <div className="sidebar-overlay" onClick={toggleSidebar}></div>
      )}
      
      <div className={`main-content ${sidebarExpanded ? '' : 'expanded'}`}>
        {activeTab === 'chat' && <ChatInterface socket={socket} />}
        {activeTab === 'faq' && <FAQManager />}
        {activeTab === 'bot' && <BotConfig />}
        {activeTab === 'config' && <DressurConfig />}
      </div>
    </div>
  );
}

export default App;