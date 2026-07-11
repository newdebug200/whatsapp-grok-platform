import React from 'react';
import Funnel from './Funnel';
import './FunnelPage.css';

// Full-screen page for the contact funnel — same treatment as the Dashboard
// home page (no sidebar, own header), so the CRM board gets an entire page
// to breathe instead of being squeezed next to other widgets.
export default function FunnelPage({ onBack, onSelectContact }) {
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
        <Funnel onSelectContact={onSelectContact} />
      </div>
    </div>
  );
}
