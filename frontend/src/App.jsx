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

    // Vérifier le statut initial
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

  if (!isConnected) {
    return <QRCode qrCode={qrCode} />;
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="logo">
          <h2>WhatsApp Grok</h2>
        </div>
        <nav className="nav-menu">
          <button
            className={activeTab === 'chat' ? 'active' : ''}
            onClick={() => setActiveTab('chat')}
          >
            Discussions
          </button>
          <button
            className={activeTab === 'faq' ? 'active' : ''}
            onClick={() => setActiveTab('faq')}
          >
            Gestion FAQ
          </button>
          <button
            className={activeTab === 'config' ? 'active' : ''}
            onClick={() => setActiveTab('config')}
          >
            Configuration Dressur
          </button>
          <button
            className={activeTab === 'bot' ? 'active' : ''}
            onClick={() => setActiveTab('bot')}
          >
            Configuration Bot
          </button>
        </nav>
        <button className="logout-btn" onClick={handleLogout}>
          Déconnexion WhatsApp
        </button>
      </div>

      <div className="main-content">
        {activeTab === 'chat' && <ChatInterface socket={socket} />}
        {activeTab === 'faq' && <FAQManager />}
        {activeTab === 'bot' && <BotConfig />}
        {activeTab === 'config' && <DressurConfig />}
      </div>
    </div>
  );
}

export default App;