// Local intent classifier: TF-IDF vectors over the example phrases in
// corpus.js, compared to the incoming message by cosine similarity. This
// is "real" statistical NLU in the sense that it generalizes past exact
// phrase matches (a message sharing enough weighted vocabulary with an
// intent's examples scores high even if it matches no single example
// word-for-word) — it's just classical IR math instead of a neural model,
// so it runs instantly, in-process, with nothing to call out to.
//
// "Training" here means building the TF-IDF index once at module load
// from the static corpus — there's no gradient descent, no weights file,
// nothing to keep in sync with a model version. Extending the corpus in
// corpus.js is the only way to make this smarter; there's no learning
// from live traffic here (see nlu docs in jedida_ai_architecture.md for
// why that's intentional — automatic learning from conversations was
// explicitly out of scope in the master prompt).

import { tokenize, correctToken } from './tokenize.js';
import { INTENTS, SHARED_INTENTS } from './corpus.js';

const CONFIDENCE_THRESHOLD = 0.12; // below this, treat as "not confident enough" rather than force a match

function buildIndex(intentDefs) {
  // docs: [{ intentId, tokens }]
  const docs = [];
  for (const intent of intentDefs) {
    for (const example of intent.examples) {
      docs.push({ intentId: intent.id, tokens: tokenize(example) });
    }
  }

  const vocabulary = new Set();
  for (const doc of docs) for (const t of doc.tokens) vocabulary.add(t);

  const df = new Map();
  for (const doc of docs) {
    const seen = new Set(doc.tokens);
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = docs.length;
  const idf = new Map();
  for (const [term, count] of df.entries()) idf.set(term, Math.log((N + 1) / (count + 1)) + 1);

  function vectorize(tokens) {
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    const vec = new Map();
    for (const [t, count] of tf.entries()) {
      const weight = (count / tokens.length) * (idf.get(t) || Math.log(N + 1) + 1);
      vec.set(t, weight);
    }
    return vec;
  }

  const docVectors = docs.map((doc) => ({ intentId: doc.intentId, vec: vectorize(doc.tokens) }));

  return { vocabulary, idf, vectorize, docVectors, N };
}

function cosineSim(vecA, vecB) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const [term, weight] of vecA.entries()) {
    magA += weight * weight;
    if (vecB.has(term)) dot += weight * vecB.get(term);
  }
  for (const weight of vecB.values()) magB += weight * weight;
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// One index per audience, built once at module load — cheap (a few dozen
// short phrases), so no need to lazy-build or cache beyond module scope.
const indexCache = {};
function getIndex(audience) {
  if (indexCache[audience]) return indexCache[audience];
  const audienceIntents = INTENTS[audience] || [];
  const shared = SHARED_INTENTS.filter((i) => i.audience === 'both' || i.audience === audience);
  const sharedAsIntents = shared.map((s) => ({ id: s.id, examples: s.examples }));
  const index = buildIndex([...audienceIntents, ...sharedAsIntents]);
  indexCache[audience] = index;
  return index;
}

/**
 * Classifies a message against the given audience's intent set.
 * @returns {{ intentId: string|null, score: number, confident: boolean, ranked: Array<{intentId:string, score:number}> }}
 */
export function classify(message, audience) {
  const index = getIndex(audience);
  const rawTokens = tokenize(message);
  const correctedTokens = rawTokens.map((t) => correctToken(t, index.vocabulary));
  const queryVec = index.vectorize(correctedTokens);

  const scoresByIntent = new Map();
  for (const doc of index.docVectors) {
    const sim = cosineSim(queryVec, doc.vec);
    if (!scoresByIntent.has(doc.intentId) || sim > scoresByIntent.get(doc.intentId)) {
      scoresByIntent.set(doc.intentId, sim);
    }
  }

  const ranked = [...scoresByIntent.entries()]
    .map(([intentId, score]) => ({ intentId, score }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  if (!top || top.score < CONFIDENCE_THRESHOLD) {
    return { intentId: null, score: top?.score || 0, confident: false, ranked };
  }
  return { intentId: top.intentId, score: top.score, confident: true, ranked };
}
