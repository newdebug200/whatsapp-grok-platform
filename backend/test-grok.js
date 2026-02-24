const axios = require('axios');
require('dotenv').config();

async function testGroq() {
    try {
        console.log('Test de connexion à Groq...');
        console.log('Clé API:', process.env.GROK_API_KEY ? 'Présente' : 'Manquante');
        
        // URL correcte pour Groq
        const url = 'https://api.groq.com/openai/v1/chat/completions';
        
        console.log('URL:', url);
        
        const response = await axios.post(url, {
            model: 'llama-3.3-70b-versatile',  // Modèle Groq populaire
            messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Dis bonjour en français' }
            ],
            temperature: 0.7,
            max_tokens: 100
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        console.log('✅ Succès!');
        console.log('Réponse:', response.data.choices[0].message.content);
        
    } catch (error) {
        console.error('❌ Erreur détaillée:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('Pas de réponse reçue');
            console.error('URL testée:', url);
        } else {
            console.error('Erreur:', error.message);
        }
    }
}

testGroq();