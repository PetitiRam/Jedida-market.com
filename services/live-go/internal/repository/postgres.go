package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"jedida.com/live/internal/models"
)

var ErrNotFound = errors.New("not found")

type Repository struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// SellerOwnsShop checks the seller relationship the exact same way the
// Node backend's featureGate.js does (shops.owner_id = user id) — the Go
// service does not introduce a second notion of shop ownership.
func (r *Repository) SellerOwnsShop(ctx context.Context, userID, shopID string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM shops WHERE id = $1 AND owner_id = $2)`, shopID, userID,
	).Scan(&exists)
	return exists, err
}

// LiveEnabledForShop mirrors getSellerCapabilities (featureEngineService.js)
// exactly — same 3-level check, same "no activation row yet defaults to
// eligible sellers get it on" backward-compat default that function uses
// for every feature, not something specific to Live Shopping. Read
// directly since the Go service can't import Node code.
//
// CAVEAT (verified against the real Node logic while building this, not
// assumed): because of that default, Live Shopping — like POS — is
// effectively ON for every eligible shop the moment its feature_flags row
// is inserted with global_status='available', not opt-in as the "seller
// enables it" framing elsewhere in this spec implies. That default exists
// in featureEngineService.js for legacy features that pre-date the engine
// and need every existing shop to keep working — it isn't something this
// Go code introduced, but it does mean neither POS nor Live Shopping
// actually requires an explicit per-shop opt-in step right now. Flagging
// this rather than silently patching the shared Node function, since
// changing its default would also affect dropshipping/B2B/wholesale,
// which may depend on that exact behavior.
func (r *Repository) LiveEnabledForShop(ctx context.Context, shopID string) (bool, error) {
	var enabled bool
	err := r.pool.QueryRow(ctx, `
		SELECT
			ff.global_status = 'available'
			AND (ff.eligible_roles = '{}' OR u.primary_role = ANY(ff.eligible_roles))
			AND COALESCE(sfa.enabled, TRUE)
		FROM shops s
		JOIN users u ON u.id = s.owner_id
		LEFT JOIN feature_flags ff ON ff.key = 'live_shopping'
		LEFT JOIN seller_feature_activations sfa ON sfa.shop_id = s.id AND sfa.feature_key = 'live_shopping'
		WHERE s.id = $1
	`, shopID).Scan(&enabled)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return enabled, nil
}

type CreateEventParams struct {
	SellerID     string
	ShopID       string
	Title        string
	Description  string
	ThumbnailURL string
	ScheduledAt  *time.Time
	Visibility   string
}

func (r *Repository) CreateEvent(ctx context.Context, p CreateEventParams) (*models.LiveEvent, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO live_events (seller_id, shop_id, title, description, thumbnail_url, scheduled_at, visibility, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $6 IS NULL THEN 'ready' ELSE 'scheduled' END)
		RETURNING id, seller_id, shop_id, title, COALESCE(description, ''), COALESCE(thumbnail_url, ''), status, visibility,
		          scheduled_at, started_at, ended_at, COALESCE(cloudflare_live_input_uid, ''), COALESCE(cloudflare_video_uid, ''),
		          recording_status, peak_viewers, total_unique_viewers, created_at, updated_at
	`, p.SellerID, p.ShopID, p.Title, p.Description, p.ThumbnailURL, p.ScheduledAt, p.Visibility)
	return scanEvent(row)
}

