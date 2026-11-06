import React from 'react';
import FontAwesomeIcon from '../FontAwesomeIcon';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons/faArrowLeft';
import { faArrowRight } from '@fortawesome/free-solid-svg-icons/faArrowRight';
import { faBookOpen } from '@fortawesome/free-solid-svg-icons/faBookOpen';
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck';
import { faComments } from '@fortawesome/free-solid-svg-icons/faComments';
import { faGear } from '@fortawesome/free-solid-svg-icons/faGear';
import { faHeart } from '@fortawesome/free-solid-svg-icons/faHeart';
import { faPlug } from '@fortawesome/free-solid-svg-icons/faPlug';
import { faRobot } from '@fortawesome/free-solid-svg-icons/faRobot';
import './InfoPages.css';

const steps = [
  ['01', 'Connectez votre compte WhatsApp', 'Dans les réglages de l’agent, lancez la connexion puis scannez le QR code avec le compte WhatsApp de votre activité. Vérifiez dans Botora que le profil apparaît comme connecté avant de continuer.'],
  ['02', 'Configurez votre agent IA', 'Décrivez votre activité, vos consignes et le ton à employer. Choisissez sa personnalité et réglez le délai de regroupement des messages. L’agent ne répond automatiquement que si vous activez cette fonction.'],
  ['03', 'Ajoutez vos informations métier', 'Renseignez les informations utiles, préparez votre FAQ et ajoutez au besoin des documents PDF, DOCX, TXT, CSV ou XLSX. Relisez le texte extrait et validez-le : seuls les documents validés sont utilisés par l’agent.'],
  ['04', 'Traitez vos conversations', 'Retrouvez les échanges dans Discussions, répondez vous-même ou utilisez les outils disponibles, comme les réponses rapides et les tags, pour organiser le suivi de vos contacts.'],
  ['05', 'Suivez votre activité', 'Selon les fonctions disponibles dans votre espace, consultez vos statistiques et alertes, ou préparez une campagne. Vous gardez la main sur les fonctions activées et les actions envoyées.'],
];

export function AboutPage({ onBack }) {
  return <InfoLayout
    eyebrow="L’univers Botora"
    title="À propos de Botora"
    intro="Botora réunit vos conversations WhatsApp, vos outils de suivi et un agent IA configurable dans un seul espace. Vous pouvez organiser vos échanges et automatiser certaines réponses, tout en gardant la maîtrise de votre façon de travailler."
    onBack={onBack}
  >
    <div className="info-about-grid info-about-grid-three">
      <article className="info-highlight"><span className="info-symbol"><FontAwesomeIcon icon={faComments} aria-hidden="true" /></span><h2>Vos échanges au même endroit</h2><p>Retrouvez les conversations liées à votre profil WhatsApp et les outils qui facilitent leur suivi, comme les réponses rapides et les tags.</p></article>
      <article className="info-highlight"><span className="info-symbol"><FontAwesomeIcon icon={faRobot} aria-hidden="true" /></span><h2>Une IA adaptée à votre activité</h2><p>Configurez le comportement de l’agent et les informations sur lesquelles il peut s’appuyer, notamment votre FAQ et vos documents de référence validés.</p></article>
      <article className="info-highlight"><span className="info-symbol"><FontAwesomeIcon icon={faHeart} aria-hidden="true" /></span><h2>Vous gardez la maîtrise</h2><p>Activez les fonctions selon vos besoins, relisez les textes extraits avant de les confier à l’agent et intervenez dans les échanges lorsque vous le souhaitez.</p></article>
    </div>
    <div className="info-quote">« L’objectif de Botora : vous aider à suivre vos échanges et à répondre avec plus de régularité, sans perdre le contrôle de la relation client. »</div>
    <div className="info-about-grid">
      <article className="info-highlight"><span className="info-symbol"><FontAwesomeIcon icon={faCheck} aria-hidden="true" /></span><h2>Des outils pour votre quotidien</h2><p>Gérez vos discussions, préparez des réponses, organisez vos contacts et, si ces fonctions sont disponibles dans votre espace, suivez vos statistiques ou créez des campagnes.</p></article>
      <article className="info-highlight"><span className="info-symbol"><FontAwesomeIcon icon={faGear} aria-hidden="true" /></span><h2>Un fonctionnement configurable</h2><p>Choisissez les fonctions à activer et ajustez les consignes, les informations et le délai de réponse de l’agent depuis les réglages de Botora.</p></article>
    </div>
  </InfoLayout>;
}

