const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use(profileMiddleware);

function isUnknownFieldError(err) {
  return err?.constructor?.name === 'PrismaClientValidationError' && err.message.includes('Unknown argument');
}

router.get('/bot', async (req, res) => {
  try {
    let config = await prisma.botConfig.findUnique({ where: { profile_id: req.profileId } });
    if (!config) {
      config = await prisma.botConfig.create({
        data: {
          profile_id: req.profileId,
          bot_name: 'Botora',
          bot_info: '',
          bot_behavior: '',
          ia_enabled: true,
          response_delay_seconds: 5,
          business_hours_enabled: false,
          open_days: '1,2,3,4,5',
          open_time: '09:00',
          close_time: '18:00',
          timezone: 'UTC',
          away_message: '',
          away_once_per_session: true,
          personality: 'professional',
          system_prompt_override: null,
          sentiment_alert: true
        }
      });
    }
    res.json(config);
  } catch (error) {
    console.error('Erreur GET bot config:', error);
    res.status(500).json({ error: 'Erreur lors du chargement de la configuration' });
  }
});

router.put('/bot', async (req, res) => {
  try {
    const {
      bot_name, bot_info, bot_behavior, ia_enabled, response_delay_seconds,
      business_hours_enabled, open_days, open_time, close_time, timezone,
      away_message, away_once_per_session,
      personality, system_prompt_override, sentiment_alert, media_auto_reply
    } = req.body;

    const delaySeconds = response_delay_seconds !== undefined
      ? Math.max(1, Math.min(300, parseInt(response_delay_seconds) || 5))
      : undefined;

    const VALID_PERSONALITIES = ['professional', 'friendly', 'commercial', 'support'];

    const data = {
      ...(bot_name !== undefined && { bot_name }),
      ...(bot_info !== undefined && { bot_info }),
      ...(bot_behavior !== undefined && { bot_behavior }),
      ...(ia_enabled !== undefined && { ia_enabled }),
      ...(delaySeconds !== undefined && { response_delay_seconds: delaySeconds }),
      ...(business_hours_enabled !== undefined && { business_hours_enabled }),
      ...(open_days !== undefined && { open_days }),
      ...(open_time !== undefined && { open_time }),
      ...(close_time !== undefined && { close_time }),
      ...(timezone !== undefined && { timezone }),
      ...(away_message !== undefined && { away_message }),
      ...(away_once_per_session !== undefined && { away_once_per_session }),
      ...(personality !== undefined && VALID_PERSONALITIES.includes(personality) && { personality }),
      ...(system_prompt_override !== undefined && { system_prompt_override: system_prompt_override || null }),
      ...(sentiment_alert !== undefined && { sentiment_alert }),
      ...(media_auto_reply !== undefined && { media_auto_reply })
    };

    let config;
    try {
      config = await prisma.botConfig.upsert({
        where: { profile_id: req.profileId },
        create: {
          profile_id: req.profileId,
          bot_name: bot_name || 'Botora',
          bot_info: bot_info || '',
          bot_behavior: bot_behavior || '',
          ia_enabled: ia_enabled !== undefined ? ia_enabled : true,
          response_delay_seconds: delaySeconds ?? 5,
          business_hours_enabled: business_hours_enabled ?? false,
          open_days: open_days || '1,2,3,4,5',
          open_time: open_time || '09:00',
          close_time: close_time || '18:00',
          timezone: timezone || 'UTC',
          away_message: away_message || '',
          away_once_per_session: away_once_per_session ?? true,
          personality: personality || 'professional',
          system_prompt_override: system_prompt_override || null,
          sentiment_alert: sentiment_alert ?? true,
          media_auto_reply: media_auto_reply ?? true
        },
        update: data
      });
    } catch (err) {
      if (isUnknownFieldError(err)) {
        // Fallback without new fields for old DB
        const safeData = { ...data };
        delete safeData.personality;
        delete safeData.system_prompt_override;
        delete safeData.sentiment_alert;
        config = await prisma.botConfig.upsert({
          where: { profile_id: req.profileId },
          create: { profile_id: req.profileId, bot_name: bot_name || 'Botora', bot_info: bot_info || '', bot_behavior: bot_behavior || '', ia_enabled: true, response_delay_seconds: 5 },
          update: safeData
        });
      } else throw err;
    }

    res.json(config);
  } catch (error) {
    console.error('Erreur PUT bot config:', error);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde de la configuration' });
  }
});

module.exports = router;
