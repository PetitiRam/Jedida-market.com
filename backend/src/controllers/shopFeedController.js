import { query } from '../config/db.js';

const POST_TYPES = [
  'product_update', 'new_arrival', 'promotion', 'restock',
  'behind_the_scenes', 'business_story', 'testimonial', 'limited_time_offer', 'general'
];

async function getOwnVerifiedShop(userId) {
  const result = await query('SELECT id, is_verified FROM shops WHERE owner_id = $1', [userId]);
  return result.rows[0] || null;
}

const POST_SELECT = `
  p.*, s.name AS shop_name, s.slug AS shop_slug, s.logo_url AS shop_logo, s.is_verified AS shop_is_verified,
  pr.title AS product_title, pr.price AS product_price, pr.images AS product_images
`;

function withViewerFlags(rows, viewerLikes = new Set(), viewerSaves = new Set()) {
  return rows.map((r) => ({ ...r, viewer_liked: viewerLikes.has(r.id), viewer_saved: viewerSaves.has(r.id) }));
}

async function attachViewerFlags(rows, userId) {
  if (!userId || rows.length === 0) return withViewerFlags(rows);
  const ids = rows.map((r) => r.id);
  const [likes, saves] = await Promise.all([
    query('SELECT post_id FROM shop_feed_post_likes WHERE user_id = $1 AND post_id = ANY($2)', [userId, ids]),
    query('SELECT post_id FROM shop_feed_post_saves WHERE user_id = $1 AND post_id = ANY($2)', [userId, ids])
  ]);
  return withViewerFlags(rows, new Set(likes.rows.map((r) => r.post_id)), new Set(saves.rows.map((r) => r.post_id)));
}

// ===== Seller-facing: create/manage posts =====

