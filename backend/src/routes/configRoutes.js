const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET description Dressur
router.get('/dressur', async (req, res) => {
  try {
    console.log('Tentative de récupération de la configuration...');
    
    let config = await prisma.appConfig.findUnique({
      where: { id: 1 }
    });
    
    console.log('Config trouvée:', config);
    
    if (!config) {
      console.log('Aucune config trouvée, création...');
      config = await prisma.appConfig.create({
        data: { 
          id: 1,
          full_description: '',
          ia_enabled: true,
          whatsapp_confirm_enabled: true
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

// PUT mettre à jour description Dressur
router.put('/dressur', async (req, res) => {
  try {
    const { description } = req.body;
    console.log('Tentative de mise à jour avec description:', description);
    
    let config = await prisma.appConfig.findUnique({
      where: { id: 1 }
    });
    
    console.log('Config existante:', config);
    
    if (config) {
      config = await prisma.appConfig.update({
        where: { id: 1 },
        data: { full_description: description }
      });
      console.log('Config mise à jour:', config);
    } else {
      config = await prisma.appConfig.create({
        data: { 
          id: 1,
          full_description: description,
          ia_enabled: true,
          whatsapp_confirm_enabled: true
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

// NOUVELLE ROUTE : GET configuration du bot
router.get('/bot', async (req, res) => {
  try {
    let config = await prisma.appConfig.findUnique({
      where: { id: 1 }
    });
    
    if (!config) {
      config = await prisma.appConfig.create({
        data: { 
          id: 1,
          full_description: '',
          ia_enabled: true,
          whatsapp_confirm_enabled: true
        }
      });
    }
    
    res.json({
      ia_enabled: config.ia_enabled,
      whatsapp_confirm_enabled: config.whatsapp_confirm_enabled
    });
  } catch (error) {
    console.error('Erreur GET bot config:', error);
    res.status(500).json({ error: error.message });
  }
});

// NOUVELLE ROUTE : PUT configuration du bot
router.put('/bot', async (req, res) => {
  try {
    const { ia_enabled, whatsapp_confirm_enabled } = req.body;
    
    let config = await prisma.appConfig.findUnique({
      where: { id: 1 }
    });
    
    if (config) {
      config = await prisma.appConfig.update({
        where: { id: 1 },
        data: { 
          ia_enabled: ia_enabled,
          whatsapp_confirm_enabled: whatsapp_confirm_enabled
        }
      });
    } else {
      config = await prisma.appConfig.create({
        data: { 
          id: 1,
          full_description: '',
          ia_enabled: ia_enabled,
          whatsapp_confirm_enabled: whatsapp_confirm_enabled
        }
      });
    }
    
    res.json({
      success: true,
      ia_enabled: config.ia_enabled,
      whatsapp_confirm_enabled: config.whatsapp_confirm_enabled
    });
  } catch (error) {
    console.error('Erreur PUT bot config:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;