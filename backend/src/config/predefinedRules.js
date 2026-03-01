module.exports = [
  {
    triggers: [
      '^bonjour\\s*!?$',      // bonjour, bonjour!
      '^salut\\s*!?$',        // salut, salut!
      '^hello\\s*!?$',        // hello, hello!
      '^bonsoir\\s*!?$'       // bonsoir, bonsoir!
    ],
    response: "Bonjour ! Comment puis-je vous aider avec Dressur aujourd'hui ?"
  },
  {
    triggers: [
      '^merci\\s*!?$',
      '^thanks\\s*!?$',
      '^thank you\\s*!?$'
    ],
    response: "Avec plaisir ! N'hésitez pas si vous avez d'autres questions sur Dressur."
  }
];