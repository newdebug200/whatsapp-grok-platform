import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const FUNNEL_STAGES = ['prospect', 'interesse', 'client', 'fidele'];
const STAGE_LABELS = { prospect: 'Prospect', interesse: 'Intéressé', client: 'Client', fidele: 'Fidèle' };
const PAGE_SIZE = 30;

// Light, CRM-style palette — this board is embedded directly on the (light)
// Dashboard home page, so it needs to look like a proper CRM pipeline, not
// the dark chat-app theme it used to borrow.
const STAGE_COLORS = {
  prospect:  { accent: '#8e9baa', tint: '#f4f5f7', header: '#eef0f3' },
  interesse: { accent: '#e0ab00', tint: '#fdf8e8', header: '#faf0ce' },
  client:    { accent: '#25d366', tint: '#eafaf1', header: '#d9f5e5' },
  fidele:    { accent: '#9b59b6', tint: '#f6eefa', header: '#efdcf5' },
};

const avatarColors = ['#25d366','#128c7e','#075e54','#34b7f1','#667eea','#e0ab00','#fd79a8'];
const getColor = (id) => avatarColors[(id || 0) % avatarColors.length];
const getInitial = (c) => (c.name || c.phone_number || '?').charAt(0).toUpperCase();

// The funnel used to load every contact for every stage (with tags) in one request.
// That's slow on large contact bases and re-renders the whole board on any change.
// Now: 1) fetch cheap per-stage counts first so the board paints instantly, then
// 2) lazily fetch each column's contacts (paginated, minimal fields) only when
// it's actually visible/expanded, and 3) update state locally on drag-and-drop
// instead of refetching everything.
export default function Funnel({ onSelectContact }) {
  const [counts, setCounts] = useState(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [columns, setColumns] = useState({}); // stage -> { contacts, total, hasMore, loading, loaded }
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [moving, setMoving] = useState(null);
  const loadedStages = useRef(new Set());

  const loadCounts = useCallback(async () => {
    setCountsLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/funnel/counts`);
      setCounts(res.data.counts);
    } catch {
      setError('Impossible de charger le funnel. Vérifiez que le serveur est en marche.');
    } finally {
      setCountsLoading(false);
    }
  }, []);

  const loadColumn = useCallback(async (stage, { append = false } = {}) => {
    setColumns(prev => ({ ...prev, [stage]: { ...(prev[stage] || {}), loading: true } }));
    try {
      const offset = append ? (columns[stage]?.contacts?.length || 0) : 0;
      const res = await axios.get(`${API_URL}/funnel`, { params: { stage, limit: PAGE_SIZE, offset } });
      setColumns(prev => {
        const existing = prev[stage]?.contacts || [];
        return {
          ...prev,
          [stage]: {
            contacts: append ? [...existing, ...res.data.contacts] : res.data.contacts,
            total: res.data.total,
            hasMore: res.data.hasMore,
            loading: false,
            loaded: true,
          }
        };
      });
      loadedStages.current.add(stage);
    } catch {
      setColumns(prev => ({ ...prev, [stage]: { ...(prev[stage] || {}), loading: false } }));
      setError('Impossible de charger une colonne du funnel.');
      setTimeout(() => setError(''), 3000);
    }
  }, [columns]);

  // Only the first stage is fetched eagerly (it's the one most people land on /
  // drop into by default). The rest load on demand — first paint, first scroll,
  // or first drag-over — instead of all at once.
  useEffect(() => { loadCounts(); }, [loadCounts]);
  useEffect(() => {
    if (counts && !loadedStages.current.has(FUNNEL_STAGES[0])) {
      loadColumn(FUNNEL_STAGES[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts]);

  const ensureColumnLoaded = (stage) => {
    if (!loadedStages.current.has(stage) && !columns[stage]?.loading) {
      loadColumn(stage);
    }
  };

  const moveContact = async (contact, fromStage, toStage) => {
    if (fromStage === toStage || moving) return;
    setMoving(contact.id);
    try {
      await axios.put(`${API_URL}/funnel/contact/${contact.id}`, { stage: toStage });
      // Local, optimistic-style update: move the card between the two already-loaded
      // columns instead of re-fetching the whole board.
      setColumns(prev => {
        const next = { ...prev };
        if (next[fromStage]) {
          next[fromStage] = { ...next[fromStage], contacts: next[fromStage].contacts.filter(c => c.id !== contact.id) };
        }
        if (next[toStage]) {
          next[toStage] = { ...next[toStage], contacts: [{ ...contact, funnel_stage: toStage }, ...next[toStage].contacts] };
        }
        return next;
      });
      setCounts(prev => prev?.map(c => {
        if (c.stage === fromStage) return { ...c, count: Math.max(0, c.count - 1) };
        if (c.stage === toStage) return { ...c, count: c.count + 1 };
        return c;
      }));
    } catch {
      setError('Erreur lors du déplacement du contact.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setMoving(null);
    }
  };

  const handleDragStart = (e, contact, stage) => {
    setDragging({ contact, stage });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, stage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(stage);
    ensureColumnLoaded(stage);
  };

  const handleDrop = (e, stage) => {
    e.preventDefault();
    setDragOver(null);
    if (dragging) moveContact(dragging.contact, dragging.stage, stage);
    setDragging(null);
  };

  const handleDragEnd = () => { setDragging(null); setDragOver(null); };

  const totalContacts = counts?.reduce((s, c) => s + c.count, 0) || 0;

  if (countsLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, color: '#8696a0', fontSize: '0.85rem' }}>
      Chargement de l'entonnoir…
    </div>
  );

  return (
    <div style={{
      background: '#fff', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #edf0f2', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111b21' }}>Entonnoir de contacts</div>
          <div style={{ fontSize: '0.78rem', color: '#667781', marginTop: 2 }}>
            Glissez les contacts entre les étapes · Cliquez pour ouvrir la conversation
          </div>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#667781', fontWeight: 600 }}>{totalContacts} contact{totalContacts === 1 ? '' : 's'}</div>
      </div>

      {error && (
        <div style={{ margin: '10px 22px 0', background: '#fdecea', color: '#c0392b', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '18px 22px 22px' }}>
        {counts?.map(({ stage, label, count }) => {
          const colors = STAGE_COLORS[stage] || STAGE_COLORS.prospect;
          const isOver = dragOver === stage;
          const col = columns[stage];
          return (
            <div
              key={stage}
              onDragOver={(e) => handleDragOver(e, stage)}
              onDrop={(e) => handleDrop(e, stage)}
              onDragLeave={() => setDragOver(null)}
              style={{
                flex: '1 1 0', minWidth: 240, maxWidth: 340,
                display: 'flex', flexDirection: 'column',
                background: isOver ? colors.tint : '#fafbfc',
                border: `1.5px solid ${isOver ? colors.accent : '#edf0f2'}`,
                borderRadius: 12,
                height: 560,
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {/* Column header */}
              <div style={{
                padding: '12px 14px', borderRadius: '12px 12px 0 0',
                background: colors.header, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
              }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: colors.accent, flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#2b2f33', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {label}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 700, color: '#fff', background: colors.accent, borderRadius: 10, padding: '2px 9px' }}>
                  {count}
                </span>
              </div>

              {/* Cards */}
              <div
                style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (col?.hasMore && !col.loading && el.scrollTop + el.clientHeight > el.scrollHeight - 60) {
                    loadColumn(stage, { append: true });
                  }
                }}
                onMouseEnter={() => ensureColumnLoaded(stage)}
              >
                {!col?.loaded && !col?.loading && (
                  <div style={{ textAlign: 'center', padding: '28px 8px', color: '#9aa5ad', fontSize: '0.8rem' }}>
                    Survolez pour charger…
                  </div>
                )}
                {col?.loading && (!col.contacts || col.contacts.length === 0) && (
                  <div style={{ textAlign: 'center', padding: '28px 8px', color: '#9aa5ad', fontSize: '0.8rem' }}>
                    Chargement…
                  </div>
                )}
                {col?.loaded && count === 0 && (
                  <div style={{ textAlign: 'center', padding: '28px 8px', color: '#b3bac0', fontSize: '0.8rem', borderRadius: 8, border: '1px dashed #dfe3e6', marginTop: 4 }}>
                    Glissez un contact ici
                  </div>
                )}
                {col?.contacts?.map(contact => {
                  const lastMsg = contact.messages?.[0];
                  const isDragging = dragging?.contact?.id === contact.id;
                  const isMoving = moving === contact.id;
                  return (
                    <div
                      key={contact.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, contact, stage)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onSelectContact && onSelectContact(contact)}
                      style={{
                        background: '#fff',
                        border: '1px solid #e9edef',
                        borderLeft: `3px solid ${colors.accent}`,
                        borderRadius: 8, padding: '10px 12px',
                        marginBottom: 8, cursor: 'grab',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        opacity: isDragging || isMoving ? 0.4 : 1,
                        transition: 'opacity 0.15s, box-shadow 0.15s',
                        userSelect: 'none',
                      }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.12)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'}
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
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#111b21', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {contact.name || contact.phone_number}
                          </div>
                          {contact.name && (
                            <div style={{ fontSize: '0.73rem', color: '#8696a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                        <div style={{ fontSize: '0.74rem', color: '#8696a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 36 }}>
                          {lastMsg.type === 'image' ? '📷 Photo' :
                           lastMsg.type === 'video' ? '🎥 Vidéo' :
                           lastMsg.type === 'ptt' ? '🎤 Message vocal' :
                           lastMsg.type === 'audio' ? '🎵 Audio' :
                           lastMsg.type === 'sticker' ? '🪄 Sticker' :
                           lastMsg.type === 'document' ? '📄 Document' :
                           (lastMsg.content || '').substring(0, 50)}
                        </div>
                      )}

                      {/* Stage quick-change buttons */}
                      <div style={{ display: 'flex', gap: 4, marginTop: 8, paddingLeft: 36, flexWrap: 'wrap' }}>
                        {FUNNEL_STAGES.filter(s => s !== stage).map(s => {
                          const c = STAGE_COLORS[s];
                          return (
                            <button
                              key={s}
                              onClick={(e) => { e.stopPropagation(); moveContact(contact, stage, s); }}
                              title={`Déplacer vers ${STAGE_LABELS[s]}`}
                              style={{
                                padding: '2px 7px', borderRadius: 10, border: `1px solid ${c.accent}55`,
                                background: c.accent + '14', color: c.accent, fontSize: '0.68rem', fontWeight: 600,
                                cursor: 'pointer', transition: 'background 0.15s'
                              }}
                              onMouseEnter={ev => ev.currentTarget.style.background = c.accent + '28'}
                              onMouseLeave={ev => ev.currentTarget.style.background = c.accent + '14'}
                            >
                              → {STAGE_LABELS[s]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {col?.hasMore && col.loaded && (
                  <button
                    onClick={() => loadColumn(stage, { append: true })}
                    disabled={col.loading}
                    style={{
                      width: '100%', padding: '8px', marginTop: 4, borderRadius: 8,
                      border: '1px dashed #dfe3e6', background: 'transparent',
                      color: '#667781', fontSize: '0.75rem', cursor: 'pointer'
                    }}
                  >
                    {col.loading ? 'Chargement…' : `Voir plus (${col.contacts.length}/${col.total})`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
