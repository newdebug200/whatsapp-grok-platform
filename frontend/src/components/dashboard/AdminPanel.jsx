import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import './AdminPanel.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function VerificationSection() {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [triggers, setTriggers] = useState([]);
  const [newText, setNewText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const showMsg = (text, error = false) => {
    setMsg({ text, error });
    setTimeout(() => setMsg(null), 3500);
  };

  useEffect(() => {
    axios.get(`${API_URL}/admin/profiles`)
      .then(r => {
        setProfiles(r.data);
        if (r.data.length > 0) setSelectedProfileId(String(r.data[0].id));
      })
      .catch(() => {});
  }, []);

  const loadTriggers = useCallback(async (profileId) => {
    if (!profileId) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/verification-triggers/${profileId}`);
      setTriggers(r.data);
    } catch {
      setTriggers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProfileId) loadTriggers(selectedProfileId);
  }, [selectedProfileId, loadTriggers]);

  const handleAdd = async () => {
    if (!newText.trim() || !selectedProfileId) return;
    setSaving(true);
    try {
      const r = await axios.post(`${API_URL}/admin/verification-triggers`, {
        profile_id: parseInt(selectedProfileId),
        text: newText.trim()
      });
      setTriggers(prev => [...prev, r.data]);
      setNewText('');
      showMsg('Déclencheur ajouté');
    } catch (err) {
      showMsg(err.response?.data?.error || 'Erreur', true);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (trigger) => {
    try {
      const r = await axios.patch(`${API_URL}/admin/verification-triggers/${trigger.id}`, {
        is_active: !trigger.is_active
      });
      setTriggers(prev => prev.map(t => t.id === trigger.id ? r.data : t));
    } catch {
      showMsg('Erreur mise à jour', true);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_URL}/admin/verification-triggers/${id}`);
      setTriggers(prev => prev.filter(t => t.id !== id));
      showMsg('Déclencheur supprimé');
    } catch {
      showMsg('Erreur suppression', true);
    }
  };

  return (
    <div className="admin-verif-section">
      <div className="admin-verif-header">
        <div className="admin-verif-title-row">
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" className="admin-verif-icon">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
          </svg>
          <h3 className="admin-verif-title">Vérification WhatsApp</h3>
        </div>
        <p className="admin-verif-desc">
          Quand un utilisateur envoie exactement l'un de ces textes, le bot vérifie son numéro via l'API externe et lui renvoie le résultat. L'IA ne répond pas.
        </p>
      </div>

      {profiles.length === 0 ? (
        <div className="admin-verif-empty-profiles">Aucun profil WhatsApp configuré.</div>
      ) : (
        <>
          <div className="admin-verif-profile-row">
            <label className="admin-verif-label">Profil WhatsApp</label>
            <select
              className="admin-verif-select"
              value={selectedProfileId}
              onChange={e => setSelectedProfileId(e.target.value)}
            >
              {profiles.map(p => (
                <option key={p.id} value={String(p.id)}>
                  {p.phone_number}{p.display_name ? ` — ${p.display_name}` : ''}{p.is_connected ? ' ●' : ''}
                </option>
              ))}
            </select>
          </div>

          {msg && (
            <div className={`admin-verif-msg ${msg.error ? 'error' : 'success'}`}>{msg.text}</div>
          )}

          <div className="admin-verif-add-row">
            <input
              className="admin-verif-input"
              type="text"
              placeholder="Texte déclencheur exact (ex: confirm whatsapp)"
              value={newText}
              onChange={e => setNewText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button
              className="admin-verif-add-btn"
              onClick={handleAdd}
              disabled={saving || !newText.trim()}
            >
              {saving ? '…' : '+ Ajouter'}
            </button>
          </div>

          {loading ? (
            <div className="admin-verif-loading">Chargement…</div>
          ) : triggers.length === 0 ? (
            <div className="admin-verif-no-triggers">Aucun déclencheur configuré pour ce profil.</div>
          ) : (
            <div className="admin-verif-list">
              {triggers.map(t => (
                <div key={t.id} className={`admin-verif-item ${t.is_active ? 'active' : 'inactive'}`}>
                  <span className="admin-verif-item-text">"{t.text}"</span>
                  <div className="admin-verif-item-actions">
                    <label className="admin-verif-toggle" title={t.is_active ? 'Désactiver' : 'Activer'}>
                      <input
                        type="checkbox"
                        checked={t.is_active}
                        onChange={() => handleToggle(t)}
                      />
                      <span className="admin-verif-toggle-track">
                        <span className="admin-verif-toggle-thumb" />
                      </span>
                      <span className="admin-verif-toggle-label">{t.is_active ? 'Actif' : 'Inactif'}</span>
                    </label>
                    <button
                      className="admin-verif-delete-btn"
                      onClick={() => handleDelete(t.id)}
                      title="Supprimer"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminPanel() {
  const { account: currentAccount } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [roleLoadingId, setRoleLoadingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get(`${API_URL}/admin/users`);
      setUsers(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const showMsg = (msg, isError = false) => {
    setActionMsg({ text: msg, error: isError });
    setTimeout(() => setActionMsg(null), 4000);
  };

  const handleDeleteConfirm = async (userId) => {
    setDeletingId(userId);
    try {
      const res = await axios.delete(`${API_URL}/admin/users/${userId}`);
      showMsg(res.data.message);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      showMsg(err.response?.data?.error || 'Erreur lors de la suppression', true);
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  const handleRoleToggle = async (user) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    setRoleLoadingId(user.id);
    try {
      await axios.patch(`${API_URL}/admin/users/${user.id}/role`, { role: newRole });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
      showMsg(`${user.name} est maintenant ${newRole === 'admin' ? 'administrateur' : 'utilisateur'}`);
    } catch (err) {
      showMsg(err.response?.data?.error || 'Erreur lors du changement de rôle', true);
    } finally {
      setRoleLoadingId(null);
    }
  };

  const totalMessages = users.reduce((s, u) => s + u.msgSent + u.msgReceived, 0);
  const totalProfiles = users.reduce((s, u) => s + u.profileCount, 0);
  const totalContacts = users.reduce((s, u) => s + u.contactCount, 0);

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2 className="admin-title">Administration</h2>
        <button className="admin-refresh-btn" onClick={loadUsers} disabled={loading} title="Rafraîchir">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
          </svg>
        </button>
      </div>

      <VerificationSection />

      <div className="admin-stats-row">
        <div className="admin-stat-card">
          <div className="admin-stat-value">{users.length}</div>
          <div className="admin-stat-label">Utilisateurs</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{totalProfiles}</div>
          <div className="admin-stat-label">Profils WhatsApp</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{totalContacts}</div>
          <div className="admin-stat-label">Contacts totaux</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{totalMessages}</div>
          <div className="admin-stat-label">Messages traités</div>
        </div>
      </div>

      {actionMsg && (
        <div className={`admin-action-msg ${actionMsg.error ? 'error' : 'success'}`}>
          {actionMsg.text}
        </div>
      )}

      {loading ? (
        <div className="admin-loading">Chargement des utilisateurs…</div>
      ) : error ? (
        <div className="admin-error">{error}</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Rôle</th>
                <th>Profils</th>
                <th>Contacts</th>
                <th>Msg reçus</th>
                <th>Msg envoyés</th>
                <th>FAQs</th>
                <th>Dernière activité</th>
                <th>Inscrit le</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className={user.id === currentAccount?.id ? 'admin-row-self' : ''}>
                  <td className="admin-cell-user">
                    <div className="admin-user-avatar">{user.name.charAt(0).toUpperCase()}</div>
                    <div>
                      <div className="admin-user-name">
                        {user.name}
                        {user.id === currentAccount?.id && <span className="admin-you-badge">moi</span>}
                      </div>
                      <div className="admin-user-email">{user.email}</div>
                    </div>
                  </td>
                  <td>
                    <span className={`admin-role-badge ${user.role}`}>
                      {user.role === 'admin' ? 'Admin' : 'User'}
                    </span>
                  </td>
                  <td className="admin-cell-num">{user.profileCount} {user.connectedProfiles > 0 && <span className="admin-connected-dot">●</span>}</td>
                  <td className="admin-cell-num">{user.contactCount}</td>
                  <td className="admin-cell-num">{user.msgReceived}</td>
                  <td className="admin-cell-num">{user.msgSent}</td>
                  <td className="admin-cell-num">{user.faqCount}</td>
                  <td className="admin-cell-date">{formatDateTime(user.lastActivity)}</td>
                  <td className="admin-cell-date">{formatDate(user.created_at)}</td>
                  <td className="admin-cell-actions">
                    {user.id !== currentAccount?.id && (
                      <>
                        <button
                          className="admin-btn-role"
                          onClick={() => handleRoleToggle(user)}
                          disabled={roleLoadingId === user.id}
                          title={user.role === 'admin' ? 'Rétrograder en utilisateur' : 'Promouvoir en admin'}
                        >
                          {roleLoadingId === user.id ? '…' : user.role === 'admin' ? '↓ User' : '↑ Admin'}
                        </button>
                        <button
                          className="admin-btn-delete"
                          onClick={() => setConfirmDelete(user)}
                          disabled={deletingId === user.id}
                          title="Supprimer ce compte"
                        >
                          {deletingId === user.id ? '…' : <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-modal">
            <div className="admin-confirm-title">Supprimer ce compte ?</div>
            <div className="admin-confirm-desc">
              Vous êtes sur le point de supprimer <strong>{confirmDelete.name}</strong> ({confirmDelete.email}) ainsi que toutes ses données (profils, contacts, messages, FAQs).
              <br /><strong>Cette action est irréversible.</strong>
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-confirm-cancel" onClick={() => setConfirmDelete(null)}>Annuler</button>
              <button
                className="admin-confirm-ok"
                onClick={() => handleDeleteConfirm(confirmDelete.id)}
                disabled={deletingId === confirmDelete.id}
              >
                {deletingId === confirmDelete.id ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
