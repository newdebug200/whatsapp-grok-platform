import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { formatDistanceToNow, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import './ChatInterface.css';

function ChatInterface({ socket }) {
  const [conversations, setConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);

  // Charger les conversations au démarrage
  useEffect(() => {
    loadConversations();

    // Écouter les nouveaux messages
    socket.on('new-message', (message) => {
      if (selectedUser && message.from === selectedUser.phone_number) {
        loadMessages(selectedUser.id);
      }
      // Recharger les conversations pour mettre à jour le dernier message
      loadConversations();
    });

    // Écouter la touche Échap pour fermer la discussion
    const handleEscKey = (event) => {
      if (event.key === 'Escape' && selectedUser) {
        closeCurrentChat();
      }
    };

    window.addEventListener('keydown', handleEscKey);

    return () => {
      socket.off('new-message');
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [selectedUser]);

  // Scroll automatique vers le bas quand les messages changent
  useEffect(() => {
    if (autoScroll && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, autoScroll]);

  // Détecter le scroll manuel vers le haut
  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      // Si on est pas tout en bas, désactiver l'auto-scroll
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // NOUVELLE FONCTION : Fermer la discussion actuelle
  const closeCurrentChat = () => {
    setSelectedUser(null);
    setMessages([]);
    setAutoScroll(true);
  };

  const loadConversations = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/messages/conversations`);
      // Trier les conversations par date du dernier message (plus récent en haut)
      const sortedConversations = response.data.sort((a, b) => {
        const dateA = a.messages[0]?.created_at || a.created_at;
        const dateB = b.messages[0]?.created_at || b.created_at;
        return new Date(dateB) - new Date(dateA);
      });
      setConversations(sortedConversations);
      setLoading(false);
    } catch (error) {
      console.error('Erreur chargement conversations:', error);
      setLoading(false);
    }
  };

  const loadMessages = async (userId) => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/messages/conversation/${userId}`);
      // Les messages sont déjà triés par date croissante (ancien en haut, récent en bas)
      setMessages(response.data);
      // Réactiver l'auto-scroll quand on change de conversation
      setAutoScroll(true);
      // Attendre que les messages soient rendus puis scroller
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error('Erreur chargement messages:', error);
    }
  };

  const selectUser = (user) => {
    setSelectedUser(user);
    loadMessages(user.id);
  };

  const formatMessageTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) {
      return format(date, 'HH:mm');
    } else if (diffInDays === 1) {
      return 'Hier';
    } else if (diffInDays < 7) {
      return format(date, 'EEEE', { locale: fr });
    } else {
      return format(date, 'dd/MM/yyyy');
    }
  };

  const formatConversationTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'À l\'instant';
    if (diffInMinutes < 60) return `Il y a ${diffInMinutes} min`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `Il y a ${diffInHours} h`;
    
    return format(date, 'dd/MM/yyyy');
  };

  return (
    <div className="chat-interface">
      <div className="conversations-list">
        <div className="search-bar">
          <input type="text" placeholder="Rechercher une discussion..." />
        </div>
        
        <div className="conversations-container">
          {loading ? (
            <div className="loading-spinner">Chargement des conversations...</div>
          ) : conversations.length === 0 ? (
            <div className="no-conversations">Aucune conversation</div>
          ) : (
            conversations.map((user) => (
              <div
                key={user.id}
                className={`conversation-item ${selectedUser?.id === user.id ? 'selected' : ''}`}
                onClick={() => selectUser(user)}
              >
                <div className="avatar">
                  {user.name?.charAt(0).toUpperCase() || '?'}
                </div>
                <div className="conversation-info">
                  <div className="conversation-header">
                    <span className="name">{user.name || user.phone_number}</span>
                    {user.messages[0] && (
                      <span className="time">
                        {formatConversationTime(user.messages[0].created_at)}
                      </span>
                    )}
                  </div>
                  {user.messages[0] ? (
                    <div className="last-message">
                      <span className="message-preview">
                        {user.messages[0].direction === 'sent' ? 'Vous: ' : ''}
                        {user.messages[0].content.substring(0, 40)}
                        {user.messages[0].content.length > 40 ? '...' : ''}
                      </span>
                    </div>
                  ) : (
                    <div className="last-message">
                      <span className="message-preview">Aucun message</span>
                    </div>
                  )}
                </div>
                {user.messages[0]?.direction === 'received' && 
                 !user.messages[0]?.read && (
                  <div className="unread-badge"></div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="messages-area">
        {selectedUser ? (
          <>
            <div className="messages-header">
              <div className="avatar-large">
                {selectedUser.name?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="user-info">
                <h3>{selectedUser.name || selectedUser.phone_number}</h3>
                <span className="user-status">En ligne</span>
              </div>
              {/* NOUVEAU BOUTON DE FERMETURE */}
              <button 
                className="close-chat-button"
                onClick={closeCurrentChat}
                title="Fermer la discussion (Échap)"
              >
                ✕
              </button>
            </div>

            <div 
              className="messages-container"
              ref={messagesContainerRef}
              onScroll={handleScroll}
            >
              {messages.length === 0 ? (
                <div className="no-messages">
                  <p>Aucun message dans cette conversation</p>
                </div>
              ) : (
                <>
                  {/* Afficher un séparateur de date si nécessaire */}
                  {messages.map((message, index) => {
                    const showDate = index === 0 || 
                      format(new Date(message.created_at), 'dd/MM/yyyy') !== 
                      format(new Date(messages[index - 1].created_at), 'dd/MM/yyyy');
                    
                    return (
                      <React.Fragment key={message.id}>
                        {showDate && (
                          <div className="date-separator">
                            <span>
                              {format(new Date(message.created_at), 'dd MMMM yyyy', { locale: fr })}
                            </span>
                          </div>
                        )}
                        <div
                          className={`message ${message.direction === 'sent' ? 'sent' : 'received'}`}
                        >
                          <div className="message-content">{message.content}</div>
                          <div className="message-time">
                            {format(new Date(message.created_at), 'HH:mm')}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {!autoScroll && messages.length > 0 && (
              <button 
                className="scroll-to-bottom"
                onClick={() => {
                  scrollToBottom();
                  setAutoScroll(true);
                }}
              >
                ↓ Nouveaux messages
              </button>
            )}
          </>
        ) : (
          <div className="no-chat-selected">
            <div className="no-chat-content">
              <div className="whatsapp-icon">💬</div>
              <h3>WhatsApp Groq</h3>
              <p>Sélectionnez une discussion pour voir les messages</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatInterface;