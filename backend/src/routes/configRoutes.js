const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET description Dressur
router.get('/dressur', async (req, res) => {
  try {
    console.log('Tentative de récupération de la configuration...');
    
    // Vérifier si la table existe et récupérer la config
    let config = await prisma.appConfig.findUnique({
      where: { id: 1 }
    });
    
    console.log('Config trouvée:', config);
    
    // Si aucune config n'existe, en créer une par défaut
    if (!config) {
      console.log('Aucune config trouvée, création...');
      config = await prisma.appConfig.create({
        data: { 
          id: 1,
          full_description: '' 
        }
      });
      console.log('Config créée:', config);
    }
    
    res.json({ description: config.full_description || '' });
  } catch (error) {
    console.error('Erreur détaillée GET config:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.stack 
    });
  }
});

// PUT mettre à jour description
router.put('/dressur', async (req, res) => {
  try {
    const { description } = req.body;
    console.log('Tentative de mise à jour avec description:', description);
    
    // Vérifier d'abord si la config existe
    let config = await prisma.appConfig.findUnique({
      where: { id: 1 }
    });
    
    console.log('Config existante:', config);
    
    if (config) {
      // Mise à jour
      config = await prisma.appConfig.update({
        where: { id: 1 },
        data: { full_description: description }
      });
      console.log('Config mise à jour:', config);
    } else {
      // Création
      config = await prisma.appConfig.create({
        data: { 
          id: 1,
          full_description: description 
        }
      });
      console.log('Config créée:', config);
    }
    
    res.json({ 
      success: true, 
      description: config.full_description,
      message: 'Description sauvegardée avec succès' 
    });
  } catch (error) {
    console.error('Erreur détaillée PUT config:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.stack 
    });
  }
});

module.exports = router;