export function HowItWorksPage({ onBack }) {
  return <InfoLayout
    eyebrow="Guide de démarrage"
    title="Comment ça marche ?"
    intro="Suivez ces étapes pour connecter WhatsApp, préparer votre agent et organiser vos échanges. Vous pouvez commencer avec les fonctions essentielles et configurer le reste plus tard."
    onBack={onBack}
  >
    <div className="info-steps">{steps.map(([number, title, text]) => <article className="info-step" key={number}><span className="info-step-number">{number}</span><div><h2>{title}</h2><p>{text}</p></div></article>)}</div>
    <div className="info-about-grid">
      <article className="info-highlight">
        <span className="info-symbol"><FontAwesomeIcon icon={faBookOpen} aria-hidden="true" /></span>
        <h2>Documents de référence : relecture avant utilisation</h2>
        <p>Vous pouvez ajouter jusqu’à 20 documents PDF, DOCX, TXT, CSV ou XLSX, de 10 Mo maximum chacun. Botora en extrait le texte pour vous permettre de le corriger et de le valider. Les PDF scannés sans texte sélectionnable ne sont pas pris en charge. Le texte validé est limité à 200 000 caractères cumulés par profil.</p>
      </article>
      <article className="info-highlight">
        <span className="info-symbol"><FontAwesomeIcon icon={faPlug} aria-hidden="true" /></span>
        <h2>Pourquoi certaines anciennes discussions n’apparaissent pas ?</h2>
        <p>Botora ne charge pas automatiquement tout l’historique WhatsApp à la connexion. Les discussions et messages déjà présents sur le téléphone peuvent donc ne pas apparaître immédiatement dans Botora.</p>
      </article>
    </div>
    <div className="info-tip"><strong>Délai de regroupement</strong><span>Par défaut, Botora attend 15 secondes après le dernier message reçu avant de générer une réponse. Vous pouvez modifier ce délai dans les réglages de l’agent, de 1 seconde à 5 minutes.</span></div>
    <div className="info-tip"><strong>Réponses automatiques</strong><span>La connexion de WhatsApp ne suffit pas à activer les réponses de l’agent. Activez l’option Agent IA et configurez son comportement. La réponse automatique aux médias et celle dans les groupes disposent également de leurs propres réglages.</span></div>
    <div className="info-tip"><strong>Fichiers et stockage</strong><span>Les fichiers et stickers reçus sont enregistrés sur le disque de l’appareil qui héberge Botora et restent consultables dans la discussion même après leur récupération depuis WhatsApp. Vous pouvez les supprimer dans Données &amp; stockage. Si le disque approche de sa limite de sécurité, Botora peut supprimer automatiquement les médias les plus anciens. Botora n’enregistre pas les médias que WhatsApp signale comme à vue unique ou éphémères. Par défaut, la réception d’un fichier place aussi la discussion en mode Humain afin qu’un opérateur puisse la traiter.</span></div>
    <div className="info-tip"><strong>Messages de groupe</strong><span>Par défaut, l’agent IA n’envoie pas de réponse automatique dans les groupes. Vous pouvez autoriser cette fonction dans les réglages de l’agent.</span></div>
    <div className="info-tip"><strong>Fichiers reçus dans les discussions</strong><span>Les fichiers et stickers reçus sont enregistrés sur le disque de l’appareil qui héberge Botora et consultables dans la discussion. Vous pouvez les supprimer dans Données &amp; stockage. Si l’espace disque approche de sa limite de sécurité, les médias les plus anciens peuvent être supprimés automatiquement. Les médias à vue unique ou éphémères ne sont pas enregistrés.</span></div>
    <div className="info-highlight info-final-card"><span className="info-symbol"><FontAwesomeIcon icon={faArrowRight} aria-hidden="true" /></span><h2>Commencez simplement</h2><p>Connectez votre WhatsApp, renseignez les informations essentielles de votre activité et testez votre configuration. Ajoutez ensuite une FAQ ou des documents, puis activez seulement les options dont vous avez besoin.</p></div>
  </InfoLayout>;
}

function InfoLayout({ eyebrow, title, intro, onBack, children }) {
  return <section className="info-page"><div className="info-page-inner"><button className="info-back" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" /> Retour au tableau de bord</button><header className="info-hero"><span className="info-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{intro}</p></header><div className="info-content">{children}</div></div></section>;
}
