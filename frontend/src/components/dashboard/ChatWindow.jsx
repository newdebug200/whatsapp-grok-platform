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
  const [sendError, setSendError] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [quickReplies, setQuickReplies] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [deletingMsg, setDeletingMsg] = useState(null);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [mediaModal, setMediaModal] = useState(null);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [recording, setRecording] = useState(false);

  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const emojiRef = useRef(null);
  const templatesRef = useRef(null);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    if (contact) {
      loadMessages(contact.id);
      setIaPaused(contact.ia_paused || false);
      loadNotes(contact.id);
      setShowNotes(false);
    } else {
      setMessages([]);
      setNotes('');
      setNotesDraft('');
    }
  }, [contact]);

  const loadNotes = async (contactId) => {
    try {
      const res = await axios.get(`${API_URL}/messages/notes/${contactId}`);
      setNotes(res.data.notes || '');
      setNotesDraft(res.data.notes || '');
    } catch {}
  };

  const handleSaveNotes = async () => {
    if (!contact) return;
    setSavingNotes(true);
    try {
      await axios.put(`${API_URL}/messages/notes/${contact.id}`, { notes: notesDraft });
      setNotes(notesDraft);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch {}
    finally { setSavingNotes(false); }
  };

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
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmoji(false);
    };
    if (showEmoji) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmoji]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (templatesRef.current && !templatesRef.current.contains(e.target)) setShowTemplates(false);
    };
    if (showTemplates) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTemplates]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(null);
    };
    if (openMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenu]);

  const loadMessages = async (contactId) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/messages/conversation/${contactId}`);
      const data = res.data;
      const msgs = Array.isArray(data) ? data : (data.messages || []);
      setMessages(msgs);
      setAutoScroll(true);
      setTimeout(scrollToBottom, 80);
    } catch (err) {
      console.error('Erreur chargement messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadQuickReplies = async () => {
    if (quickReplies.length > 0) return;
    setLoadingTemplates(true);
    try {
      const res = await axios.get(`${API_URL}/quick-replies`);
      setQuickReplies(res.data);
    } catch (err) {
      console.error('Erreur chargement templates:', err);
    } finally {
      setLoadingTemplates(false);
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
    setSendError('');
    setSending(true);
    setShowEmoji(false);
    setShowTemplates(false);
    try {
      await axios.post(`${API_URL}/messages/send`, { contactId: contact.id, content: text });
      setIaPaused(true);
      await loadMessages(contact.id);
    } catch (err) {
      setInputText(text);
      setSendError("Échec de l'envoi. Vérifiez que WhatsApp est connecté.");
      console.error('Erreur envoi:', err);
      setTimeout(() => setSendError(''), 5000);
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
      const res = await axios.post(`${API_URL}/messages/pause/${contact.id}`);
      setIaPaused(res.data.ia_paused);
    } catch (err) {
      console.error('Erreur toggle IA:', err);
    } finally {
      setTogglingIA(false);
    }
  };

  const handleDeleteMessage = async (msgId) => {
    setOpenMenu(null);
    setDeletingMsg(msgId);
    try {
      await axios.delete(`${API_URL}/messages/${msgId}`);
      setMessages(prev => prev.filter(m => m.id !== msgId));
    } catch (err) {
      console.error('Erreur suppression:', err);
    } finally {
      setDeletingMsg(null);
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

  const insertTemplate = (content) => {
    setInputText(content);
    setShowTemplates(false);
    setTimeout(() => {
      inputRef.current?.focus();
      const len = content.length;
      inputRef.current?.setSelectionRange(len, len);
    }, 0);
  };

  const handleToggleTemplates = () => {
    if (!showTemplates) {
      loadQuickReplies();
      setShowEmoji(false);
    }
    setShowTemplates(v => !v);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !contact) return;
    e.target.value = '';
    setSendingMedia(true);
    setSendError('');
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target.result.split(',')[1];
        await axios.post(`${API_URL}/messages/send-media`, {
          contactId: contact.id,
          filename: file.name,
          mimeType: file.type,
          data: base64
        });
        setIaPaused(true);
        await loadMessages(contact.id);
      };
      reader.onerror = () => {
        setSendError("Erreur lors de la lecture du fichier.");
        setTimeout(() => setSendError(''), 4000);
        setSendingMedia(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setSendError("Échec de l'envoi du fichier.");
      setTimeout(() => setSendError(''), 4000);
    } finally {
      setSendingMedia(false);
    }
  };

  const handleToggleRecord = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/ogg' });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType });
        if (blob.size < 500) return;
        setSendingMedia(true);
        try {
          const reader = new FileReader();
          reader.onload = async (ev) => {
            const base64 = ev.target.result.split(',')[1];
            const ext = mr.mimeType.includes('ogg') ? 'ogg' : 'webm';
            await axios.post(`${API_URL}/messages/send-media`, {
              contactId: contact.id,
              filename: `audio_${Date.now()}.${ext}`,
              mimeType: mr.mimeType,
              data: base64,
              messageType: 'ptt'
            });
            setIaPaused(true);
            await loadMessages(contact.id);
          };
          reader.readAsDataURL(blob);
        } catch {
          setSendError("Échec de l'envoi audio.");
          setTimeout(() => setSendError(''), 4000);
        } finally {
          setSendingMedia(false);
        }
      };
      mr.start();
      setRecording(true);
    } catch (err) {
      setSendError("Microphone inaccessible. Vérifiez les permissions.");
      setTimeout(() => setSendError(''), 4000);
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

  const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+\.[^\s]+)/gi;

  const renderMedia = (msg) => {
    const src = `${API_URL}/messages/media/${msg.media_path}`;
    const type = msg.type;

    if (type === 'sticker') {
      return (
        <div className="media-sticker-wrap">
          <img
            src={src}
            alt="Sticker"
            className="media-sticker"
            onClick={() => setMediaModal({ src, type: 'sticker' })}
            onError={e => { e.target.style.display = 'none'; }}
            style={{ cursor: 'zoom-in' }}
          />
        </div>
      );
    }

    if (type === 'image') {
      return (
        <div className="media-image-wrap" onClick={() => setMediaModal({ src, type: 'image' })}>
          <img
            src={src}
            alt="Image"
            className="media-image"
            onError={e => { e.target.style.display = 'none'; }}
          />
          <div className="media-image-overlay">
            <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
          </div>
        </div>
      );
    }

    if (type === 'ptt' || type === 'audio') {
      const isPtt = type === 'ptt';
      const bars = [3, 5, 8, 4, 7, 9, 5, 3, 6, 8, 4, 7, 9, 5, 3];
      return (
        <div className="media-audio-card">
          <div className="media-audio-icon">
            {isPtt ? (
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
            )}
          </div>
          <div className="media-audio-body">
            <div className="media-audio-label">{isPtt ? 'Message vocal' : 'Audio'}</div>
            <div className="media-audio-waves">
              {bars.map((h, i) => (
                <span key={i} className="media-audio-bar" style={{ height: h * 2.4 + 'px' }} />
              ))}
            </div>
            <audio controls className="media-audio-native">
              <source src={src} />
            </audio>
          </div>
        </div>
      );
    }

    if (type === 'video') {
      return (
        <div className="media-video-wrap">
          <video controls className="media-video" preload="metadata">
            <source src={src} />
          </video>
        </div>
      );
    }

    if (type === 'document') {
      const ext = (msg.media_path || '').split('.').pop().toLowerCase();
      const extLabel = ext ? ext.toUpperCase().slice(0, 4) : 'DOC';
      const extColors = {
        pdf: '#e53e3e', doc: '#2b6cb0', docx: '#2b6cb0',
        xls: '#276749', xlsx: '#276749', ppt: '#c05621', pptx: '#c05621',
        zip: '#744210', rar: '#744210', txt: '#555', csv: '#276749'
      };
      const color = extColors[ext] || '#553c9a';
      return (
        <a href={src} download target="_blank" rel="noopener noreferrer" className="media-document-card">
          <div className="media-document-icon" style={{ background: color }}>
            <span className="media-document-ext">{extLabel}</span>
          </div>
          <div className="media-document-info">
            <div className="media-document-name">Document {extLabel}</div>
            <div className="media-document-dl">
              <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11" style={{ marginRight: 3 }}>
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z"/>
              </svg>
              Télécharger
            </div>
          </div>
        </a>
      );
    }

    return (
      <a href={src} download target="_blank" rel="noopener noreferrer" className="media-badge-fallback file">
        <span>📎</span>
        <span>Télécharger le fichier</span>
      </a>
    );
  };

  const renderText = (text) => {
    const parts = text.split(URL_REGEX);
    return parts.map((part, idx) => {
      if (URL_REGEX.test(part)) {
        URL_REGEX.lastIndex = 0;
        const href = part.startsWith('http') ? part : 'https://' + part;
        return (
          <a
            key={idx}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#53bdeb', textDecoration: 'underline', wordBreak: 'break-all' }}
            onClick={e => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

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

      {mediaModal && (
        <div
          onClick={() => setMediaModal(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out'
          }}
        >
          <button
            onClick={() => setMediaModal(null)}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'rgba(255,255,255,0.15)', border: 'none',
              borderRadius: '50%', width: 40, height: 40,
              cursor: 'pointer', color: '#fff', fontSize: '1.2rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
            title="Fermer"
          >✕</button>
          <img
            src={mediaModal.src}
            alt="Aperçu"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '92vw', maxHeight: '88vh',
              borderRadius: 8, objectFit: 'contain',
              boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
              cursor: 'default'
            }}
          />
          <a
            href={mediaModal.src}
            download
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '8px 20px',
              borderRadius: 20, fontSize: '0.82rem', textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(4px)'
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z"/>
            </svg>
            Télécharger
          </a>
        </div>
      )}

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

        <button
          className={`ia-mode-btn ${showNotes ? 'human' : ''}`}
          onClick={() => setShowNotes(v => !v)}
          title="Notes internes (jamais envoyées au client)"
          style={{ fontSize: '0.8rem', gap: 4 }}
        >
          <span style={{ fontSize: '1rem' }}>📝</span>
          <span className="ia-mode-label" style={{ fontSize: '0.78rem' }}>
            Notes{notes ? ' ●' : ''}
          </span>
        </button>

        <button className="close-chat-btn" onClick={onBack} title="Fermer (Échap)">
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      {showNotes && (
        <div style={{
          background: '#1a2a1e', borderBottom: '1px solid #2d4a35',
          padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f6c90e', display: 'flex', alignItems: 'center', gap: 6 }}>
            📝 Notes internes — <span style={{ fontWeight: 400, color: '#8e9baa' }}>jamais envoyées au client</span>
          </div>
          <textarea
            value={notesDraft}
            onChange={e => setNotesDraft(e.target.value)}
            placeholder="Ex : VIP, Rappeler le 15 juin, Cliente difficile…"
            rows={3}
            style={{
              width: '100%', background: '#111b21', border: '1px solid #2d4a35',
              borderRadius: 8, color: '#e8eaed', fontSize: '0.85rem',
              padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box'
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={handleSaveNotes}
              disabled={savingNotes || notesDraft === notes}
              style={{
                padding: '5px 16px', borderRadius: 8, border: 'none',
                background: notesDraft !== notes ? '#25d366' : '#2d4a35',
                color: '#fff', fontWeight: 600, fontSize: '0.82rem',
                cursor: notesDraft !== notes ? 'pointer' : 'default', opacity: savingNotes ? 0.6 : 1
              }}
            >
              {savingNotes ? 'Sauvegarde…' : notesSaved ? '✓ Sauvegardé' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      )}

      <div className="chat-messages" ref={containerRef} onScroll={handleScroll}>
        {loading ? (
          <div className="chat-loading">Chargement...</div>
        ) : messages.length === 0 ? (
          <div className="chat-no-messages">Aucun message dans cette conversation</div>
        ) : (
          messages.map((msg, i) => {
            const showDate = i === 0 || !isSameDay(msg.created_at, messages[i - 1].created_at);
            const isSent = msg.direction === 'sent';
            const isSystem = msg.direction === 'system';
            const isHovered = hoveredMsg === msg.id;
            const menuOpen = openMenu === msg.id;
            const isDeleting = deletingMsg === msg.id;

            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div className="date-separator"><span>{formatDateSep(msg.created_at)}</span></div>
                )}

                {/* Message row: bubble + action button side by side */}
                <div
                  className={`message-row ${isSent ? 'sent' : isSystem ? 'system' : 'received'}`}
                  onMouseEnter={() => setHoveredMsg(msg.id)}
                  onMouseLeave={() => { setHoveredMsg(null); }}
                  style={{ opacity: isDeleting ? 0.4 : 1, transition: 'opacity 0.2s' }}
                >
                  {/* For sent messages: ⋮ button appears to the LEFT of the bubble */}
                  {isSent && (isHovered || menuOpen) && (
                    <div className="msg-action-wrapper left" ref={menuOpen ? menuRef : null}>
                      <button
                        className="msg-menu-btn"
                        onClick={() => setOpenMenu(menuOpen ? null : msg.id)}
                        title="Actions"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                        </svg>
                      </button>
                      {menuOpen && (
                        <div className="msg-menu-dropdown">
                          <button
                            className="msg-menu-item danger"
                            onClick={() => handleDeleteMessage(msg.id)}
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                            Supprimer ce message
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={`message-bubble ${isSent ? 'sent' : isSystem ? 'system' : 'received'}`}>
                    <span className="message-text">
                      {msg.media_path ? (
                        renderMedia(msg)
                      ) : /^\[(Image|Vidéo|Audio|Document|Sticker|Fichier)\]$/.test(msg.content) ? (
                        <span className={`media-badge-fallback ${
                          msg.content === '[Image]' ? 'image' :
                          msg.content === '[Vidéo]' ? 'video' :
                          msg.content === '[Audio]' ? 'audio' :
                          msg.content === '[Document]' ? 'document' :
                          msg.content === '[Sticker]' ? 'sticker' : 'file'
                        }`}>
                          <span className="media-badge-icon">
                            {msg.content === '[Image]' ? '📷' :
                             msg.content === '[Vidéo]' ? '🎥' :
                             msg.content === '[Audio]' ? '🎵' :
                             msg.content === '[Document]' ? '📄' :
                             msg.content === '[Sticker]' ? '🎭' : '📎'}
                          </span>
                          <span>{msg.content.replace(/[\[\]]/g, '')}</span>
                          <span className="media-badge-unavail">· non disponible</span>
                        </span>
                      ) : renderText(msg.content)}
                    </span>
                    <span className="message-time">
                      {formatMsgTime(msg.created_at)}
                      {isSent && (
                        <svg className="read-tick" viewBox="0 0 16 11" fill="currentColor" style={{ marginLeft: 4 }}>
                          <path d="M11.071.653a.75.75 0 0 1 .206 1.04l-5.5 8a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.4 2.4 4.947-7.2a.75.75 0 0 1 1.04-.294z"/>
                          <path d="M14.571.653a.75.75 0 0 1 .206 1.04l-5.5 8a.75.75 0 0 1-1.04.206.75.75 0 0 1-.114-.32l.108-.157 5.3-7.71a.75.75 0 0 1 1.04-.06z"/>
                        </svg>
                      )}
                    </span>
                  </div>

                  {/* For received messages: ⋮ button appears to the RIGHT */}
                  {!isSent && !isSystem && (isHovered || menuOpen) && (
                    <div className="msg-action-wrapper right" ref={menuOpen ? menuRef : null}>
                      <button
                        className="msg-menu-btn"
                        onClick={() => setOpenMenu(menuOpen ? null : msg.id)}
                        title="Actions"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                        </svg>
                      </button>
                      {menuOpen && (
                        <div className="msg-menu-dropdown">
                          <button
                            className="msg-menu-item"
                            onClick={() => { navigator.clipboard.writeText(msg.content); setOpenMenu(null); }}
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                            </svg>
                            Copier le texte
                          </button>
                        </div>
                      )}
                    </div>
                  )}
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

      {showTemplates && (
        <div className="emoji-picker" ref={templatesRef} style={{ maxHeight: 300, overflowY: 'auto' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-secondary, #8e9baa)' }}>
            ⚡ Réponses rapides
          </div>
          {loadingTemplates ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary, #8e9baa)', fontSize: '0.85rem' }}>Chargement…</div>
          ) : quickReplies.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary, #8e9baa)', fontSize: '0.85rem' }}>
              Aucun template. Créez-en dans Paramètres → Templates.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {quickReplies.map(qr => (
                <button
                  key={qr.id}
                  onClick={() => insertTemplate(qr.content)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 2,
                    padding: '10px 14px', textAlign: 'left', background: 'none',
                    border: 'none', borderBottom: '1px solid var(--border, rgba(255,255,255,0.05))',
                    cursor: 'pointer', color: 'var(--text-primary, #e8eaed)',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary, rgba(255,255,255,0.05))'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--accent, #25d366)' }}>
                    {qr.title}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #8e9baa)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                    {qr.content}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      <div className="chat-input-bar">
        <button
          className={`emoji-toggle-btn ${showTemplates ? 'active' : ''}`}
          onClick={handleToggleTemplates}
          title="Réponses rapides"
          type="button"
          style={{ fontSize: '1rem', fontWeight: 700 }}
        >
          ⚡
        </button>
        <button
          className={`emoji-toggle-btn ${showEmoji ? 'active' : ''}`}
          onClick={() => { setShowEmoji(v => !v); setShowTemplates(false); }}
          title="Emojis"
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
            <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
          </svg>
        </button>
        <button
          className="emoji-toggle-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Joindre un fichier"
          type="button"
          disabled={sendingMedia || !waStatus.isConnected}
          style={{ opacity: sendingMedia ? 0.5 : 1 }}
        >
          {sendingMedia ? (
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeDasharray="56" strokeDashoffset="14" style={{animation:'spin .8s linear infinite'}}/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5V6H9v9.5a3 3 0 0 0 6 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
            </svg>
          )}
        </button>
        <button
          className={`emoji-toggle-btn ${recording ? 'active' : ''}`}
          onClick={handleToggleRecord}
          title={recording ? 'Arrêter l\'enregistrement' : 'Enregistrer un message vocal'}
          type="button"
          disabled={sendingMedia || !waStatus.isConnected}
          style={{ color: recording ? '#e74c3c' : undefined }}
        >
          {recording ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M6 6h12v12H6z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
            </svg>
          )}
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
      {sendError && (
        <div style={{
          position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)',
          background: '#c0392b', color: '#fff', padding: '8px 16px', borderRadius: 8,
          fontSize: '0.85rem', boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap'
        }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          {sendError}
        </div>
      )}
    </div>
  );
}
