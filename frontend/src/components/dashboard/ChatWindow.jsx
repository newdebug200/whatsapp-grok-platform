import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function ChatWindow({ contact, socket, waStatus, onBack }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (contact) {
      loadMessages(contact.id);
    } else {
      setMessages([]);
    }
  }, [contact]);

  useEffect(() => {
    if (socket && contact) {
      const handler = (msg) => {
        if (msg.from === contact.phone_number) {
          loadMessages(contact.id);
        }
      };
      socket.on('new-message', handler);
      return () => socket.off('new-message', handler);
    }
  }, [socket, contact]);

  useEffect(() => {
    if (autoScroll) scrollToBottom();
  }, [messages]);

  const loadMessages = async (contactId) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/messages/conversation/${contactId}`);
      setMessages(res.data);
      setAutoScroll(true);
      setTimeout(scrollToBottom, 80);
    } catch (err) {
      console.error('Erreur chargement messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      setAutoScroll(scrollHeight - scrollTop - clientHeight < 60);
    }
  };

  const getInitial = (c) => (c.name || c.phone_number || '?').charAt(0).toUpperCase();

  const avatarColors = ['#25d366', '#128c7e', '#075e54', '#34b7f1', '#667eea', '#f6c90e', '#fd79a8'];
  const getColor = (id) => avatarColors[(id || 0) % avatarColors.length];

  const formatMsgTime = (ts) => format(new Date(ts), 'HH:mm');
  const formatDateSep = (ts) => {
    const date = new Date(ts);
    const now = new Date();
    const diff = Math.floor((now - date) / 86400000);
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return 'Hier';
    return format(date, 'd MMMM yyyy', { locale: fr });
  };

  const isSameDay = (a, b) =>
    format(new Date(a), 'yyyy-MM-dd') === format(new Date(b), 'yyyy-MM-dd');

  if (!contact) {
    return (
      <div className="chat-empty">
        <div className="chat-empty-content">
          <div className="chat-empty-icon">
            <svg viewBox="0 0 60 60" fill="none">
              <circle cx="30" cy="30" r="28" stroke="#25d366" strokeWidth="2"/>
              <path d="M30 14C21.16 14 14 21.16 14 30c0 3.16.86 6.12 2.36 8.64L14 46l7.64-2.3C23.9 44.88 26.88 45.5 30 45.5 38.84 45.5 46 38.34 46 29.5S38.84 14 30 14z" fill="#25d366" opacity=".2"/>
              <path d="M30 14C21.16 14 14 21.16 14 30c0 3.16.86 6.12 2.36 8.64L14 46l7.64-2.3C23.9 44.88 26.88 45.5 30 45.5 38.84 45.5 46 38.34 46 29.5S38.84 14 30 14z" stroke="#25d366" strokeWidth="1.5" fill="none"/>
            </svg>
          </div>
          <h3>Botora</h3>
          <p>Sélectionnez une discussion pour afficher les messages</p>
          {!waStatus.isConnected && (
            <p className="wa-hint">Connectez votre WhatsApp depuis le panneau gauche pour recevoir des messages</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <button className="back-btn" onClick={onBack} title="Retour">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <div className="chat-header-avatar" style={{ background: getColor(contact.id) }}>
          {getInitial(contact)}
        </div>
        <div className="chat-header-info">
          <div className="chat-header-name">{contact.name || contact.phone_number}</div>
          <div className="chat-header-phone">
            {contact.name ? contact.phone_number : ''}
          </div>
        </div>
        <button className="close-chat-btn" onClick={onBack} title="Fermer la discussion (Échap)">
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      <div className="chat-messages" ref={containerRef} onScroll={handleScroll}>
        {loading ? (
          <div className="chat-loading">Chargement...</div>
        ) : messages.length === 0 ? (
          <div className="chat-no-messages">Aucun message dans cette conversation</div>
        ) : (
          messages.map((msg, i) => {
            const showDate = i === 0 || !isSameDay(msg.created_at, messages[i - 1].created_at);
            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div className="date-separator">
                    <span>{formatDateSep(msg.created_at)}</span>
                  </div>
                )}
                <div className={`message-bubble ${msg.direction === 'sent' ? 'sent' : msg.direction === 'system' ? 'system' : 'received'}`}>
                  <span className="message-text">{msg.content}</span>
                  <span className="message-time">
                    {formatMsgTime(msg.created_at)}
                    {msg.direction === 'sent' && (
                      <svg className="read-tick" viewBox="0 0 16 11" fill="currentColor">
                        <path d="M11.071.653a.75.75 0 0 1 .206 1.04l-5.5 8a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.4 2.4 4.947-7.2a.75.75 0 0 1 1.04-.294z"/>
                        <path d="M14.571.653a.75.75 0 0 1 .206 1.04l-5.5 8a.75.75 0 0 1-1.04.206.75.75 0 0 1-.114-.32l.108-.157 5.3-7.71a.75.75 0 0 1 1.04-.06z"/>
                      </svg>
                    )}
                  </span>
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {!autoScroll && (
        <button className="scroll-bottom-btn" onClick={() => { scrollToBottom(); setAutoScroll(true); }}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
        </button>
      )}

      <div className="chat-footer">
        <div className="chat-footer-info">
          <svg viewBox="0 0 24 24" fill="#25d366" width="20" height="20"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          <span>Botora répond automatiquement</span>
        </div>
      </div>
    </div>
  );
}
