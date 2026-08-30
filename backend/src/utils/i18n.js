const SUPPORTED_LANGUAGES = ['fr', 'en'];

const messages = {
  'Compte introuvable': { fr: 'Compte introuvable', en: 'Account not found' },
  'Profil non spécifié (header X-Profile-Id manquant)': { fr: 'Profil non spécifié (header X-Profile-Id manquant)', en: 'Profile not specified (X-Profile-Id header missing)' },
  'Profil introuvable ou non autorisé': { fr: 'Profil introuvable ou non autorisé', en: 'Profile not found or unauthorized' },
  'Non autorisé - token manquant': { fr: 'Non autorisé - token manquant', en: 'Unauthorized - missing token' },
  'Token invalide ou expiré': { fr: 'Token invalide ou expiré', en: 'Invalid or expired token' },
  'Erreur vérification profil': { fr: 'Erreur vérification profil', en: 'Profile verification error' },
  'Erreur lors de la récupération du compte': { fr: 'Erreur lors de la récupération du compte', en: 'Error retrieving account' },
  'Contact introuvable': { fr: 'Contact introuvable', en: 'Contact not found' },
  'Contact sans ID WhatsApp': { fr: 'Contact sans ID WhatsApp', en: 'Contact has no WhatsApp ID' },
  'WhatsApp non connecté': { fr: 'WhatsApp non connecté', en: 'WhatsApp is not connected' },
  'Erreur lors du chargement des conversations': { fr: 'Erreur lors du chargement des conversations', en: 'Error loading conversations' },
  'Nom de fichier invalide': { fr: 'Nom de fichier invalide', en: 'Invalid file name' },
  'Fichier introuvable': { fr: 'Fichier introuvable', en: 'File not found' },
  'Erreur lors du chargement des contacts': { fr: 'Erreur lors du chargement des contacts', en: 'Error loading contacts' },
  'Erreur lors du changement de favori': { fr: 'Erreur lors du changement de favori', en: 'Error changing favorite status' },
  'Erreur archivage': { fr: 'Erreur archivage', en: 'Error archiving conversation' },
  'Erreur désarchivage': { fr: 'Erreur désarchivage', en: 'Error unarchiving conversation' },
  'Erreur lors du chargement des messages': { fr: 'Erreur lors du chargement des messages', en: 'Error loading messages' },
  'Erreur lors de l’envoi du message': { fr: 'Erreur lors de l’envoi du message', en: 'Error sending message' },
  "Erreur lors de l'envoi du message": { fr: "Erreur lors de l'envoi du message", en: 'Error sending message' },
  'Erreur lors de l’envoi du fichier': { fr: 'Erreur lors de l’envoi du fichier', en: 'Error sending file' },
  "Erreur lors de l'envoi du fichier": { fr: "Erreur lors de l'envoi du fichier", en: 'Error sending file' },
  'Erreur lors du marquage comme lu': { fr: 'Erreur lors du marquage comme lu', en: 'Error marking conversation as read' },
  'Erreur lors de la recherche': { fr: 'Erreur lors de la recherche', en: 'Search error' },
  'Mot-clé trop court': { fr: 'Mot-clé trop court', en: 'Search term is too short' },
  'Email et mot de passe requis': { fr: 'Email et mot de passe requis', en: 'Email and password are required' },
  'Email requis': { fr: 'Email requis', en: 'Email is required' },
  'Cet email est déjà utilisé': { fr: 'Cet email est déjà utilisé', en: 'This email is already in use' },
  "Format d'email invalide": { fr: "Format d'email invalide", en: 'Invalid email format' },
  'Email ou mot de passe incorrect': { fr: 'Email ou mot de passe incorrect', en: 'Incorrect email or password' },
  'Le mot de passe doit contenir au moins 8 caractères': { fr: 'Le mot de passe doit contenir au moins 8 caractères', en: 'Password must contain at least 8 characters' },
  'Mot de passe requis': { fr: 'Mot de passe requis', en: 'Password is required' },
  'Mot de passe incorrect': { fr: 'Mot de passe incorrect', en: 'Incorrect password' },
  'Email ou mot de passe incorrect': { fr: 'Email ou mot de passe incorrect', en: 'Incorrect email or password' },
  'Compte bloqué.': { fr: 'Compte bloqué.', en: 'Account blocked.' },
  'Erreur lors de la connexion': { fr: 'Erreur lors de la connexion', en: 'Login error' },
  'Erreur lors de l’inscription': { fr: "Erreur lors de l'inscription", en: 'Registration error' },
  "Erreur lors de l'inscription": { fr: "Erreur lors de l'inscription", en: 'Registration error' },
  'Langue non prise en charge': { fr: 'Langue non prise en charge', en: 'Unsupported language' },
  'Langue mise à jour': { fr: 'Langue mise à jour', en: 'Language updated' },
  'Erreur lors de la mise à jour de la langue': { fr: 'Erreur lors de la mise à jour de la langue', en: 'Error updating language' },
  'Initialisation WhatsApp en cours...': { fr: 'Initialisation WhatsApp en cours...', en: 'WhatsApp initialization in progress...' },
  'profileId requis': { fr: 'profileId requis', en: 'profileId is required' },
  'Erreur lors de la déconnexion WhatsApp': { fr: 'Erreur lors de la déconnexion WhatsApp', en: 'Error disconnecting WhatsApp' },
  'Erreur lors de l’archivage': { fr: 'Erreur lors de l’archivage', en: 'Error archiving conversation' },
  'Erreur lors du désarchivage': { fr: 'Erreur lors du désarchivage', en: 'Error unarchiving conversation' },
  'contactId et message requis': { fr: 'contactId et message requis', en: 'contactId and message are required' },
  'Erreur lors du changement de statut IA': { fr: 'Erreur lors du changement de statut IA', en: 'Error changing AI status' },
  'Erreur lors du chargement des notes': { fr: 'Erreur lors du chargement des notes', en: 'Error loading notes' },
  'Erreur lors de la sauvegarde des notes': { fr: 'Erreur lors de la sauvegarde des notes', en: 'Error saving notes' },
  'Erreur lors du chargement de la mémoire': { fr: 'Erreur lors du chargement de la mémoire', en: 'Error loading memory' },
  'contactId, mimeType et data requis': { fr: 'contactId, mimeType et data requis', en: 'contactId, mimeType and data are required' },
  'Erreur lors de la suppression de la mémoire': { fr: 'Erreur lors de la suppression de la mémoire', en: 'Error deleting memory' }
};

function normalizeLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language) ? language : 'fr';
}

function translate(message, language = 'fr') {
  const entry = messages[message];
  return entry ? entry[normalizeLanguage(language)] : message;
}

async function getAccountLanguage(prisma, accountId) {
  if (!accountId) return 'fr';
  try {
    const account = await prisma.account.findUnique({ where: { id: accountId }, select: { language: true } });
    return normalizeLanguage(account?.language);
  } catch (_) {
    return 'fr';
  }
}

function localizedError(res, message, language = 'fr', status = 500) {
  return res.status(status).json({ error: translate(message, language) });
}

module.exports = { SUPPORTED_LANGUAGES, normalizeLanguage, translate, getAccountLanguage, localizedError };