func (r *Repository) GetEvent(ctx context.Context, id string) (*models.LiveEvent, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, seller_id, shop_id, title, COALESCE(description, ''), COALESCE(thumbnail_url, ''), status, visibility,
		       scheduled_at, started_at, ended_at, COALESCE(cloudflare_live_input_uid, ''), COALESCE(cloudflare_video_uid, ''),
		       recording_status, peak_viewers, total_unique_viewers, created_at, updated_at
		FROM live_events WHERE id = $1
	`, id)
	return scanEvent(row)
}

func scanEvent(row pgx.Row) (*models.LiveEvent, error) {
	var e models.LiveEvent
	err := row.Scan(&e.ID, &e.SellerID, &e.ShopID, &e.Title, &e.Description, &e.ThumbnailURL, &e.Status,
		&e.Visibility, &e.ScheduledAt, &e.StartedAt, &e.EndedAt, &e.CloudflareLiveInputUID, &e.CloudflareVideoUID,
		&e.RecordingStatus, &e.PeakViewers, &e.TotalUniqueViewers, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &e, nil
}

func (r *Repository) ListActiveEvents(ctx context.Context, limit int) ([]*models.LiveEvent, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, seller_id, shop_id, title, COALESCE(description, ''), COALESCE(thumbnail_url, ''), status, visibility,
		       scheduled_at, started_at, ended_at, COALESCE(cloudflare_live_input_uid, ''), COALESCE(cloudflare_video_uid, ''),
		       recording_status, peak_viewers, total_unique_viewers, created_at, updated_at
		FROM live_events WHERE status = 'live' AND visibility = 'public' ORDER BY started_at DESC LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*models.LiveEvent
	for rows.Next() {
		e, err := scanEvent(rows)
		if err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

// ListEventsForShop returns every status (draft/scheduled/.../ended) for
// one shop — the seller's own dashboard needs to see events ListActiveEvents
// deliberately excludes (only public+live). Authorization that the caller
// actually owns shopID happens in the handler/service layer, not here.
func (r *Repository) ListEventsForShop(ctx context.Context, shopID string, limit int) ([]*models.LiveEvent, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, seller_id, shop_id, title, COALESCE(description, ''), COALESCE(thumbnail_url, ''), status, visibility,
		       scheduled_at, started_at, ended_at, COALESCE(cloudflare_live_input_uid, ''), COALESCE(cloudflare_video_uid, ''),
		       recording_status, peak_viewers, total_unique_viewers, created_at, updated_at
		FROM live_events WHERE shop_id = $1 ORDER BY created_at DESC LIMIT $2
	`, shopID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*models.LiveEvent
	for rows.Next() {
		e, err := scanEvent(rows)
		if err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

// StartLive is idempotent on idempotencyKey (spec §32): if this event was
// already started with the same key, the existing row is returned instead
// of erroring or double-provisioning a Cloudflare Live Input. The caller
// (internal/live/service.go) checks this BEFORE calling Cloudflare, so a
// duplicate tap never reaches the Cloudflare API at all.
func (r *Repository) StartLive(ctx context.Context, eventID, idempotencyKey, cfLiveInputUID string) (*models.LiveEvent, bool, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback(ctx)

	var existingKey *string
	var currentStatus string
	err = tx.QueryRow(ctx, `SELECT start_idempotency_key, status FROM live_events WHERE id = $1 FOR UPDATE`, eventID).
		Scan(&existingKey, &currentStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, false, ErrNotFound
		}
		return nil, false, err
	}

	if existingKey != nil && *existingKey == idempotencyKey {
		e, err := r.GetEvent(ctx, eventID)
		return e, true, err
	}
	if currentStatus == "live" {
		e, err := r.GetEvent(ctx, eventID)
		return e, true, err
	}

	_, err = tx.Exec(ctx, `
		UPDATE live_events SET status = 'live', started_at = now(), updated_at = now(),
		       start_idempotency_key = $1, cloudflare_live_input_uid = $2
		WHERE id = $3
	`, idempotencyKey, cfLiveInputUID, eventID)
	if err != nil {
		return nil, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, false, err
	}
	e, err := r.GetEvent(ctx, eventID)
	return e, false, err
}

func (r *Repository) EndLive(ctx context.Context, eventID, idempotencyKey string, peakViewers, uniqueViewers int) (*models.LiveEvent, bool, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback(ctx)

	var existingKey *string
	var currentStatus string
	err = tx.QueryRow(ctx, `SELECT end_idempotency_key, status FROM live_events WHERE id = $1 FOR UPDATE`, eventID).
		Scan(&existingKey, &currentStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, false, ErrNotFound
		}
		return nil, false, err
	}
	if (existingKey != nil && *existingKey == idempotencyKey) || currentStatus == "ended" {
		e, err := r.GetEvent(ctx, eventID)
		return e, true, err
	}

	_, err = tx.Exec(ctx, `
		UPDATE live_events SET status = 'ended', ended_at = now(), updated_at = now(),
		       end_idempotency_key = $1, peak_viewers = $2, total_unique_viewers = $3
		WHERE id = $4
	`, idempotencyKey, peakViewers, uniqueViewers, eventID)
	if err != nil {
		return nil, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, false, err
	}
	e, err := r.GetEvent(ctx, eventID)
	return e, false, err
}

func (r *Repository) CancelEvent(ctx context.Context, eventID string) error {
	_, err := r.pool.Exec(ctx, `UPDATE live_events SET status = 'cancelled', updated_at = now() WHERE id = $1 AND status IN ('draft','scheduled','ready')`, eventID)
	return err
}

