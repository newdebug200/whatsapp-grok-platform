# API d’envoi Botora

## Authentification

Les clés actives sont gérées et validées par **WhatsApp Cloud Platform**, car c’est cette plateforme qui possède le profil WhatsApp connecté et exécute l’envoi. Botora Admin reçoit uniquement l’historique administratif (nom, préfixe, compte, dates et statut) ; la clé complète et son hash ne sont jamais transmis ni affichés dans le back-office.

Créez une clé dans **Accès API**. La valeur complète de la clé est affichée une seule fois. Envoyez-la avec l’un des deux formats suivants :

```http
X-API-Key: btr_live_votre_cle
```

ou :

```http
Authorization: Bearer btr_live_votre_cle
```

L’API utilise le profil WhatsApp connecté au compte. Pour choisir un profil précis lorsqu’un compte en possède plusieurs, ajoutez `profile_id`.

## Message unique

```http
POST /api/v1/messages/send
Content-Type: application/json
X-API-Key: btr_live_votre_cle
```

```json
{
  "to": "229XXXXXXXX",
  "message": "Bonjour depuis mon application",
  "profile_id": 12
}
```

`to` accepte un numéro international ou un identifiant WhatsApp en `@c.us`/`@g.us`. `message` est optionnel uniquement si un média est fourni.

## Média optionnel

```json
{
  "to": "229XXXXXXXX",
  "message": "Voici le document",
  "media": {
    "data": "BASE64_SANS_PREFIXE_OU_DATA_URI",
    "mimeType": "application/pdf",
    "filename": "document.pdf"
  }
}
```

La taille maximale est de 7 Mo. Pour une note vocale, utilisez `voice: true` avec un média audio.

## Envoi en lot

```http
POST /api/v1/messages/send-batch
Content-Type: application/json
X-API-Key: btr_live_votre_cle
```

```json
{
  "messages": [
    { "to": "229XXXXXXXX", "message": "Premier message" },
    { "to": "229YYYYYYYY", "message": "Deuxième message", "profile_id": 12 }
  ]
}
```

Un lot peut contenir jusqu’à 100 messages. Les messages sont envoyés séquentiellement afin de limiter les erreurs côté WhatsApp. La réponse comporte `completed`, `partial` ou `failed`, ainsi que le statut de chaque élément.

## Réponses

Une réponse unitaire réussie contient `ok: true`, `status: "sent"`, `message_id`, `recipient` et `profile_id`. Une réponse en lot contient `total`, `sent`, `failed` et `results`. Un compte sans essai actif ou abonnement actif reçoit `403 SUBSCRIPTION_REQUIRED`; une clé révoquée reçoit `401 API_KEY_INVALID`.
