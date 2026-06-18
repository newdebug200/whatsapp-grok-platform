import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const STAGE_COLORS = {
  prospect:  { bg: '#1e2a35', border: '#2d3f50', dot: '#8e9baa', label: '#8e9baa' },
  interesse: { bg: '#1a2a1e', border: '#2d4a35', dot: '#f6c90e', label: '#f6c90e' },
  client:    { bg: '#1a1e2a', border: '#2d3550', dot: '#25d366', label: '#25d366' },
  fidele:    { bg: '#2a1a2a', border: '#4a2d4a', dot: '#9b59b6', label: '#9b59b6' },
};

const avatarColors = ['#25d366','#128c7e','#075e54','#34b7f1','#667eea','#f6c90e','#fd79a8'];
const getColor = (id) => avatarColors[(id || 0) % avatarColors.length];
const getInitial = (c) => (c.name || c.phone_number || '?').charAt(0).toUpperCase();

export default function Funnel({ onSelectContact }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [moving, setMoving] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/funnel`);
      setData(res.data);
    } catch {
      setError('Impossible de charger le funnel. Vérifiez que le serveur est en marche.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const moveContact = async (contact, toStage) => {
    if (contact.funnel_stage === toStage || moving) return;
    setMoving(contact.id);
    try {
      await axios.put(`${API_URL}/funnel/contact/${contact.id}`, { stage: toStage });
      setData(prev => {
        if (!prev) return prev;
        const grouped = { ...prev.grouped };
        for (const stage of prev.stages) {
          grouped[stage] = {
            ...grouped[stage],
            contacts: grouped[stage].contacts.filter(c => c.id !== contact.id)
          };
        }
        grouped[toStage] = {
          ...grouped[toStage],
          contacts: [{ ...contact, funnel_stage: toStage }, ...grouped[toStage].contacts]
        };
        return { ...prev, grouped };
      });
    } catch {
      setError("Erreur lors du déplacement du contact.");
      setTimeout(() => setError(''), 3000);
    } finally {
      setMoving(null);
    }
  };

  const handleDragStart = (e, contact) => {
    setDragging(contact);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, stage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(stage);
  };

  const handleDrop = (e, stage) => {
    e.preventDefault();
    setDragOver(null);
    if (dragging) moveContact(dragging, stage);
    setDragging(null);
  };

  const handleDragEnd = () => { setDragging(null); setDragOver(null); };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary, #8e9baa)' }}>
      Chargement…
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary, #e8eaed)', marginBottom: 2 }}>Entonnoir de contacts</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #8e9baa)' }}>
          Glissez les contacts entre les étapes · Cliquez pour ouvrir la conversation
        </div>
        {error && <div style={{ marginTop: 8, background: '#fdecea', color: '#c0392b', borderRadius: 6, padding: '6px 10px', fontSize: '0.82rem' }}>{error}</div>}
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 0, overflowX: 'auto', overflowY: 'hidden', padding: '12px 8px' }}>
        {data?.stages.map(stage => {
          const col = data.grouped[stage];
          const colors = STAGE_COLORS[stage] || STAGE_COLORS.prospect;
          const isOver = dragOver === stage;
          return (
            <div
              key={stage}
              onDragOver={(e) => handleDragOver(e, stage)}
              onDrop={(e) => handleDrop(e, stage)}
              onDragLeave={() => setDragOver(null)}
              style={{
                flex: '1 1 0', minWidth: 200, maxWidth: 320,
                display: 'flex', flexDirection: 'column',
                margin: '0 6px',
                background: isOver ? colors.bg + 'cc' : colors.bg,
                border: `1.5px solid ${isOver ? colors.dot : colors.border}`,
                borderRadius: 12,
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {/* Column header */}
              <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: colors.dot, flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: colors.label, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {col.label}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 600, color: colors.dot, background: colors.dot + '22', borderRadius: 10, padding: '1px 8px' }}>
                  {col.contacts.length}
                </span>
              </div>

              {/* Cards */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 8px' }}>
                {col.contacts.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 8px', color: colors.label + '66', fontSize: '0.8rem', borderRadius: 8, border: `1px dashed ${colors.border}`, marginTop: 4 }}>
                    Glissez un contact ici
                  </div>
                )}
                {col.contacts.map(contact => {
                  const lastMsg = contact.messages?.[0];
                  const isDragging = dragging?.id === contact.id;
                  const isMoving = moving === contact.id;
                  return (
                    <div
                      key={contact.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, contact)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onSelectContact && onSelectContact(contact)}
                      style={{
                        background: 'var(--bg-primary, #111b21)',
                        border: '1px solid var(--border, rgba(255,255,255,0.08))',
                        borderRadius: 8, padding: '10px 12px',
                        marginBottom: 6, cursor: 'grab',
                        opacity: isDragging || isMoving ? 0.4 : 1,
                        transition: 'opacity 0.15s, box-shadow 0.15s',
                        userSelect: 'none',
                      }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: lastMsg ? 6 : 0 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: getColor(contact.id),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.78rem', fontWeight: 700, color: '#fff', flexShrink: 0
                        }}>
                          {getInitial(contact)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary, #e8eaed)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {contact.name || contact.phone_number}
                          </div>
                          {contact.name && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #8e9baa)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {contact.phone_number}
                            </div>
                          )}
                        </div>
                        {contact.unread_count > 0 && (
                          <span style={{ minWidth: 16, height: 16, borderRadius: 8, background: '#25d366', color: '#fff', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', flexShrink: 0 }}>
                            {contact.unread_count}
                          </span>
                        )}
                      </div>
                      {lastMsg && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #8e9baa)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 36 }}>
                          {lastMsg.content?.substring(0, 50)}
                        </div>
                      )}

                      {/* Stage quick-change buttons */}
                      <div style={{ display: 'flex', gap: 4, marginTop: 8, paddingLeft: 36 }}>
                        {data.stages.filter(s => s !== stage).map(s => {
                          const c = STAGE_COLORS[s];
                          return (
                            <button
                              key={s}
                              onClick={(e) => { e.stopPropagation(); moveContact(contact, s); }}
                              title={`Déplacer vers ${data.grouped[s].label}`}
                              style={{
                                padding: '2px 7px', borderRadius: 10, border: `1px solid ${c.dot}44`,
                                background: c.dot + '18', color: c.dot, fontSize: '0.68rem', fontWeight: 600,
                                cursor: 'pointer', transition: 'background 0.15s'
                              }}
                              onMouseEnter={ev => ev.currentTarget.style.background = c.dot + '33'}
                              onMouseLeave={ev => ev.currentTarget.style.background = c.dot + '18'}
                            >
                              → {data.grouped[s].label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
