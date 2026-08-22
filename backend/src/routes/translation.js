import express from 'express';
import { translateText, isTranslationSupported, SUPPORTED_LANGUAGES } from '../chat/translate.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Exposes the same translation service layer chatSocket.js and
// omnichannelController.js use internally, for any other part of the
// platform that needs on-demand translation — e.g. a buyer viewing a
// Chinese supplier's product description or Jedida Wanted quote message
// in their own language.
router.get('/languages', requireAuth, (req, res) => {
  res.json({ languages: SUPPORTED_LANGUAGES });
});

router.post('/', requireAuth, async (req, res) => {
  const { text, targetLanguage, sourceLanguage } = req.body;
  if (!text || !targetLanguage) return res.status(400).json({ error: 'text and targetLanguage are required.' });
  if (!isTranslationSupported(targetLanguage)) {
    return res.status(400).json({ error: `${targetLanguage} is not currently supported for translation.`, supportedLanguages: Object.keys(SUPPORTED_LANGUAGES).filter((k) => SUPPORTED_LANGUAGES[k].supported) });
  }
  const result = await translateText(text, targetLanguage, sourceLanguage || 'auto');
  return res.json(result);
});

export default router;
