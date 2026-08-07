# Verified Shop System — Phase D: Verified Shop Feed (JedidaMarket_VerifiedShop_PhaseD.zip)

Builds on Phase A+B+C (JedidaMarket_VerifiedShop_PhaseC.zip) — unchanged except where noted.

## What changed
- `schema_phase61_verified_shop_feed.sql` — `shop_feed_posts` (post types: product_update,
  new_arrival, promotion, restock, behind_the_scenes, business_story, testimonial,
  limited_time_offer, general; media JSONB array; optional product attachment; discount
  %/offer-end for countdown badges; denormalized like/comment/share/save counts) plus
  `shop_feed_post_likes`, `_saves`, `_shares`, `_comments`.
- `shopFeedController.js` — posting is gated to `shops.is_verified = TRUE` at write time
  (checked fresh on every create, not cached), so a shop that loses verification can't
  post again until it re-qualifies (existing posts stay visible — no cascade-hide).
  Includes seller CRUD, public shop-feed + discovery-feed reads, a personalized
  "for you" feed scoped to `shop_follows` (falls back to discovery if you follow no
  verified shops yet), and full engagement (like/save/share/comment) plus admin
  moderation (list/remove/restore).
- "Buy directly from feed content" reuses the existing product page / checkout flow via
  `post.product_id` — no new commerce logic. Media upload reuses the existing
  `MediaUploader` component and `POST /api/uploads` Cloudinary pipeline unchanged.
- Frontend: `FeedPostCard.jsx` (shared render for shop profile / discovery / personalized
  feed / seller's own post list), `SellerFeedComposer.jsx` (new "📣 Shop Feed" Seller
  Dashboard tab — shows a clear "Verified Shops only" message with a nudge to the
  Verification tab if the shop doesn't yet qualify), `ShopFeedSection.jsx` (shop profile
  tab, only rendered for verified shops), `DiscoveryFeedSection.jsx` (Marketplace
  homepage section), `ForYouFeed.jsx` (new `/feed` page, added to the header nav), and a
  "📣 Shop Feed Moderation" sub-tab in the admin Verified Shops panel.

## Design choices worth knowing
- A post can carry at most one attached product for the "Buy" button/price display — the
  brief's examples (announce a restock, promote one item, share a testimonial) are all
  single-product; multi-product carousel posts weren't asked for and would meaningfully
  complicate the schema (an attachments table) for a use case not in the request.
- Comments are flat (no threaded replies) and capped at 1000 characters — matches the
  "customers can comment" ask without building a full discussion-thread system.
- No push/in-app notification is sent to followers when a shop posts (to avoid follower
  notification spam on every promo); engagement notifications weren't in the original
  spec's bullet list, so this was left out rather than guessed at.
- The "For You" personalized feed only uses `shop_follows` for now — the brief also says
  "and interests"; ranking by purchase-history-derived interest would need its own
  scoring pass and wasn't specified precisely enough to build without guessing at
  weighting, so it's flagged here rather than silently done.

## Not built yet (later phase)
Phase E (Growth Benefits): priority search ranking beyond the existing featured-shops
ordering, an analytics dashboard, AI Sales Growth Manager, and marketing/promotional tools.
