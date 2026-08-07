// Intent corpus for the local (no-API) NLU classifier.
//
// Each intent carries several *paraphrases* of the same request — this is
// what satisfies "recognize different ways of expressing the same
// request" (master prompt: "Create quotation / Generate quotation /
// Prepare quotation / I need a quotation" should all map to one intent)
// without any external model: the classifier in classifier.js compares an
// incoming message against every example below by vocabulary overlap
// (TF-IDF + cosine similarity), not by exact phrase matching, so a
// message doesn't need to match any single example exactly.
//
// `templates` has 2-3 variants per intent so replies don't feel like the
// same canned line every time — respond.js picks one deterministically
// per message rather than repeating template[0] on every hit.

export const INTENTS = {
  seller: [
    {
      id: 'store_design',
      agent: 'Amina',
      section: 'Store Design section',
      examples: [
        'help me design my storefront',
        'change the theme colors of my shop',
        'I want a new layout for my homepage',
        'how do I set up my store design',
        'my shop looks boring can you redesign it',
        'update the homepage sections',
        'pick a theme for my store',
        'storefront looks outdated need a refresh',
      ],
      templates: [
        "For storefront design — colors, layout, homepage sections — that's {agent}'s job. Open the AI Assistant tab and use the {section}: describe your business in a sentence or two and she'll draft a tagline, description, and section ideas you can apply.",
        "{agent} handles storefront design in the {section} of the AI Assistant tab — tell her about your business and she'll suggest a tagline, description, and layout ideas.",
      ],
    },
    {
      id: 'product_review',
      agent: 'Nsubuga Joseph',
      section: 'Product Review section',
      examples: [
        'review my product listing',
        'is my product price too high',
        'check my listing before I publish it',
        'help me write a better product description',
        'my product title sounds off can you fix it',
        'is this a good price for my product',
        'proofread my listing',
        'feedback on my product page',
      ],
      templates: [
        "{agent} reviews product listings before they go live — title, description, pricing sanity checks. You'll find him in the AI Assistant tab under {section}: paste in your draft listing and he'll flag anything worth fixing.",
        "For listing feedback — wording, pricing, anything off — that's {agent}, in the {section} of the AI Assistant tab.",
      ],
    },
    {
      id: 'marketing',
      agent: 'TAUSI',
      section: 'Marketing section',
      examples: [
        'help me write an ad',
        'I need social media posts for my product',
        'run a marketing campaign',
        'draft promotional copy',
        'how do I advertise my shop',
        'write a caption for this product',
        'plan a discount campaign',
        'boost my product on social media',
      ],
      templates: [
        "{agent} handles marketing — social posts, campaign copy, and budget suggestions. Open the AI Assistant tab's {section}, pick a product, and {agent} will draft copy you can post or launch as a campaign.",
        "That's {agent}'s territory — the {section} of the AI Assistant tab drafts ad copy and campaign ideas for any product you pick.",
      ],
    },
    {
      id: 'analytics',
      agent: 'TAUSI',
      section: 'Analytics section',
      examples: [
        'how are my sales doing',
        'show me my shop performance',
        'how many visitors did I get this week',
        'is my revenue up or down',
        'give me a sales summary',
        'how is my shop performing compared to last month',
        'traffic report for my store',
      ],
      templates: [
        "For sales and traffic numbers, check the {section} of the AI Assistant tab — {agent} compares this period to the last one and calls out what's worth acting on.",
      ],
    },
    {
      id: 'security',
      agent: 'PETITI',
      section: 'Security section',
      examples: [
        'is my shop safe',
        'check for fraud on my account',
        'I think someone is scamming me',
        'security check for my store',
        'any suspicious activity on my shop',
        'is this order a scam',
        'risk report for my business',
      ],
      templates: [
        "Security and fraud checks are {agent}'s territory — the {section} of the AI Assistant tab shows your shop's current risk signals.",
      ],
    },
  ],
  buyer: [
    {
      id: 'track_order',
      examples: [
        'where is my order',
        'track my package',
        'has my order shipped yet',
        'delivery status of my order',
        'when will my order arrive',
        'my package tracking',
        'order status please',
      ],
      templates: [
        'You can track any order under My Orders → Order Tracking — it shows live status from paid to shipped to delivered.{context}',
        'Order Tracking under My Orders has the live status for anything you\'ve bought.{context}',
      ],
    },
    {
      id: 'return_refund',
      examples: [
        'I want to return this item',
        'how do I get a refund',
        'the product arrived damaged',
        'I got the wrong item',
        'open a dispute for my order',
        'this isn\'t what I ordered',
        'refund request',
      ],
      templates: [
        "For a return or refund, open the order in My Orders and use Report a Problem — that opens a dispute the seller and Jedida both see. Funds stay in escrow until it's resolved, so you're covered either way.",
      ],
    },
    {
      id: 'payment_escrow',
      examples: [
        'how does payment work',
        'is my money safe',
        'what payment methods can I use',
        'how does escrow work',
        'when does the seller get paid',
        'can I pay with mobile money',
        'checkout payment options',
      ],
      templates: [
        'Jedida holds payment in escrow until you confirm delivery, so the seller only gets paid once you\'ve received your order. You can pay by card, mobile money, or your Jedida Wallet at checkout.',
      ],
    },
    {
      id: 'find_product',
      examples: [
        'I am looking for a product',
        'where can I buy this',
        'help me find something',
        'search for a specific item',
        'do you sell this product',
        'browse products in a category',
      ],
      templates: [
        'Try the search bar on the Marketplace page, or browse by category — Trending Products and each shop\'s page are good places to start.{context}',
      ],
    },
    {
      id: 'contact_seller',
      examples: [
        'how do I message the seller',
        'I have a question about a product',
        'contact the shop owner',
        'ask the seller something before I buy',
      ],
      templates: [
        'You can message a seller directly from any product page — look for Ask a Question or Message Seller. For anything Jedida itself needs to weigh in on, use Chat with Support.',
      ],
    },
    {
      id: 'cancel_order',
      examples: [
        'cancel my order',
        'I want to cancel this purchase',
        'stop my order before it ships',
        'undo my order',
      ],
      templates: [
        'Orders can be cancelled from My Orders while they\'re still pending payment or unshipped — after that, use Report a Problem to open a dispute instead.',
      ],
    },
    {
      id: 'request_quote',
      examples: [
        'create a quotation',
        'generate a quote for bulk order',
        'prepare a quotation for me',
        'I need a quotation',
        'can I get a wholesale quote',
        'request pricing for a large order',
        'bulk pricing quote',
      ],
      templates: [
        'You can request a quote right from the product page — look for Request a Quote (or Bulk/B2B Quote on wholesale listings). Fill in the quantity you need and the supplier responds with pricing directly.',
      ],
    },
  ],
};

export const SHARED_INTENTS = [
  {
    id: 'greeting',
    audience: 'both',
    examples: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'yo', 'hey there'],
    templates: {
      seller: ["Hey! I can help with storefront design, product reviews, marketing copy, shop analytics, or security questions — what are you working on?"],
      buyer: ["Hey! I can help you track an order, sort out a return or refund, understand payments, or find a product — what do you need?"],
    },
  },
  {
    id: 'thanks',
    audience: 'both',
    examples: ['thank you', 'thanks', 'thanks a lot', 'appreciate it', 'thank you so much'],
    templates: { seller: ["Anytime — let me know if anything else comes up."], buyer: ["You're welcome — anything else I can help with?"] },
  },
];
