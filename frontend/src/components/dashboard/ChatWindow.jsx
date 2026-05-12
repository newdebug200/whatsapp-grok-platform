import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const EMOJI_CATEGORIES = {
  '😀': ['😀','😂','🥰','😍','😊','😎','🤔','😅','😭','🥺','😤','😴','🤗','😇','🥳','😏','🙄','😮','😈','🤭','🫠','😬','🤩','🥹','😱'],
  '👍': ['👍','👎','👌','🙏','👏','🤝','🤞','💪','✌️','🤙','👋','☝️','🤟','🫶','👐','🤲','🫡','🤜','🤛','✊'],
  '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💕','💞','💓','💗','💘','💝','❣️','💟','🫀','♥️','🩷'],
  '🎉': ['🎉','🎊','🎈','🎁','🎂','🏆','✨','💫','🌟','⭐','🔥','🎵','🎶','🥂','🍾','🎯','🎮','🎸','🎤','🎬'],
  '🍕': ['🍕','🍔','🍣','☕','🍺','🍰','🍓','🍎','🥑','🍟','🌮','🍜','🥗','🍩','🍫','🍭','🥤','🧃','🍷','🥩'],
  '🌸': ['🌸','🌺','🌻','🌹','🌷','🍀','🌿','🌱','🌴','🦋','🐶','🐱','🐻','🦊','🐼','🐨','🐸','🦁','🐯','🦄'],
};

const CATEGORY_LABELS = { '😀': 'Smileys', '👍': 'Gestes', '❤️': 'Cœurs', '🎉': 'Fête', '🍕': 'Nourriture', '🌸': 'Nature' };

export default function ChatWindow({ contact, socket, waStatus, onBack }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState('😀');
  const [iaPaused, setIaPaused] = useState(false);
  const [togglingIA, setTogglingIA] = useState(false);
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const emojiRef = useRef(null);

  useEffect(() => {
    if (contact) {
      loadMessages(contact.id);
      setIaPaused(contact.ia_paused || false);
    } else {
      setMessages([]);
    }
  }, [contact]);

  useEffect(() => {
    if (socket && contact) {
      const handler = (msg) => {
        if (msg.from === contact.phone_number) loadMessages(contact.id);
      };
      socket.on('new-message', handler);
      return () => socket.off('new-message', handler);
    }
  }, [socket, contact]);

  useEffect(() => {
    if (autoScroll) scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) {
        setShowEmoji(false);
      }
    };
    if (showEmoji) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmoji]);

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

  const handleSend = async () => {
    if (!inputText.trim() || !contact || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);
    setShowEmoji(false);
    try {
      await axios.post(`${API_URL}/messages/send`, { contactId: contact.id, content: text });
      setIaPaused(true);
      await loadMessages(contact.id);
    } catch (err) {
      setInputText(text);
      console.error('Erreur envoi:', err);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleToggleIA = async () => {
    if (!contact || togglingIA) return;
    setTogglingIA(true);
    try {
      const res = await axios.post(`${API_URL}/messages/toggle-ia/${contact.id}`);
      setIaPaused(res.data.ia_paused);
    } catch (err) {
      console.error('Erreur toggle IA:', err);
    } finally {
      setTogglingIA(false);
    }
  };

  const insertEmoji = (emoji) => {
    const input = inputRef.current;
    if (!input) { setInputText(t => t + emoji); return; }
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const newText = inputText.slice(0, start) + emoji + inputText.slice(end);
    setInputText(newText);
    setTimeout(() => { input.focus(); input.setSelectionRange(start + emoji.length, start + emoji.length); }, 0);
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
          <div className="chat-header-phone">{contact.name ? contact.phone_number : ''}</div>
        </div>

        <button
          className={`ia-mode-btn ${iaPaused ? 'human' : 'ai'}`}
          onClick={handleToggleIA}
          disabled={togglingIA}
          title={iaPaused ? "Mode Humain — cliquer pour réactiver l'IA" : "Mode IA actif — cliquer pour prendre la main"}
        >
          {iaPaused ? (
            <><span className="ia-mode-icon">👤</span><span className="ia-mode-label">Humain</span></>
          ) : (
            <><span className="ia-mode-icon">🤖</span><span className="ia-mode-label">IA active</span></>
          )}
        </button>

        <button className="close-chat-btn" onClick={onBack} title="Fermer (Échap)">
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
                  <div className="date-separator"><span>{formatDateSep(msg.created_at)}</span></div>
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

      {showEmoji && (
        <div className="emoji-picker" ref={emojiRef}>
          <div className="emoji-cats">
            {Object.keys(EMOJI_CATEGORIES).map(cat => (
              <button
                key={cat}
                className={`emoji-cat-btn ${emojiCategory === cat ? 'active' : ''}`}
                onClick={() => setEmojiCategory(cat)}
                title={CATEGORY_LABELS[cat]}
              >{cat}</button>
            ))}
          </div>
          <div className="emoji-grid">
            {EMOJI_CATEGORIES[emojiCategory].map(emoji => (
              <button key={emoji} className="emoji-item" onClick={() => insertEmoji(emoji)}>{emoji}</button>
            ))}
          </div>
        </div>
      )}

      <div className="chat-input-bar">
        <button
          className={`emoji-toggle-btn ${showEmoji ? 'active' : ''}`}
          onClick={() => setShowEmoji(v => !v)}
          title="Emojis"
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
            <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
          </svg>
        </button>
        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          placeholder={iaPaused ? 'Écrire un message...' : 'Écrire un message (prendra la main sur l\'IA)...'}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending || !waStatus.isConnected}
          maxLength={4096}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={!inputText.trim() || sending || !waStatus.isConnected}
          title="Envoyer (Entrée)"
          type="button"
        >
          {sending ? (
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeDasharray="56" strokeDashoffset="14" style={{animation:'spin .8s linear infinite'}}/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          )}
        </button>
      </div>

      {!waStatus.isConnected && (
        <div className="chat-wa-offline">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          WhatsApp non connecté — l'envoi est désactivé
        </div>
      )}
    </div>
  );
}