export async function createPost(req, res) {
  const shop = await getOwnVerifiedShop(req.user.id);
  if (!shop) return res.status(404).json({ error: 'No shop found for your account.' });
  if (!shop.is_verified) {
    return res.status(403).json({ error: 'Only Verified Shops can post to the Shop Feed. Check your Verification tab to see what\'s still needed.' });
  }

  const { postType = 'general', caption = '', media = [], productId, discountPercent, offerEndsAt } = req.body;
  if (!POST_TYPES.includes(postType)) return res.status(400).json({ error: 'Invalid post type.' });
  if (!caption.trim() && (!Array.isArray(media) || media.length === 0)) {
    return res.status(400).json({ error: 'A post needs a caption or at least one photo/video.' });
  }

  if (productId) {
    const productCheck = await query('SELECT id FROM products WHERE id = $1 AND shop_id = $2', [productId, shop.id]);
    if (productCheck.rows.length === 0) return res.status(400).json({ error: 'That product does not belong to your shop.' });
  }

  try {
    const result = await query(
      `INSERT INTO shop_feed_posts (shop_id, author_id, post_type, caption, media, product_id, discount_percent, offer_ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [shop.id, req.user.id, postType, caption.trim(), JSON.stringify(media || []), productId || null, discountPercent || null, offerEndsAt || null]
    );
    return res.status(201).json({ message: 'Posted to your Shop Feed.', post: result.rows[0] });
  } catch (err) {
    console.error('Create feed post error:', err);
    return res.status(500).json({ error: 'Could not create post.' });
  }
}

export async function updatePost(req, res) {
  const { postId } = req.params;
  const shop = await getOwnVerifiedShop(req.user.id);
  if (!shop) return res.status(404).json({ error: 'No shop found for your account.' });

  const { caption, media, discountPercent, offerEndsAt } = req.body;
  try {
    const result = await query(
      `UPDATE shop_feed_posts SET
         caption = COALESCE($1, caption), media = COALESCE($2, media),
         discount_percent = $3, offer_ends_at = $4, updated_at = now()
       WHERE id = $5 AND shop_id = $6 RETURNING *`,
      [caption, media ? JSON.stringify(media) : null, discountPercent ?? null, offerEndsAt || null, postId, shop.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Post not found.' });
    return res.json({ message: 'Post updated.', post: result.rows[0] });
  } catch (err) {
    console.error('Update feed post error:', err);
    return res.status(500).json({ error: 'Could not update post.' });
  }
}

export async function deletePost(req, res) {
  const { postId } = req.params;
  const shop = await getOwnVerifiedShop(req.user.id);
  if (!shop) return res.status(404).json({ error: 'No shop found for your account.' });

  const result = await query('DELETE FROM shop_feed_posts WHERE id = $1 AND shop_id = $2 RETURNING id', [postId, shop.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Post not found.' });
  return res.json({ message: 'Post deleted.' });
}

export async function listMyPosts(req, res) {
  const shop = await getOwnVerifiedShop(req.user.id);
  if (!shop) return res.status(404).json({ error: 'No shop found for your account.' });
  const result = await query(
    `SELECT ${POST_SELECT} FROM shop_feed_posts p
     JOIN shops s ON s.id = p.shop_id LEFT JOIN products pr ON pr.id = p.product_id
     WHERE p.shop_id = $1 AND p.status != 'removed_by_admin' ORDER BY p.created_at DESC LIMIT 100`,
    [shop.id]
  );
  return res.json({ posts: result.rows, shopIsVerified: shop.is_verified });
}

// ===== Public: shop-profile feed tab =====

export async function getShopFeed(req, res) {
  const { shopId } = req.params;
  const result = await query(
    `SELECT ${POST_SELECT} FROM shop_feed_posts p
     JOIN shops s ON s.id = p.shop_id LEFT JOIN products pr ON pr.id = p.product_id
     WHERE p.shop_id = $1 AND p.status = 'published' ORDER BY p.created_at DESC LIMIT 50`,
    [shopId]
  );
  const posts = await attachViewerFlags(result.rows, req.user?.id);
  return res.json({ posts });
}

// ===== Public: marketplace discovery feed (latest from every verified shop) =====

export async function getDiscoveryFeed(req, res) {
  const { page = 1, pageSize = 20 } = req.query;
  const offset = (Math.max(Number(page) || 1, 1) - 1) * (Number(pageSize) || 20);
  const result = await query(
    `SELECT ${POST_SELECT} FROM shop_feed_posts p
     JOIN shops s ON s.id = p.shop_id LEFT JOIN products pr ON pr.id = p.product_id
     WHERE p.status = 'published' AND s.is_verified = TRUE AND s.status = 'active'
     ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
    [Math.min(Number(pageSize) || 20, 50), offset]
  );
  const posts = await attachViewerFlags(result.rows, req.user?.id);
  return res.json({ posts });
}

// ===== Buyer: personalized feed (shops they follow) =====

export async function getPersonalizedFeed(req, res) {
  const { page = 1, pageSize = 20 } = req.query;
  const offset = (Math.max(Number(page) || 1, 1) - 1) * (Number(pageSize) || 20);
  const result = await query(
    `SELECT ${POST_SELECT} FROM shop_feed_posts p
     JOIN shops s ON s.id = p.shop_id LEFT JOIN products pr ON pr.id = p.product_id
     WHERE p.status = 'published' AND s.is_verified = TRUE
       AND EXISTS (SELECT 1 FROM shop_follows sf WHERE sf.shop_id = p.shop_id AND sf.user_id = $1)
     ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,
    [req.user.id, Math.min(Number(pageSize) || 20, 50), offset]
  );
  const posts = await attachViewerFlags(result.rows, req.user.id);

  // If they don't follow any verified shops yet, fall back to discovery
  // so "For You" isn't just an empty page on day one.
  if (posts.length === 0 && Number(page) === 1) {
    const fallback = await query(
      `SELECT ${POST_SELECT} FROM shop_feed_posts p
       JOIN shops s ON s.id = p.shop_id LEFT JOIN products pr ON pr.id = p.product_id
       WHERE p.status = 'published' AND s.is_verified = TRUE
       ORDER BY p.created_at DESC LIMIT 20`,
      []
    );
    return res.json({ posts: await attachViewerFlags(fallback.rows, req.user.id), fallback: true });
  }
  return res.json({ posts, fallback: false });
}

// ===== Engagement =====

export async function likePost(req, res) {
  const { postId } = req.params;
  try {
    const inserted = await query(
      `INSERT INTO shop_feed_post_likes (post_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING post_id`,
      [postId, req.user.id]
    );
    if (inserted.rows.length > 0) {
      await query('UPDATE shop_feed_posts SET like_count = like_count + 1 WHERE id = $1', [postId]);
    }
    return res.json({ liked: true });
  } catch (err) {
    console.error('Like post error:', err);
    return res.status(500).json({ error: 'Could not like post.' });
  }
}

export async function unlikePost(req, res) {
  const { postId } = req.params;
  const deleted = await query('DELETE FROM shop_feed_post_likes WHERE post_id = $1 AND user_id = $2 RETURNING post_id', [postId, req.user.id]);
  if (deleted.rows.length > 0) {
    await query('UPDATE shop_feed_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = $1', [postId]);
  }
  return res.json({ liked: false });
}

export async function savePost(req, res) {
  const { postId } = req.params;
  const inserted = await query(
    `INSERT INTO shop_feed_post_saves (post_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING post_id`,
    [postId, req.user.id]
  );
  if (inserted.rows.length > 0) {
    await query('UPDATE shop_feed_posts SET save_count = save_count + 1 WHERE id = $1', [postId]);
  }
  return res.json({ saved: true });
}

export async function unsavePost(req, res) {
  const { postId } = req.params;
  const deleted = await query('DELETE FROM shop_feed_post_saves WHERE post_id = $1 AND user_id = $2 RETURNING post_id', [postId, req.user.id]);
  if (deleted.rows.length > 0) {
    await query('UPDATE shop_feed_posts SET save_count = GREATEST(0, save_count - 1) WHERE id = $1', [postId]);
  }
  return res.json({ saved: false });
}

export async function listSavedPosts(req, res) {
  const result = await query(
    `SELECT ${POST_SELECT} FROM shop_feed_post_saves sv
     JOIN shop_feed_posts p ON p.id = sv.post_id
     JOIN shops s ON s.id = p.shop_id LEFT JOIN products pr ON pr.id = p.product_id
     WHERE sv.user_id = $1 AND p.status = 'published' ORDER BY sv.created_at DESC LIMIT 100`,
    [req.user.id]
  );
  return res.json({ posts: await attachViewerFlags(result.rows, req.user.id) });
}

export async function recordShare(req, res) {
  const { postId } = req.params;
  await query('INSERT INTO shop_feed_post_shares (post_id, user_id) VALUES ($1,$2)', [postId, req.user?.id || null]);
  await query('UPDATE shop_feed_posts SET share_count = share_count + 1 WHERE id = $1', [postId]);
  return res.json({ message: 'Share recorded.' });
}

export async function addComment(req, res) {
  const { postId } = req.params;
  const { commentText } = req.body;
  if (!commentText?.trim()) return res.status(400).json({ error: 'Comment text is required.' });
  const inserted = await query(
    `INSERT INTO shop_feed_post_comments (post_id, user_id, comment_text) VALUES ($1,$2,$3) RETURNING *`,
    [postId, req.user.id, commentText.trim().slice(0, 1000)]
  );
  await query('UPDATE shop_feed_posts SET comment_count = comment_count + 1 WHERE id = $1', [postId]);
  const withUser = await query(
    `SELECT c.*, u.username FROM shop_feed_post_comments c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
    [inserted.rows[0].id]
  );
  return res.status(201).json({ comment: withUser.rows[0] });
}

export async function listComments(req, res) {
  const { postId } = req.params;
  const result = await query(
    `SELECT c.*, u.username FROM shop_feed_post_comments c JOIN users u ON u.id = c.user_id
     WHERE c.post_id = $1 AND c.removed_by_admin = FALSE ORDER BY c.created_at ASC LIMIT 200`,
    [postId]
  );
  return res.json({ comments: result.rows });
}

export async function deleteComment(req, res) {
  const { commentId } = req.params;
  // A comment can be removed by its author, or by the shop that owns the post it's on.
  const shop = await getOwnVerifiedShop(req.user.id);
  const result = await query(
    `SELECT c.id, c.user_id, c.post_id, p.shop_id FROM shop_feed_post_comments c JOIN shop_feed_posts p ON p.id = c.post_id WHERE c.id = $1`,
    [commentId]
  );
  const comment = result.rows[0];
  if (!comment) return res.status(404).json({ error: 'Comment not found.' });
  const canDelete = comment.user_id === req.user.id || (shop && shop.id === comment.shop_id);
  if (!canDelete) return res.status(403).json({ error: 'You can only remove your own comments, or comments on your own shop\'s posts.' });

  await query('DELETE FROM shop_feed_post_comments WHERE id = $1', [commentId]);
  await query('UPDATE shop_feed_posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = $1', [comment.post_id]);
  return res.json({ message: 'Comment removed.' });
}

// ===== Admin moderation =====

export async function adminListPosts(req, res) {
  const { shopId, status } = req.query;
  const conditions = [];
  const values = [];
  let i = 1;
  if (shopId) { conditions.push(`p.shop_id = $${i}`); values.push(shopId); i += 1; }
  if (status) { conditions.push(`p.status = $${i}`); values.push(status); i += 1; }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT ${POST_SELECT} FROM shop_feed_posts p
     JOIN shops s ON s.id = p.shop_id LEFT JOIN products pr ON pr.id = p.product_id
     ${where} ORDER BY p.created_at DESC LIMIT 100`,
    values
  );
  return res.json({ posts: result.rows });
}

export async function adminRemovePost(req, res) {
  const { postId } = req.params;
  const { reason } = req.body;
  const result = await query(
    `UPDATE shop_feed_posts SET status = 'removed_by_admin', removed_reason = $1, removed_by = $2 WHERE id = $3 RETURNING *`,
    [reason || null, req.user.id, postId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Post not found.' });
  return res.json({ message: 'Post removed.', post: result.rows[0] });
}

export async function adminRestorePost(req, res) {
  const { postId } = req.params;
  const result = await query(
    `UPDATE shop_feed_posts SET status = 'published', removed_reason = NULL, removed_by = NULL WHERE id = $1 RETURNING *`,
    [postId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Post not found.' });
  return res.json({ message: 'Post restored.', post: result.rows[0] });
}
