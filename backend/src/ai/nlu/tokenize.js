// Text utilities for the local (no-API, no-LLM) NLU pipeline.
//
// Everything here runs in-process, synchronously, with no network call and
// no model weights to load — a lightweight stemmer, a Levenshtein-distance
// fuzzy matcher (for typo tolerance), and a stopword filter. This is what
// "understand spelling mistakes" and "understand different writing styles"
// mean when there's no LLM to lean on: normalize aggressively before
// comparing, rather than requiring an exact phrase.

export const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'am', 'be', 'been', 'being',
  'do', 'does', 'did', 'doing', 'can', 'could', 'would', 'should', 'will',
  'shall', 'may', 'might', 'must', 'i', 'you', 'he', 'she', 'it', 'we',
  'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'him',
  'us', 'them', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with', 'about',
  'against', 'between', 'into', 'through', 'and', 'or', 'but', 'if', 'so',
  'this', 'that', 'these', 'those', 'there', 'here', 'how', 'what', 'when',
  'where', 'why', 'who', 'which', 'have', 'has', 'had', 'not', 'no', 'yes',
  'please', 'just', 'really', 'very', 'get', 'got', 'like',
]);

// Deliberately tiny, rule-based suffix stripper — not a real stemmer
// (no Porter algorithm), just enough to fold "tracking/tracked/tracks"
// and "returns/returning" onto a shared root so paraphrases with
// different verb forms still match the same intent.
export function stem(word) {
  let w = word;
  if (w.length > 6 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 5 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 5 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

export function tokenize(text, { dropStopwords = true } = {}) {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(stem);
  return dropStopwords ? words.filter((w) => !STOPWORDS.has(w) && w.length > 1) : words;
}

// Restricted Damerau-Levenshtein (a.k.a. "optimal string alignment")
// distance — used only for short-token typo correction against a known
// vocabulary, so O(n*m) per pair is fine at chat-message scale (never run
// against a large corpus, only single-word comparisons). Plain Levenshtein
// charges 2 edits for an adjacent-letter swap ("odrer" -> "order" is a
// transposition of 'd'/'r'), which was pushing common fat-finger typos
// outside the correction budget; counting a transposition as 1 edit fixes
// that without loosening the budget for genuine substitution errors
// (which is what keeps unrelated short words like "thing" from getting
// corrected into "thank").
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d = [];
  for (let i = 0; i <= a.length; i++) d.push(new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// Given a token that doesn't appear in the known vocabulary, find the
// closest vocabulary word within a small edit-distance budget (scaled to
// word length so short words don't over-correct). Returns the token
// unchanged if nothing is close enough — better to leave an unknown word
// alone than to silently mangle it into the wrong term.
export function correctToken(token, vocabularySet) {
  if (vocabularySet.has(token) || token.length < 3) return token;
  // Conservative on purpose: a 2-edit budget on a mid-length word can walk
  // an unrelated word into the wrong vocabulary term (e.g. "thing" -> a
  // 2-edit hop to "thank"), which is worse than leaving it uncorrected —
  // an uncorrected token just contributes nothing to the score, a
  // wrongly-corrected one actively drags the match toward the wrong intent.
  const budget = token.length <= 6 ? 1 : 2;
  let best = null;
  let bestDist = budget + 1;
  for (const known of vocabularySet) {
    if (Math.abs(known.length - token.length) > budget) continue;
    const dist = levenshtein(token, known);
    if (dist < bestDist) {
      bestDist = dist;
      best = known;
      if (dist === 0) break;
    }
  }
  return bestDist <= budget ? best : token;
}
