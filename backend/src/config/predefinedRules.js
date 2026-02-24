module.exports = [
  {
    triggers: ['bonjour', 'salut', 'hello', 'bonsoir'],
    response: "Bonjour ! Comment puis-je vous aider avec Dressur aujourd'hui ?"
  },
  {
    triggers: ['merci', 'thanks', 'thank you'],
    response: "Avec plaisir ! N'hésitez pas si vous avez d'autres questions sur Dressur."
  },
  {
    triggers: ['prix', 'tarif', 'combien', 'coût'],
    response: "Dressur propose différentes formules adaptées à vos besoins. Je peux vous expliquer en détail nos services si vous le souhaitez !"
  },
  {
    triggers: ['contact', 'téléphone', 'email'],
    response: "Vous pouvez nous contacter par email à contact@dressur.com ou par téléphone au +33 X XX XX XX XX. Souhaitez-vous plus d'informations sur nos services ?"
  }
];