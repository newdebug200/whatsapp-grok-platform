import React from 'react';
import './InfoPages.css';

const steps = [
  ['01', 'Connectez WhatsApp', 'Ouvrez les réglages du bot, créez un profil puis scannez le QR code. Botora conserve votre session pour faciliter les prochaines connexions.'],
  ['02', 'Préparez votre assistant', 'Configurez le ton, les horaires, les FAQ, les réponses rapides et les règles de détection adaptées à votre activité.'],
  ['03', 'Organisez vos contacts', 'Retrouvez vos discussions, utilisez les tags et faites progresser vos prospects dans l’entonnoir de contacts.'],
  ['04', 'Suivez et améliorez', 'Consultez les statistiques, les sentiments clients et les alertes pour garder une vue précise sur votre relation client.'],
];

export function AboutPage({ onBack }) {
  return <InfoLayout eyebrow="L’univers Botora" title="À propos de Botora" intro="Botora réunit vos conversations WhatsApp, votre assistant IA et vos outils de suivi client dans une expérience simple, élégante et maîtrisée." onBack={onBack}>
    <div className="info-about-grid">
      <article className="info-highlight"><span className="info-symbol">✦</span><h2>Une relation client plus fluide</h2><p>Botora vous aide à répondre avec cohérence, à ne manquer aucune opportunité et à transformer vos échanges en actions concrètes.</p></article>
      <article className="info-highlight"><span className="info-symbol">◈</span><h2>Conçu pour garder le contrôle</h2><p>Vous décidez du comportement du bot, des modules activés, des profils connectés et des données conservées.</p></article>
    </div>
    <div className="info-quote">« Une technologie utile est une technologie qui vous laisse rester proche de vos clients. »</div>
  </InfoLayout>;
}

export function HowItWorksPage({ onBack }) {
  return <InfoLayout eyebrow="Guide de démarrage" title="Comment ça marche ?" intro="Suivez ces quatre étapes pour tirer le meilleur parti de Botora et construire une expérience WhatsApp plus réactive." onBack={onBack}>
    <div className="info-steps">{steps.map(([number, title, text]) => <article className="info-step" key={number}><span className="info-step-number">{number}</span><div><h2>{title}</h2><p>{text}</p></div></article>)}</div>
    <div className="info-tip"><strong>Conseil</strong><span>Commencez par connecter un profil WhatsApp et configurez une FAQ courte. Vous pourrez enrichir votre assistant progressivement.</span></div>
  </InfoLayout>;
}

function InfoLayout({ eyebrow, title, intro, onBack, children }) {
  return <section className="info-page"><div className="info-page-inner"><button className="info-back" onClick={onBack}>← Retour au tableau de bord</button><header className="info-hero"><span className="info-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{intro}</p></header><div className="info-content">{children}</div></div></section>;
}
