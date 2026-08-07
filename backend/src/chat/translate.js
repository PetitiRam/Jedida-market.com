// Chat message translation via LibreTranslate (https://libretranslate.com or
// a self-hosted instance — set LIBRETRANSLATE_URL / LIBRETRANSLATE_API_KEY).
//
// No LLM fallback of any kind (see backend/src/ai/orchestrator.js for why
// the AI ecosystem runs on local logic / non-LLM APIs only). Honest
// limitation as a result: LibreTranslate is built on Argos Translate
// models, which cover major world languages — English, French, Swahili
// among them — but do NOT include Luganda or Lusoga, and there is no
// other non-LLM engine wired in for those two right now. Rather than
// silently mistranslating or quietly downgrading quality, lg/xog are
// marked unsupported until a real (non-LLM) engine covers them —
// Google Cloud Translation is the natural fit if/when that's wanted,
// since Google APIs are the one external-API exception already in use
// elsewhere in this pipeline for answering/research (see research.js).

const ENDPOINT = process.env.LIBRETRANSLATE_URL || 'https://libretranslate.com/translate';
const API_KEY = process.env.LIBRETRANSLATE_API_KEY || null;

// Maps the platform's language options to LibreTranslate/Argos language codes.
export const SUPPORTED_LANGUAGES = {
  en: { label: 'English', code: 'en', supported: true },
  fr: { label: 'French', code: 'fr', supported: true },
  sw: { label: 'Swahili', code: 'sw', supported: true },
  lg: { label: 'Luganda', code: null, supported: false },
  xog: { label: 'Lusoga', code: null, supported: false },
};

export function isTranslationSupported(langKey) {
  return !!SUPPORTED_LANGUAGES[langKey]?.supported;
}

// Returns { text, translated, engine?, reason?, note? }. Never throws — a
// translation failure should never break sending or displaying a message.
export async function translateText(text, targetLangKey, sourceLangKey = 'auto') {
  if (!text || !text.trim()) return { text, translated: false };

  const target = SUPPORTED_LANGUAGES[targetLangKey];
  if (!target) return { text, translated: false, reason: 'unknown_language' };

  if (!target.supported) {
    return { text, translated: false, reason: 'unsupported_language' };
  }

  const source = sourceLangKey === 'auto' ? 'auto' : (SUPPORTED_LANGUAGES[sourceLangKey]?.code || 'auto');

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source,
        target: target.code,
        format: 'text',
        ...(API_KEY ? { api_key: API_KEY } : {}),
      }),
    });

    if (!res.ok) throw new Error(`http_${res.status}`);

    const data = await res.json();
    if (!data?.translatedText) throw new Error('empty_response');

    return { text: data.translatedText, translated: true, engine: 'libretranslate' };
  } catch (err) {
    console.error('LibreTranslate error:', err.message);
    return { text, translated: false, reason: 'translation_unavailable' };
  }
}
