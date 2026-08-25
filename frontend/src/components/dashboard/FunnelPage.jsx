import React from 'react';
import Funnel from './Funnel';
import './FunnelPage.css';

// Full-screen page for the contact funnel — same treatment as the Dashboard
// home page (no sidebar, own header), so the CRM board gets an entire page
// to breathe instead of being squeezed next to other widgets.
export default function FunnelPage({ onBack, onSelectContact, onGoConfig, noProfile = false }) {
  return (
    <div className="fp-page">
      <div className="fp-header">
        <button className="fp-back" onClick={onBack} title="Retour au tableau de bord">
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          Tableau de bord
        </button>
        <div className="fp-title">
          <span className="fp-title-emoji">📊</span>
          <span>Entonnoir de contacts</span>
        </div>
        <div className="fp-header-spacer" />
      </div>

      <div className="fp-body">
        {noProfile ? (
          <div className="fp-no-profile" role="status">
            <div className="fp-no-profile-icon" aria-hidden="true">◌</div>
            <span className="fp-no-profile-eyebrow">Première configuration</span>
            <h2>Aucun profil WhatsApp n’est encore configuré</h2>
            <p>Connectez votre premier profil WhatsApp pour commencer à recevoir des contacts et suivre leur progression dans l’entonnoir.</p>
            {onGoConfig && <button className="fp-no-profile-action" onClick={onGoConfig}>Configurer WhatsApp</button>}
          </div>
        ) : <Funnel onSelectContact={onSelectContact} />}
      </div>
    </div>
  );
}