// AttachProduct validates the product belongs to the same shop as the
// live event — reusing products/shops as the source of truth, not a
// second product catalog (spec §11).
func (r *Repository) AttachProduct(ctx context.Context, liveEventID, productID, sellerID string) (*models.LiveProduct, error) {
	var shopMatches bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM products p JOIN live_events le ON le.shop_id = p.shop_id
			WHERE p.id = $1 AND le.id = $2 AND p.status = 'active'
		)`, productID, liveEventID).Scan(&shopMatches)
	if err != nil {
		return nil, err
	}
	if !shopMatches {
		return nil, errors.New("PRODUCT_NOT_IN_SHOP")
	}

	row := r.pool.QueryRow(ctx, `
		INSERT INTO live_products (live_event_id, product_id, seller_id)
		VALUES ($1,$2,$3) ON CONFLICT (live_event_id, product_id) DO UPDATE SET product_id = EXCLUDED.product_id
		RETURNING id, live_event_id, product_id, seller_id, position, featured, featured_at, created_at
	`, liveEventID, productID, sellerID)

	var lp models.LiveProduct
	err = row.Scan(&lp.ID, &lp.LiveEventID, &lp.ProductID, &lp.SellerID, &lp.Position, &lp.Featured, &lp.FeaturedAt, &lp.CreatedAt)
	return &lp, err
}

// FeatureProduct enforces "at most one featured product" at the query
// level via the partial unique index (schema_phase95) — this transaction
// just does the unfeature-then-feature swap atomically.
func (r *Repository) FeatureProduct(ctx context.Context, liveEventID, productID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `UPDATE live_products SET featured = FALSE WHERE live_event_id = $1 AND featured = TRUE`, liveEventID); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `UPDATE live_products SET featured = TRUE, featured_at = now() WHERE live_event_id = $1 AND product_id = $2`, liveEventID, productID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return tx.Commit(ctx)
}

// ListProducts returns every product attached to a live event, joined
// with the real products table for display fields (title/price/image) —
// the Go service never duplicates product data, just reads it live.
func (r *Repository) ListProducts(ctx context.Context, liveEventID string) ([]LiveProductWithDetails, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT lp.id, lp.live_event_id, lp.product_id, lp.position, lp.featured, lp.featured_at,
		       p.title, p.price, p.currency, p.quantity_available
		FROM live_products lp
		JOIN products p ON p.id = lp.product_id
		WHERE lp.live_event_id = $1
		ORDER BY lp.featured DESC, lp.position ASC
	`, liveEventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []LiveProductWithDetails
	for rows.Next() {
		var lp LiveProductWithDetails
		if err := rows.Scan(&lp.ID, &lp.LiveEventID, &lp.ProductID, &lp.Position, &lp.Featured, &lp.FeaturedAt,
			&lp.Title, &lp.Price, &lp.Currency, &lp.QuantityAvailable); err != nil {
			return nil, err
		}
		results = append(results, lp)
	}
	return results, rows.Err()
}

type LiveProductWithDetails struct {
	ID                string     `json:"id"`
	LiveEventID       string     `json:"liveEventId"`
	ProductID         string     `json:"productId"`
	Position          int        `json:"position"`
	Featured          bool       `json:"featured"`
	FeaturedAt        *time.Time `json:"featuredAt,omitempty"`
	Title             string     `json:"title"`
	Price             string     `json:"price"`
	Currency          string     `json:"currency"`
	QuantityAvailable int        `json:"quantityAvailable"`
}

func (r *Repository) SubmitQuestion(ctx context.Context, liveEventID, userID, text string) (*models.LiveQuestion, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO live_questions (live_event_id, user_id, text) VALUES ($1,$2,$3)
		RETURNING id, live_event_id, user_id, text, status, answered_by, answered_at, created_at
	`, liveEventID, userID, text)
	var q models.LiveQuestion
	err := row.Scan(&q.ID, &q.LiveEventID, &q.UserID, &q.Text, &q.Status, &q.AnsweredBy, &q.AnsweredAt, &q.CreatedAt)
	return &q, err
}

// ListPendingQuestions — the seller moderation queue (spec §14).
func (r *Repository) ListPendingQuestions(ctx context.Context, liveEventID string) ([]*models.LiveQuestion, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, live_event_id, user_id, text, status, answered_by, answered_at, created_at
		FROM live_questions WHERE live_event_id = $1 AND status = 'pending' ORDER BY created_at ASC
	`, liveEventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var questions []*models.LiveQuestion
	for rows.Next() {
		var q models.LiveQuestion
		if err := rows.Scan(&q.ID, &q.LiveEventID, &q.UserID, &q.Text, &q.Status, &q.AnsweredBy, &q.AnsweredAt, &q.CreatedAt); err != nil {
			return nil, err
		}
		questions = append(questions, &q)
	}
	return questions, rows.Err()
}

