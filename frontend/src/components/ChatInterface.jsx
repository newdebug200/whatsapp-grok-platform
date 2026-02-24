import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import './ChatInterface.css';

function ChatInterface({ socket }) {
  const [conversations, setConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConversations();

    socket.on('new-message', (message) => {
      if (selectedUser && message.from === selectedUser.phone_number) {
        loadMessages(selectedUser.id);
      }
      loadConversations();
    });

    return () => {
      socket.off('new-message');
    };
  }, [selectedUser]);

  const loadConversations = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/messages/conversations`);
      setConversations(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Erreur chargement conversations:', error);
    }
  };

  const loadMessages = async (userId) => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/messages/conversation/${userId}`);
      setMessages(response.data);
      scrollToBottom();
    } catch (error) {
      console.error('Erreur chargement messages:', error);
    }
  };

  const selectUser = (user) => {
    setSelectedUser(user);
    loadMessages(user.id);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatMessageTime = (timestamp) => {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: fr });
  };

  return (
    <div className="chat-interface">
      <div className="conversations-list">
        <div className="search-bar">
          <input type="text" placeholder="Rechercher une discussion..." />
        </div>
        
        {loading ? (
          <div className="loading-spinner">Chargement...</div>
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
                      {formatMessageTime(user.messages[0].created_at)}
                    </span>
                  )}
                </div>
                {user.messages[0] && (
                  <div className="last-message">
                    {user.messages[0].content.substring(0, 50)}
                    {user.messages[0].content.length > 50 ? '...' : ''}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
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
              </div>
            </div>

            <div className="messages-container">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${message.direction === 'sent' ? 'sent' : 'received'}`}
                >
                  <div className="message-content">{message.content}</div>
                  <div className="message-time">
                    {formatMessageTime(message.created_at)}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </>
        ) : (
          <div className="no-chat-selected">
            <p>Sélectionnez une discussion pour voir les messages</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatInterface;