import React, { useState } from 'react';
import AdminPanel from './AdminPanel';
import './AdminHub.css';

const ADMIN_PAGES = [
  { key: 'verification', label: 'Vérification', description: 'Configurez les déclencheurs de vérification WhatsApp.', icon: '✓' },
  { key: 'dressur', label: 'File WhatsApp', description: 'Supervisez les envois et leur progression.', icon: '↗' },
];

export default function AdminHub({ account, onBack }) {
  const [page, setPage] = useState('verification');
  const hasControlCenterAccess = account?.control_center_access === true
    || (account?.control_center_access == null && ['admin', 'superadmin'].includes(account?.role));
  if (!hasControlCenterAccess) {
    return <div className="admin-access-denied"><strong>Accès refusé</strong><span>Cette zone est réservée aux comptes autorisés.</span></div>;
  }
  const current = ADMIN_PAGES.find(item => item.key === page) || ADMIN_PAGES[0];
  return (
    <section className="admin-workspace" aria-label="Espace administration">
      <header className="admin-workspace-header">
        <div>
          <span className="admin-workspace-kicker">Centre de contrôle</span>
          <h1>Administration</h1>
          <p>Pilotez Botora depuis un espace centralisé, clair et sécurisé.</p>
        </div>
        <button className="admin-workspace-back" onClick={onBack}>← Tableau de bord</button>
      </header>
      <nav className="admin-page-nav" aria-label="Pages d’administration">
        {ADMIN_PAGES.map(item => (
          <button key={item.key} className={`admin-page-link ${page === item.key ? 'active' : ''}`} onClick={() => setPage(item.key)} title={item.description}>
            <span className="admin-page-icon">{item.icon}</span><span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="admin-page-heading"><div><span className="admin-workspace-kicker">Administration / {current.label}</span><h2>{current.label}</h2><p>{current.description}</p></div></div>
      {['verification', 'dressur'].includes(page) ? <AdminPanel section={page} /> : null}
    </section>
  );
}
