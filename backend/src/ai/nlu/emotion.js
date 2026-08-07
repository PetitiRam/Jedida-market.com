// Lexicon-based emotion detection. No model, no API — a weighted keyword
// scan per emotion, the highest-scoring emotion above a small threshold
// wins, otherwise the tone is treated as neutral. Crude compared to a
// real classifier, but enough to satisfy "recognize emotional tone" and
// "respond appropriately" without external calls: it's the difference
// between an assistant that's flatly the same regardless of how upset
// someone is, and one that opens with acknowledgement before the answer.

const LEXICON = {
  angry: ['angry', 'furious', 'annoyed', 'ridiculous', 'unacceptable', 'scam', 'terrible', 'worst', 'fed up', 'sick of', 'outrageous', 'fraud'],
  frustrated: ['frustrat', 'stuck', 'not working', "doesn't work", "isn't working", 'again and again', 'still not', 'keep failing', 'useless'],
  sad: ['sad', 'disappointed', 'upset', 'unhappy', 'let down', 'heartbroken'],
  stressed: ['stressed', 'overwhelmed', 'urgent', 'asap', 'emergency', 'deadline', 'panicking', 'worried', 'anxious'],
  confused: ['confused', "don't understand", 'not sure', 'unclear', 'lost', 'what does', 'how do i even', 'no idea'],
  excited: ['excited', 'awesome', 'amazing', 'can\'t wait', 'love this', 'yay', 'great news'],
  happy: ['happy', 'thanks', 'thank you', 'great', 'perfect', 'nice one', 'appreciate'],
  curious: ['curious', 'wondering', 'just wondering', 'out of interest', 'how does'],
};

// Priority when scores tie or are close — negative-tone detection matters
// more to get right than positive, since it changes response tone (an
// empathetic opener), while positive tone mostly just skips that opener.
const PRIORITY = ['angry', 'frustrated', 'stressed', 'sad', 'confused', 'excited', 'happy', 'curious'];

export function detectEmotion(message) {
  const text = String(message || '').toLowerCase();
  const scores = {};
  for (const [emotion, phrases] of Object.entries(LEXICON)) {
    let score = 0;
    for (const phrase of phrases) {
      if (text.includes(phrase)) score += 1;
    }
    if (score > 0) scores[emotion] = score;
  }
  // Punctuation/caps as weak secondary signals for intensity, not on their
  // own enough to name an emotion — only boosts an already-detected one.
  const intensity = (text.match(/!/g) || []).length + (/[A-Z]{4,}/.test(String(message || '')) ? 1 : 0);

  let winner = 'neutral';
  let winnerScore = 0;
  for (const emotion of PRIORITY) {
    const score = scores[emotion] || 0;
    if (score > winnerScore) {
      winner = emotion;
      winnerScore = score;
    }
  }

  return {
    emotion: winner,
    confident: winnerScore > 0,
    intensity: winnerScore + (winner !== 'neutral' ? intensity : 0),
  };
}

// Short, genuine-sounding openers — not appended to every reply, only used
// by the caller when an emotion was actually detected with the negative
// ones acknowledged before the substantive answer.
export const EMPATHY_OPENERS = {
  angry: "I hear you, and that's a fair thing to be upset about — let's sort it out.",
  frustrated: "That sounds frustrating, especially if it's happened more than once. Let's get it fixed.",
  sad: "Sorry that's been disappointing.",
  stressed: "Let's get you an answer quickly.",
  confused: "No worries, let's break it down.",
};
