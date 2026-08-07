import { query } from '../config/db.js';
export async function listReviews(req, res) {
  const { productId } = req.params;

  const result = await query(
    `SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        u.full_name,
        COUNT(hv.user_id)::int AS helpful_count
     FROM product_reviews r
     JOIN users u ON u.id = r.buyer_id
     LEFT JOIN review_helpful_votes hv ON hv.review_id = r.id
     WHERE r.product_id = $1
     GROUP BY r.id, u.full_name
     ORDER BY r.created_at DESC
     LIMIT 100`,
    [productId]
  );

  const summary = await query(
    `SELECT 
        COUNT(*) AS total,
        COALESCE(AVG(rating),0) AS average,
        COUNT(*) FILTER (WHERE rating = 5) AS five,
        COUNT(*) FILTER (WHERE rating = 4) AS four,
        COUNT(*) FILTER (WHERE rating = 3) AS three,
        COUNT(*) FILTER (WHERE rating = 2) AS two,
        COUNT(*) FILTER (WHERE rating = 1) AS one
     FROM product_reviews
     WHERE product_id = $1`,
    [productId]
  );

  res.json({
    reviews: result.rows,
    summary: summary.rows[0]
  });
}
// Only a buyer with a completed order for this exact product may review it —
// enforced here, not just assumed client-side.
export async function createReview(req, res) {
  const { productId } = req.params;
  const { rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({
      error: 'Rating must be between 1 and 5.'
    });
  }

  const purchase = await query(
    `SELECT id FROM orders
     WHERE buyer_id = $1 AND product_id = $2
       AND status IN ('delivered_confirmed', 'completed')
     LIMIT 1`,
    [req.user.id, productId]
  );
  if (purchase.rows.length === 0) {
    return res.status(403).json({
      error: 'You can only review products from a completed order.'
    });
  }

  const existing = await query(
    'SELECT id FROM product_reviews WHERE product_id = $1 AND buyer_id = $2 LIMIT 1',
    [productId, req.user.id]
  );
  if (existing.rows.length > 0) {
    return res.status(409).json({
      error: 'You have already reviewed this product.'
    });
  }

  const result = await query(
    `INSERT INTO product_reviews
     (product_id, buyer_id, rating, comment)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [
      productId,
      req.user.id,
      rating,
      comment || null
    ]
  );

  res.status(201).json({
    message: 'Review submitted.',
    review: result.rows[0]
  });
}
export async function markHelpful(req,res){
  const { reviewId } = req.params;

  await query(
    `INSERT INTO review_helpful_votes(review_id,user_id)
     VALUES($1,$2)
     ON CONFLICT DO NOTHING`,
    [reviewId, req.user.id]
  );

  res.json({voted:true});
}
// ===== Seller reply (seller replies to reviews on their own products only) =====
export async function replyToReview(req, res) {
  const { reviewId } = req.params;
  const { reply } = req.body;

  const check = await query(
    `SELECT r.id FROM product_reviews r
     JOIN products p ON p.id = r.product_id JOIN shops s ON s.id = p.shop_id
     WHERE r.id = $1 AND s.owner_id = $2`,
    [reviewId, req.user.id]
  );
  if (check.rows.length === 0) return res.status(403).json({ error: 'You can only reply to reviews on your own products.' });

  await query('UPDATE product_reviews SET seller_reply = $1, seller_replied_at = now() WHERE id = $2', [reply, reviewId]);
  res.json({ message: 'Reply posted.' });
}

// ===== Q&A — Buyer -> Admin -> Seller, never direct =====

export async function listQuestions(req, res) {
  const result = await query(
    `SELECT 
       q.id,
       q.question AS question_text,
       q.answer AS answer_text,
       q.created_at,
       u.full_name AS asker_name
     FROM product_questions q
     JOIN users u ON u.id = q.buyer_id
     WHERE q.product_id = $1
     ORDER BY q.created_at DESC
     LIMIT 50`,
    [req.params.productId]
  );

  res.json({ questions: result.rows });
}
export async function askQuestion(req, res) {
  const { questionText } = req.body;
  if (!questionText?.trim()) return res.status(400).json({ error: 'Question text is required.' });

const result = await query(
  `INSERT INTO product_questions (product_id, buyer_id, asked_by, question)
   VALUES ($1,$2,$3,$4)
   RETURNING *`,
  [
    req.params.productId,
    req.user.id,
    req.user.id,
    questionText.trim()
  ]
);
  // notify admins — same pattern as chat ticket notifications
  const admins = await query('SELECT id FROM users WHERE is_admin = TRUE');
  const productResult = await query('SELECT title FROM products WHERE id = $1', [req.params.productId]);
  for (const admin of admins.rows) {
    await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata)
       VALUES ($1,'system_announcement','New product question',$2,$3)`,
      [admin.id, `A buyer asked about "${productResult.rows[0]?.title}".`, { questionId: result.rows[0].id }]
    );
  }

  res.status(201).json({ message: 'Question submitted to the admin team for review.', question: result.rows[0] });
}

// ===== Admin: relay question to seller, then relay seller's answer back =====
export async function listPendingQuestions(req, res) {
  const result = await query(
    `SELECT 
        q.*,
        q.question AS question_text,
        q.answer AS answer_text,
        u.full_name AS asker_name,
        p.title AS product_title,
        s.owner_id AS seller_id,
        su.full_name AS seller_name
     FROM product_questions q
     JOIN users u ON u.id = q.asked_by
     JOIN products p ON p.id = q.product_id
     JOIN shops s ON s.id = p.shop_id
     JOIN users su ON su.id = s.owner_id
     WHERE q.status = 'pending_admin'
     ORDER BY q.created_at ASC`
  );

  res.json({ questions: result.rows });
}

export async function forwardToSeller(req, res) {
  const question = await query(
    `SELECT q.*, s.owner_id AS seller_id FROM product_questions q
     JOIN products p ON p.id = q.product_id JOIN shops s ON s.id = p.shop_id
     WHERE q.id = $1`,
    [req.params.questionId]
  );
  if (question.rows.length === 0) return res.status(404).json({ error: 'Question not found.' });

await query(
 `UPDATE product_questions
  SET status = 'forwarded_to_seller',
      forwarded_at = now()
  WHERE id = $1`,
 [req.params.questionId]
);
  await query(
    `INSERT INTO notifications (user_id, type, title, body, metadata)
     VALUES ($1,'system_announcement','Buyer question forwarded to you','A buyer asked a question about one of your products.',$2)`,
    [question.rows[0].seller_id, { questionId: req.params.questionId }]
  );
  res.json({ message: 'Question forwarded to seller.' });
}

// Called when the ADMIN posts the seller's answer (relayed, never the
// seller posting directly to the buyer) — keeps the no-direct-contact rule
// intact even for Q&A.
export async function postAnswer(req, res) {
  const { answerText } = req.body;

await query(
 `UPDATE product_questions
  SET status = 'answered',
      answer = $1,
      answered_by = $2,
      answered_at = now()
  WHERE id = $3`,
 [answerText, req.user.id, req.params.questionId]
);
  res.json({ message: 'Answer published.' });
}