func (r *Repository) AnswerQuestion(ctx context.Context, questionID, answeredBy string) error {
	tag, err := r.pool.Exec(ctx, `UPDATE live_questions SET status = 'answered', answered_by = $1, answered_at = now() WHERE id = $2`, answeredBy, questionID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) RejectQuestion(ctx context.Context, questionID string) error {
	tag, err := r.pool.Exec(ctx, `UPDATE live_questions SET status = 'rejected' WHERE id = $1`, questionID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// RecordViewerJoin is a one-time-per-user write (spec §15: not a
// per-heartbeat write) — ON CONFLICT DO NOTHING makes a reconnect cheap
// and safe.
func (r *Repository) RecordViewerJoin(ctx context.Context, liveEventID string, userID *string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO live_viewers (live_event_id, user_id) VALUES ($1,$2)
		ON CONFLICT (live_event_id, user_id) DO NOTHING
	`, liveEventID, userID)
	return err
}

func (r *Repository) SaveAnalyticsSnapshot(ctx context.Context, liveEventID string, snapshot AnalyticsSnapshot) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO live_analytics (live_event_id, duration_seconds, peak_viewers, total_unique_viewers, chat_messages, questions_count)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (live_event_id) DO UPDATE SET
			duration_seconds = EXCLUDED.duration_seconds, peak_viewers = EXCLUDED.peak_viewers,
			total_unique_viewers = EXCLUDED.total_unique_viewers, chat_messages = EXCLUDED.chat_messages,
			questions_count = EXCLUDED.questions_count, updated_at = now()
	`, liveEventID, snapshot.DurationSeconds, snapshot.PeakViewers, snapshot.TotalUniqueViewers, snapshot.ChatMessages, snapshot.QuestionsCount)
	return err
}

type AnalyticsSnapshot struct {
	DurationSeconds     int
	PeakViewers         int
	TotalUniqueViewers  int
	ChatMessages        int
	QuestionsCount      int
}

type PlatformSettings struct {
	MaxLiveDurationMinutes       int
	MaxRecordingRetentionDays    int
	MaxSimultaneousLives         int
	DefaultMonthlyLiveLimit      int
	RequireSignedPlaybackURLs    bool
}

func (r *Repository) GetPlatformSettings(ctx context.Context) (*PlatformSettings, error) {
	var s PlatformSettings
	err := r.pool.QueryRow(ctx, `
		SELECT max_live_duration_minutes, max_recording_retention_days, max_simultaneous_lives,
		       default_monthly_live_limit, require_signed_playback_urls
		FROM live_platform_settings WHERE id = 1
	`).Scan(&s.MaxLiveDurationMinutes, &s.MaxRecordingRetentionDays, &s.MaxSimultaneousLives,
		&s.DefaultMonthlyLiveLimit, &s.RequireSignedPlaybackURLs)
	return &s, err
}

func (r *Repository) CountLiveEventsNow(ctx context.Context) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM live_events WHERE status = 'live'`).Scan(&n)
	return n, err
}

// NotifyFollowersLiveStarted reuses the existing notifications table
// (spec §23: "do not create a second notification system") — one INSERT
// ... SELECT rather than one round trip per follower, joined against
// shops for the display name rather than requiring the caller to fetch
// and pass it separately. Best-effort: the caller (handlers/live.go's
// StartLive) does not fail the whole request if this errors, since a
// notification failure shouldn't stop a seller from actually going live.
func (r *Repository) NotifyFollowersLiveStarted(ctx context.Context, shopID, eventID, eventTitle string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO notifications (user_id, type, title, body, metadata)
		SELECT sf.user_id, 'seller_went_live', s.name || ' is live', $3,
		       jsonb_build_object('liveEventId', $2, 'shopId', $1)
		FROM shop_follows sf
		JOIN shops s ON s.id = $1
		WHERE sf.shop_id = $1
	`, shopID, eventID, eventTitle)
	return err
}
