import React from 'react';
import './InfoPages.css';

const steps = [
  ['01', 'Créez votre espace', 'Inscrivez-vous en quelques instants et découvrez votre espace Botora. Pendant votre période d’essai, vous pouvez prendre le temps de comprendre les outils et de préparer votre organisation.'],
  ['02', 'Connectez votre WhatsApp', 'Depuis les réglages, associez le profil WhatsApp que vous utilisez pour votre activité. Une fois la connexion établie, vos échanges peuvent être suivis depuis un espace unique.'],
  ['03', 'Définissez vos préférences', 'Choisissez les fonctions qui vous intéressent : assistance dans les conversations, réponses rapides, réponses automatiques par mot-clé, FAQ et alertes. Vous gardez toujours la décision d’activer ou non chaque option.'],
  ['04', 'Organisez votre relation client', 'Retrouvez vos conversations, identifiez vos contacts, utilisez les étiquettes et préparez vos campagnes avec une organisation adaptée à votre activité.'],
  ['05', 'Observez et améliorez', 'Consultez les statistiques, les alertes et les tendances de vos échanges pour mieux comprendre vos clients et améliorer progressivement vos réponses.'],
];

export function AboutPage({ onBack }) {
  return <InfoLayout
    eyebrow="L’univers Botora"
    title="À propos de Botora"
    intro="Botora vous aide à gérer votre relation client sur WhatsApp avec plus de clarté, de régularité et de sérénité. Tout est réuni dans un même espace pour vous permettre de rester proche de vos clients."
    onBack={onBack}
  >
    <div className="info-about-grid info-about-grid-three">
      <article className="info-highlight"><span className="info-symbol">✦</span><h2>Un espace simple pour avancer</h2><p>Botora rassemble vos conversations, vos contacts et vos outils de suivi afin que vous puissiez vous concentrer sur la qualité de vos échanges.</p></article>
      <article className="info-highlight"><span className="info-symbol">◈</span><h2>Une assistance à votre rythme</h2><p>Vous choisissez les fonctions qui vous sont utiles. Les réglages restent entre vos mains et peuvent évoluer avec votre activité.</p></article>
      <article className="info-highlight"><span className="info-symbol">♥</span><h2>Une relation plus humaine</h2><p>Les outils de Botora sont là pour vous faire gagner du temps, sans remplacer votre jugement ni la relation personnelle avec vos clients.</p></article>
    </div>
    <div className="info-quote">« Botora transforme vos échanges quotidiens en une relation client mieux organisée, plus attentive et plus constante. »</div>
    <div className="info-about-grid">
      <article className="info-highlight"><span className="info-symbol">✓</span><h2>Ce que vous pouvez faire</h2><p>Répondre plus rapidement, préparer des messages, suivre vos contacts, lancer des campagnes, consulter votre activité et repérer les situations qui méritent votre attention.</p></article>
      <article className="info-highlight"><span className="info-symbol">⚙</span><h2>Ce qui reste sous votre contrôle</h2><p>Vous décidez de vos préférences, des fonctions actives, des réponses proposées et de la manière dont vous souhaitez utiliser votre espace Botora.</p></article>
    </div>
  </InfoLayout>;
}

export function HowItWorksPage({ onBack }) {
  return <InfoLayout
    eyebrow="Guide de démarrage"
    title="Comment ça marche ?"
    intro="Botora vous accompagne pas à pas pour mieux gérer vos échanges WhatsApp. Commencez simplement, puis enrichissez votre organisation lorsque vous êtes prêt."
    onBack={onBack}
  >
    <div className="info-steps">{steps.map(([number, title, text]) => <article className="info-step" key={number}><span className="info-step-number">{number}</span><div><h2>{title}</h2><p>{text}</p></div></article>)}</div>
    <div className="info-tip"><strong>Pour commencer</strong><span>Connectez d’abord votre profil WhatsApp, puis activez uniquement les fonctions dont vous avez besoin. Vous pourrez modifier vos choix à tout moment.</span></div>
    <div className="info-highlight info-final-card"><span className="info-symbol">→</span><h2>Une utilisation progressive</h2><p>Vous n’avez pas besoin de tout configurer dès le début. Commencez par vos conversations et vos réponses essentielles, puis ajoutez les campagnes, les étiquettes et les outils de suivi au fur et à mesure.</p></div>
  </InfoLayout>;
}

function InfoLayout({ eyebrow, title, intro, onBack, children }) {
  return <section className="info-page"><div className="info-page-inner"><button className="info-back" onClick={onBack}>← Retour au tableau de bord</button><header className="info-hero"><span className="info-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{intro}</p></header><div className="info-content">{children}</div></div></section>;
}
