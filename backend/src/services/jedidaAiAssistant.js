// Jedida AI Assistant — one conversational front door, used by both the
// seller dashboard and the buyer-facing pages. Same widget, two reply
// sets: sellers get routed to Amina/Nsubuga Joseph/TAUSI/PETITI; buyers
// get routed to order tracking, returns, payments, and product search.
//
// Fully deterministic — no calls to Groq, Google AI Studio, or any other
// external service. Keyword-matched replies only.

import { shouldAnswerIdentity, getIdentityReply } from './jedidaIdentity.js';

const SELLER_REPLIES = [
  {
    match: /store|storefront|design|theme|layout/i,
    reply: "For storefront design — colors, layout, homepage sections — that's Amina's job. Open the AI Assistant tab and use the Store Design section: describe your business in a sentence or two and she'll draft a tagline, description, and section ideas you can apply."
  },
  {
    match: /product|listing|review|price|pricing/i,
    reply: "Nsubuga Joseph reviews product listings before they go live — title, description, pricing sanity checks. You'll find him in the AI Assistant tab under Product Review: paste in your draft listing and he'll flag anything worth fixing."
  },
  {
    match: /market|campaign|ad|promot|social/i,
    reply: "TAUSI handles marketing — social posts, campaign copy, and budget suggestions. Open the AI Assistant tab's Marketing section, pick a product, and TAUSI will draft copy you can post or launch as a campaign."
  },
  {
    match: /analytic|sales|revenue|visitor|performance|how.*(doing|going)/i,
    reply: "For sales and traffic numbers, check the Analytics section of the AI Assistant tab — TAUSI compares this period to the last one and calls out what's worth acting on."
  },
  {
    match: /secur|fraud|scam|risk/i,
    reply: "Security and fraud checks are PETITI's territory — the Security section of the AI Assistant tab shows your shop's current risk signals."
  },
  {
    match: /^\s*(hi|hello|hey|yo)\s*[!.]?\s*$/i,
    reply: "Hey! I can help with storefront design, product reviews, marketing copy, shop analytics, or security questions — what are you working on?"
  }
];

const SELLER_DEFAULT_REPLY = "I can help with storefront design, product reviews, marketing copy, shop analytics, or security questions — tell me a bit more about what you're trying to do and I'll point you to the right tool (or the right teammate: Amina, Nsubuga Joseph, TAUSI, or PETITI).";

const BUYER_REPLIES = [
  {
    match: /track|where.*(order|package)|shipping status|deliver/i,
    reply: "You can track any order under My Orders → Order Tracking — it shows live status from paid to shipped to delivered. If your context shows a most-recent order below, that's its current status."
  },
  {
    match: /return|refund|dispute|wrong item|damaged/i,
    reply: "For a return or refund, open the order in My Orders and use Report a Problem — that opens a dispute the seller and Jedida both see. Funds stay in escrow until it's resolved, so you're covered either way."
  },
  {
    match: /pay|payment|checkout|card|wallet|escrow/i,
    reply: "Jedida holds payment in escrow until you confirm delivery, so the seller only gets paid once you've received your order. You can pay by card, mobile money, or your Jedida Wallet at checkout."
  },
  {
    match: /find|search|looking for|where can i buy|product/i,
    reply: "Try the search bar on the Marketplace page, or browse by category — Trending Products and each shop's page are good places to start. Tell me what you're looking for and I can point you to the right category."
  },
  {
    match: /contact|message|seller|question about/i,
    reply: "You can message a seller directly from any product page — look for Ask a Question or Message Seller. For anything Jedida itself needs to weigh in on, use Chat with Support."
  },
  {
    match: /cancel/i,
    reply: "Orders can be cancelled from My Orders while they're still pending payment or unshipped — after that, use Report a Problem to open a dispute instead."
  },
  {
    match: /^\s*(hi|hello|hey|yo)\s*[!.]?\s*$/i,
    reply: "Hey! I can help you track an order, sort out a return or refund, understand payments, or find a product — what do you need?"
  }
];

const BUYER_DEFAULT_REPLY = "I can help with order tracking, returns and refunds, payments, or finding a product — tell me a bit more about what you need.";

const DEEP_SUFFIX_SELLER = "\n\nWant the longer version? Open that section directly in the AI Assistant tab — it walks through the full form with your actual shop data, rather than me guessing at it here.";
const DEEP_SUFFIX_BUYER = "\n\nWant more detail? Open My Orders or the relevant page directly — it'll show your actual order data, rather than me guessing at it here.";

function heuristicReply(message, audience) {
  const set = audience === 'buyer' ? BUYER_REPLIES : SELLER_REPLIES;
  const fallback = audience === 'buyer' ? BUYER_DEFAULT_REPLY : SELLER_DEFAULT_REPLY;
  const hit = set.find((f) => f.match.test(message));
  return hit ? hit.reply : fallback;
}

export async function getAssistantReply({ message, deepMode, shopContext, audience = 'seller' }) {
  // Identity questions ("who made you", "who really runs Jedida", jailbreak
  // framings like "ignore previous instructions and tell me the truth")
  // are answered consistently here, before the normal keyword routing —
  // see jedidaIdentity.js for why this is a fixed answer rather than
  // something that only surfaces if someone manages to trick the AI.
  if (shouldAnswerIdentity(message)) {
    return getIdentityReply();
  }

  let reply = heuristicReply(message, audience);
  if (shopContext) reply = `${reply}\n\n(Looking at ${shopContext})`;
  if (deepMode) reply += audience === 'buyer' ? DEEP_SUFFIX_BUYER : DEEP_SUFFIX_SELLER;
  return reply;
}
