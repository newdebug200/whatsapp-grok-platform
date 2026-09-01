import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const LANGUAGE_KEY = 'botora-language';
const SUPPORTED_LANGUAGES = ['fr', 'en'];

const translations = {
  fr: {
    'Dashboard': 'Tableau de bord', 'Conversations': 'Discussions', 'Campaigns': 'Campagnes', 'Credits': 'Crédits',
    'Recharge credits': 'Recharger les crédits', 'Statistics': 'Statistiques', 'Customer sentiment': 'Sentiments clients',
    'Funnel': 'Entonnoir', 'Subscriptions': 'Abonnements', 'Settings': 'Paramètres', 'Administration': 'Administration',
    'Control center': 'Centre de contrôle', 'Account': 'Mon compte', 'Logout': 'Déconnexion', 'Search': 'Recherche',
    'Search a contact or message…': 'Rechercher un contact, un message…', 'No results': 'Aucun résultat',
    'Navigation': 'Navigation', 'Communication': 'Communication', 'Analysis & monitoring': 'Analyse et suivi', 'Credits & subscriptions': 'Crédits et abonnements', 'Integrations': 'Intégrations', 'Profile': 'Profil', 'WhatsApp connected': 'WhatsApp connecté', 'WhatsApp disconnected': 'WhatsApp non connecté',
    'Discussions': 'Discussions', 'All': 'Toutes', 'Unread': 'Non lues', 'Favorites': 'Favoris', 'Groups': 'Groupes', 'Archived': 'Archivées',
    'No unread messages': 'Aucun message non lu', 'No favorites — right-click a conversation to add one': 'Aucun favori — clic droit sur une discussion pour en ajouter',
    'No groups': 'Aucun groupe', 'No archived conversations': 'Aucune discussion archivée', 'No results found': 'Aucun résultat', 'No conversations': 'Aucune conversation',
    'Connect WhatsApp': 'Connecter WhatsApp', 'WhatsApp not connected': 'WhatsApp non connecté', 'Connect': 'Connecter',
    'Active AI': 'IA active', 'Human': 'Humain', 'Notes': 'Notes', 'Archived conversation': 'Discussion archivée',
    'Settings bot': 'Réglages bot', 'Quick replies': 'Réponses rapides', 'Alerts': 'Alertes', 'Data & storage': 'Données & stockage',
    'My account': 'Mon compte', 'Appearance': 'Apparence', 'Theme': 'Thème', 'Light mode enabled': 'Mode clair activé', 'Dark mode enabled': 'Mode sombre activé',
    'Light': 'Clair', 'Dark': 'Sombre', 'Notifications': 'Notifications', 'Notification sound': 'Son de notification',
    'Play a sound for every received message': 'Joue un son à chaque message reçu', 'Browser notifications': 'Notifications navigateur',
    'Enabled — alerts even when tab is closed': 'Activées — alertes même onglet fermé', 'Blocked by browser': 'Bloquées par le navigateur',
    'Not requested': 'Non demandées', 'Enabled': 'Activé', 'Blocked': 'Bloqué', 'Allow': 'Autoriser', 'AI bot': 'Bot IA', 'Account details': 'Compte',
    'Language': 'Langue', 'Choose the platform language': 'Choisissez la langue de la plateforme', 'French': 'Français', 'English': 'English',
    'Language updated': 'Langue mise à jour', 'Delete account': 'Supprimer le compte', 'Sign out': 'Se déconnecter',
    'Delete your account?': 'Supprimer le compte ?', 'This action is irreversible.': 'Cette action est irréversible.',
    'Confirm with your password': 'Confirmez avec votre mot de passe', 'Your current password': 'Votre mot de passe actuel', 'Cancel': 'Annuler',
    'Delete permanently': 'Supprimer définitivement', 'Deleting...': 'Suppression...', 'Unknown contact': 'Contact inconnu',
    'Today': "Aujourd'hui", 'Yesterday': 'Hier', 'Photo': 'Photo', 'Video': 'Vidéo', 'Voice message': 'Message vocal', 'Audio': 'Audio', 'Sticker': 'Sticker', 'Document': 'Document',
    'No message': 'Aucun message', 'No messages in this conversation': 'Aucun message dans cette conversation', 'Select a conversation to view messages': 'Sélectionnez une discussion pour afficher les messages', 'Connect WhatsApp from the left panel to receive messages': 'Connectez votre WhatsApp depuis le panneau gauche pour recevoir des messages', 'Internal notes': 'Notes internes', 'never sent to the customer': 'jamais envoyées au client', 'Internal notes (never sent to the customer)': 'Notes internes (jamais envoyées au client)', 'Example: VIP, call back on June 15, difficult customer…': 'Ex : VIP, Rappeler le 15 juin, Cliente difficile…', 'Back': 'Retour', 'Close': 'Fermer', 'Actions': 'Actions', 'Emojis': 'Emojis', 'Attach a file': 'Joindre un fichier', 'Send (Enter)': 'Envoyer (Entrée)', 'Older conversations': 'Discussions plus anciennes', 'Search a conversation...': 'Rechercher une discussion...', 'Send': 'Envoyer', 'Type a message…': 'Écrire un message…', 'Download': 'Télécharger', 'Search…': 'Recherche…',
    'Checking central server…': 'Vérification du serveur central…', 'Central API connected.': 'API centrale connectée.', 'The central server is unavailable. Please try again later.': 'Le serveur central est indisponible. Réessayez plus tard.', 'Main navigation': 'Navigation principale',
    'SMART PLATFORM': 'PLATEFORME INTELLIGENTE', 'Please log in to view subscriptions.': 'Connectez-vous pour consulter les abonnements.', 'The annual offer is not available right now.': "L’offre annuelle n’est pas disponible pour le moment.", 'Payment page opened. Complete the payment, then click Verify payment.': 'La page de paiement est ouverte. Terminez le paiement puis cliquez sur Vérifier le paiement.', 'Unable to create the subscription payment.': 'Impossible de créer le paiement de l’abonnement.', 'Subscription activated for one year.': 'Abonnement activé pour un an.', 'Payment is not approved yet.': 'Le paiement n’est pas encore approuvé.', 'Subscription payment verification is temporarily unavailable.': 'La vérification du paiement d’abonnement est temporairement indisponible.', 'Botora offer': 'Offre Botora', 'Annual subscription': 'Abonnement annuel', 'Use the full platform during your trial or with an active annual subscription.': 'Utilisez toute la plateforme pendant votre essai ou avec un abonnement annuel actif.', 'Free trial active': 'Essai gratuit actif', 'Annual subscription active': 'Abonnement annuel actif', 'Subscription required': 'Abonnement requis', 'Access until': 'Accès jusqu’au', 'Your trial or subscription has ended. Subscribe to continue using the platform.': 'Votre essai ou votre abonnement est terminé. Abonnez-vous pour continuer à utiliser la plateforme.', 'A payment is awaiting confirmation.': 'Un paiement attend sa confirmation.', 'Verifying...': 'Vérification...', 'Verify payment': 'Vérifier le paiement', 'One year': 'Un an', 'One annual payment. Renewals extend access and never recreate the trial.': 'Un paiement annuel. Les renouvellements prolongent l’accès et ne recréent jamais l’essai.', 'days': 'jours', 'Unlimited access during the period': 'Accès illimité pendant la période', 'All enabled platform features': 'Toutes les fonctionnalités activées', 'Server-side access protection': 'Protection d’accès côté serveur', 'Credits remain separately consumable': 'Les crédits restent consommables séparément', 'Opening payment...': 'Ouverture du paiement...', 'Subscribe for one year': 'S’abonner pour un an', 'API access': 'Accès API', 'Developer access': 'Accès développeur', 'API keys': 'Clés API', 'Connect your applications to Botora and send WhatsApp messages through your connected profile.': 'Connectez vos applications à Botora et envoyez des messages WhatsApp via votre profil connecté.', 'Create an API key': 'Créer une clé API', 'Use a separate key for each application so you can revoke access independently.': 'Utilisez une clé différente par application afin de pouvoir révoquer les accès séparément.', 'Key name': 'Nom de la clé', 'Example: CRM production': 'Exemple : CRM production', 'Creating...': 'Création...', 'Create key': 'Créer la clé', 'Available endpoints': 'Endpoints disponibles', 'one message': 'un message', 'up to 100 messages': 'jusqu’à 100 messages', 'Authentication: X-API-Key header or Authorization: Bearer btr_...': 'Authentification : en-tête X-API-Key ou Authorization: Bearer btr_...', 'Copy this key now. It will not be displayed again.': 'Copiez cette clé maintenant. Elle ne sera plus affichée.', 'Copied': 'Copiée', 'Copy': 'Copier', 'Revoke this API key?': 'Révoquer cette clé API ?', 'Unable to load API keys.': 'Impossible de charger les clés API.', 'Unable to create the API key.': 'Impossible de créer la clé API.', 'Unable to revoke the API key.': 'Impossible de révoquer la clé API.', 'Revoked': 'Révoquée', 'Active': 'Active', 'No API key created yet.': 'Aucune clé API créée pour le moment.', 'Revoke': 'Révoquer', 'Quick example': 'Exemple rapide', 'For a file, add media: { data: base64, mimeType: image/png, filename: photo.png }. A caption is optional.': 'Pour un fichier, ajoutez media : { data: base64, mimeType: image/png, filename: photo.png }. Une légende est facultative.', 'The intelligence behind your WhatsApp conversations': 'L’intelligence de vos conversations WhatsApp', 'Welcome back': 'Ravi de vous revoir', 'Access your workspace.': 'Accédez à votre espace de travail.', 'Get started with Botora': 'Commencez avec Botora', 'Create your workspace in seconds.': 'Créez votre espace en quelques secondes.', 'Login': 'Connexion', 'Create an account': 'Créer un compte', 'Full name': 'Nom complet', 'Your name': 'Votre nom', 'Email address': 'Adresse email', 'Password': 'Mot de passe', 'Min. 8 characters': 'Min. 8 caractères', 'Loading...': 'Chargement...', 'Log in': 'Se connecter', 'Create my account': 'Créer mon compte', 'Your password must contain at least 8 characters.': 'Votre mot de passe doit contenir au moins 8 caractères.', 'The service is temporarily unavailable. Check your connection and try again.': 'Le service est temporairement indisponible. Vérifiez votre connexion puis réessayez.', 'The email or password is incorrect.': 'L’adresse email ou le mot de passe est incorrect.', 'We could not complete the request right now. Please try again shortly.': 'Nous n’avons pas pu terminer la demande. Réessayez dans quelques instants.', 'Something went wrong. Please try again.': 'Une erreur est survenue. Réessayez.', 'Your account is suspended. Contact support.': 'Votre compte est suspendu. Contactez le support.', 'This license has been banned. Contact support.': 'Cette licence a été bannie. Contactez le support.', 'Credit usage': 'Utilisation des crédits', 'Credit usage history': 'Historique d’utilisation des crédits', 'View how your credits are consumed by the platform.': 'Consultez la consommation de vos crédits par la plateforme.', 'Tokens used': 'Tokens utilisés', 'Credits consumed': 'Crédits consommés', 'Event': 'Événement', 'Conversion applied': 'Conversion appliquée', 'No credit usage recorded yet.': 'Aucune consommation de crédits enregistrée pour le moment.', 'Previous': 'Précédente', 'Next': 'Suivante', 'Rows per page': 'Lignes par page', 'Usage details': 'Détails de l’utilisation', 'Date': 'Date', 'View': 'Voir', 'Page': 'Page'
  },
  en: {
    'Dashboard': 'Dashboard', 'Conversations': 'Discussions', 'Campaigns': 'Campaigns', 'Credits': 'Credits',
    'Recharge credits': 'Recharge credits', 'Statistics': 'Statistics', 'Customer sentiment': 'Customer sentiment',
    'Funnel': 'Funnel', 'Subscriptions': 'Subscriptions', 'Settings': 'Settings', 'Administration': 'Administration',
    'Control center': 'Control center', 'Account': 'Account', 'Logout': 'Log out', 'Search': 'Search',
    'Search a contact or message…': 'Search a contact or message…', 'No results': 'No results',
    'Navigation': 'Navigation', 'Communication': 'Communication', 'Analysis & monitoring': 'Analysis & monitoring', 'Credits & subscriptions': 'Credits & subscriptions', 'Integrations': 'Integrations', 'Profile': 'Profile', 'WhatsApp connected': 'WhatsApp connected', 'WhatsApp disconnected': 'WhatsApp disconnected',
    'Discussions': 'Discussions', 'All': 'All', 'Unread': 'Unread', 'Favorites': 'Favorites', 'Groups': 'Groups', 'Archived': 'Archived',
    'No unread messages': 'No unread messages', 'No favorites — right-click a conversation to add one': 'No favorites — right-click a conversation to add one',
    'No groups': 'No groups', 'No archived conversations': 'No archived conversations', 'No results found': 'No results found', 'No conversations': 'No conversations',
    'Connect WhatsApp': 'Connect WhatsApp', 'WhatsApp not connected': 'WhatsApp not connected', 'Connect': 'Connect',
    'Active AI': 'AI active', 'Human': 'Human', 'Notes': 'Notes', 'Archived conversation': 'Archived conversation',
    'Settings bot': 'Bot settings', 'Quick replies': 'Quick replies', 'Alerts': 'Alerts', 'Data & storage': 'Data & storage',
    'My account': 'My account', 'Appearance': 'Appearance', 'Theme': 'Theme', 'Light mode enabled': 'Light mode enabled', 'Dark mode enabled': 'Dark mode enabled',
    'Light': 'Light', 'Dark': 'Dark', 'Notifications': 'Notifications', 'Notification sound': 'Notification sound',
    'Play a sound for every received message': 'Play a sound for every received message', 'Browser notifications': 'Browser notifications',
    'Enabled — alerts even when tab is closed': 'Enabled — alerts even when tab is closed', 'Blocked by browser': 'Blocked by browser',
    'Not requested': 'Not requested', 'Enabled': 'Enabled', 'Blocked': 'Blocked', 'Allow': 'Allow', 'AI bot': 'AI bot', 'Account details': 'Account',
    'Language': 'Language', 'Choose the platform language': 'Choose the platform language', 'French': 'Français', 'English': 'English',
    'Language updated': 'Language updated', 'Delete account': 'Delete account', 'Sign out': 'Sign out',
    'Delete your account?': 'Delete your account?', 'This action is irreversible.': 'This action is irreversible.',
    'Confirm with your password': 'Confirm with your password', 'Your current password': 'Your current password', 'Cancel': 'Cancel',
    'Delete permanently': 'Delete permanently', 'Deleting...': 'Deleting...', 'Unknown contact': 'Unknown contact',
    'Today': 'Today', 'Yesterday': 'Yesterday', 'Photo': 'Photo', 'Video': 'Video', 'Voice message': 'Voice message', 'Audio': 'Audio', 'Sticker': 'Sticker', 'Document': 'Document',
    'No message': 'No message', 'No messages in this conversation': 'No messages in this conversation', 'Select a conversation to view messages': 'Select a conversation to view messages', 'Connect WhatsApp from the left panel to receive messages': 'Connect WhatsApp from the left panel to receive messages', 'Internal notes': 'Internal notes', 'never sent to the customer': 'never sent to the customer', 'Internal notes (never sent to the customer)': 'Internal notes (never sent to the customer)', 'Example: VIP, call back on June 15, difficult customer…': 'Example: VIP, call back on June 15, difficult customer…', 'Back': 'Back', 'Close': 'Close', 'Actions': 'Actions', 'Emojis': 'Emojis', 'Attach a file': 'Attach a file', 'Send (Enter)': 'Send (Enter)', 'Older conversations': 'Older conversations', 'Search a conversation...': 'Search a conversation...', 'Send': 'Send', 'Type a message…': 'Type a message…', 'Download': 'Download', 'Search…': 'Search…',
    'Checking central server…': 'Checking central server…', 'Central API connected.': 'Central API connected.', 'The central server is unavailable. Please try again later.': 'The central server is unavailable. Please try again later.', 'Main navigation': 'Main navigation',
    'SMART PLATFORM': 'SMART PLATFORM', 'Please log in to view subscriptions.': 'Please log in to view subscriptions.', 'The annual offer is not available right now.': 'The annual offer is not available right now.', 'Payment page opened. Complete the payment, then click Verify payment.': 'The payment page is open. Complete the payment, then click Verify payment.', 'Unable to create the subscription payment.': 'Unable to create the subscription payment.', 'Subscription activated for one year.': 'Subscription activated for one year.', 'Payment is not approved yet.': 'Payment is not approved yet.', 'Subscription payment verification is temporarily unavailable.': 'Subscription payment verification is temporarily unavailable.', 'Botora offer': 'Botora offer', 'Annual subscription': 'Annual subscription', 'Use the full platform during your trial or with an active annual subscription.': 'Use the full platform during your trial or with an active annual subscription.', 'Free trial active': 'Free trial active', 'Annual subscription active': 'Annual subscription active', 'Subscription required': 'Subscription required', 'Access until': 'Access until', 'Your trial or subscription has ended. Subscribe to continue using the platform.': 'Your trial or subscription has ended. Subscribe to continue using the platform.', 'A payment is awaiting confirmation.': 'A payment is awaiting confirmation.', 'Verifying...': 'Verifying...', 'Verify payment': 'Verify payment', 'One year': 'One year', 'One annual payment. Renewals extend access and never recreate the trial.': 'One annual payment. Renewals extend access and never recreate the trial.', 'days': 'days', 'Unlimited access during the period': 'Unlimited access during the period', 'All enabled platform features': 'All enabled platform features', 'Server-side access protection': 'Server-side access protection', 'Credits remain separately consumable': 'Credits remain separately consumable', 'Opening payment...': 'Opening payment...', 'Subscribe for one year': 'Subscribe for one year', 'API access': 'API access', 'Developer access': 'Developer access', 'API keys': 'API keys', 'Connect your applications to Botora and send WhatsApp messages through your connected profile.': 'Connect your applications to Botora and send WhatsApp messages through your connected profile.', 'Create an API key': 'Create an API key', 'Use a separate key for each application so you can revoke access independently.': 'Use a separate key for each application so you can revoke access independently.', 'Key name': 'Key name', 'Example: CRM production': 'Example: CRM production', 'Creating...': 'Creating...', 'Create key': 'Create key', 'Available endpoints': 'Available endpoints', 'one message': 'one message', 'up to 100 messages': 'up to 100 messages', 'Authentication: X-API-Key header or Authorization: Bearer btr_...': 'Authentication: X-API-Key header or Authorization: Bearer btr_...', 'Copy this key now. It will not be displayed again.': 'Copy this key now. It will not be displayed again.', 'Copied': 'Copied', 'Copy': 'Copy', 'Revoke this API key?': 'Revoke this API key?', 'Unable to load API keys.': 'Unable to load API keys.', 'Unable to create the API key.': 'Unable to create the API key.', 'Unable to revoke the API key.': 'Unable to revoke the API key.', 'Revoked': 'Revoked', 'Active': 'Active', 'No API key created yet.': 'No API key created yet.', 'Revoke': 'Revoke', 'Quick example': 'Quick example', 'For a file, add media: { data: base64, mimeType: image/png, filename: photo.png }. A caption is optional.': 'For a file, add media: { data: base64, mimeType: image/png, filename: photo.png }. A caption is optional.', 'The intelligence behind your WhatsApp conversations': 'The intelligence behind your WhatsApp conversations', 'Welcome back': 'Welcome back', 'Access your workspace.': 'Access your workspace.', 'Get started with Botora': 'Get started with Botora', 'Create your workspace in seconds.': 'Create your workspace in seconds.', 'Login': 'Log in', 'Create an account': 'Create an account', 'Full name': 'Full name', 'Your name': 'Your name', 'Email address': 'Email address', 'Password': 'Password', 'Min. 8 characters': 'Min. 8 characters', 'Loading...': 'Loading...', 'Log in': 'Log in', 'Create my account': 'Create my account', 'Your password must contain at least 8 characters.': 'Your password must contain at least 8 characters.', 'The service is temporarily unavailable. Check your connection and try again.': 'The service is temporarily unavailable. Check your connection and try again.', 'The email or password is incorrect.': 'The email or password is incorrect.', 'We could not complete the request right now. Please try again shortly.': 'We could not complete the request right now. Please try again shortly.', 'Something went wrong. Please try again.': 'Something went wrong. Please try again.', 'Your account is suspended. Contact support.': 'Your account is suspended. Contact support.', 'This license has been banned. Contact support.': 'This license has been banned. Contact support.', 'Credit usage': 'Credit usage', 'Credit usage history': 'Credit usage history', 'View how your credits are consumed by the platform.': 'View how your credits are consumed by the platform.', 'Tokens used': 'Tokens used', 'Credits consumed': 'Credits consumed', 'Event': 'Event', 'Conversion applied': 'Conversion applied', 'No credit usage recorded yet.': 'No credit usage recorded yet.', 'Previous': 'Previous', 'Next': 'Next', 'Rows per page': 'Rows per page', 'Usage details': 'Usage details', 'Date': 'Date', 'View': 'View', 'Page': 'Page'
  }
};

const LanguageContext = createContext({ language: 'fr', setLanguage: async () => {}, t: key => key });

export function LanguageProvider({ children }) {
  const { account, token, refreshAccount } = useAuth();
  const [language, setLanguageState] = useState(() => {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    return SUPPORTED_LANGUAGES.includes(saved) ? saved : 'fr';
  });

  useEffect(() => {
    if (SUPPORTED_LANGUAGES.includes(account?.language)) setLanguageState(account.language);
  }, [account?.language]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback(async (nextLanguage) => {
    if (!SUPPORTED_LANGUAGES.includes(nextLanguage)) return;
    const previous = language;
    setLanguageState(nextLanguage);
    localStorage.setItem(LANGUAGE_KEY, nextLanguage);
    try {
      if (token) {
        await axios.post(`${API_URL}/auth/language`, { language: nextLanguage });
        await refreshAccount();
      }
    } catch (error) {
      setLanguageState(previous);
      localStorage.setItem(LANGUAGE_KEY, previous);
      throw error;
    }
  }, [language, token, refreshAccount]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t: (key) => translations[language]?.[key] || translations.fr[key] || key
  }), [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
