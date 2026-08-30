package live

import (
	"context"
	"errors"
	"fmt"

	"jedida.com/live/internal/chat"
	"jedida.com/live/internal/cloudflare"
	"jedida.com/live/internal/models"
	"jedida.com/live/internal/repository"
)

var (
	ErrNotEligible      = errors.New("shop is not eligible for Live Shopping")
	ErrCapacityExceeded = errors.New("maximum simultaneous live events reached")
	ErrForbidden        = errors.New("not authorized for this live event")
)

type Service struct {
	repo           *repository.Repository
	cf             *cloudflare.Client
	cfCustomerCode string
}

func New(repo *repository.Repository, cf *cloudflare.Client, cfCustomerCode string) *Service {
	return &Service{repo: repo, cf: cf, cfCustomerCode: cfCustomerCode}
}

func (s *Service) CreateEvent(ctx context.Context, sellerID string, p repository.CreateEventParams) (*models.LiveEvent, error) {
	p.SellerID = sellerID
	owns, err := s.repo.SellerOwnsShop(ctx, sellerID, p.ShopID)
	if err != nil {
		return nil, fmt.Errorf("check shop ownership: %w", err)
	}
	if !owns {
		return nil, ErrForbidden
	}
	enabled, err := s.repo.LiveEnabledForShop(ctx, p.ShopID)
	if err != nil {
		return nil, fmt.Errorf("check live eligibility: %w", err)
	}
	if !enabled {
		return nil, ErrNotEligible
	}
	if p.Visibility == "" {
		p.Visibility = "public"
	}
	return s.repo.CreateEvent(ctx, p)
}

// StartLive is the flow from spec §5: check eligibility → create
// Cloudflare Live Input → store the UID → hand broadcaster credentials
// back once. idempotencyKey comes from the client (generated once per
// "Start Live" tap) so a double-tap or a retried request after a dropped
// response can never create two Cloudflare Live Inputs for one event.
//
// Returns the event AND the raw stream key/RTMPS URL — the ONLY place in
// this service where the stream key exists as a Go value. The HTTP
// handler must return it once to the seller and never log or persist it.
func (s *Service) StartLive(ctx context.Context, eventID, sellerID, idempotencyKey string) (*models.LiveEvent, *cloudflare.LiveInput, bool, error) {
	event, err := s.repo.GetEvent(ctx, eventID)
	if err != nil {
		return nil, nil, false, err
	}
	if event.SellerID != sellerID {
		return nil, nil, false, ErrForbidden
	}

	settings, err := s.repo.GetPlatformSettings(ctx)
	if err != nil {
		return nil, nil, false, fmt.Errorf("load platform settings: %w", err)
	}

	// If this exact idempotency key already started this event, we must
	// still be able to hand the seller their credentials again (e.g. app
	// restarted mid-broadcast-setup) — fetch the existing Cloudflare Live
	// Input rather than re-creating it. Not a fresh start — followers were
	// already notified the first time.
	if event.Status == models.StatusLive && event.CloudflareLiveInputUID != "" {
		input, err := s.cf.GetLiveInput(ctx, event.CloudflareLiveInputUID)
		return event, input, false, err
	}

	count, err := s.repo.CountLiveEventsNow(ctx)
	if err != nil {
		return nil, nil, false, fmt.Errorf("count active lives: %w", err)
	}
	if count >= settings.MaxSimultaneousLives {
		return nil, nil, false, ErrCapacityExceeded
	}

	input, err := s.cf.CreateLiveInput(ctx, eventID, settings.RequireSignedPlaybackURLs, settings.MaxRecordingRetentionDays)
	if err != nil {
		return nil, nil, false, fmt.Errorf("create cloudflare live input: %w", err)
	}

	updated, replay, err := s.repo.StartLive(ctx, eventID, idempotencyKey, input.UID)
	if err != nil {
		return nil, nil, false, err
	}
	if replay {
		// Someone else's concurrent request won the race and already
		// recorded a different (or the same) Live Input — don't leave an
		// orphaned Cloudflare resource behind if it wasn't ours that won.
		// Not a fresh start either way — the winner's request already
		// triggers (or already triggered) the follower notification.
		if updated.CloudflareLiveInputUID != input.UID {
			_ = s.cf.DeleteLiveInput(ctx, input.UID)
			existingInput, err := s.cf.GetLiveInput(ctx, updated.CloudflareLiveInputUID)
			return updated, existingInput, false, err
		}
	}

	return updated, input, true, nil
}

// EndLive per spec §17: update status, disable the Live Input, and let
// the caller (handlers/live.go) trigger notification/analytics
// finalization — kept out of this function so a Cloudflare failure here
// doesn't also block those from running (best-effort, not all-or-nothing).
func (s *Service) EndLive(ctx context.Context, eventID, sellerID, idempotencyKey string, peakViewers, uniqueViewers int) (*models.LiveEvent, error) {
	event, err := s.repo.GetEvent(ctx, eventID)
	if err != nil {
		return nil, err
	}
	if event.SellerID != sellerID {
		return nil, ErrForbidden
	}

	updated, replay, err := s.repo.EndLive(ctx, eventID, idempotencyKey, peakViewers, uniqueViewers)
	if err != nil {
		return nil, err
	}
	if !replay && event.CloudflareLiveInputUID != "" {
		if err := s.cf.DisableLiveInput(ctx, event.CloudflareLiveInputUID); err != nil {
			// Non-fatal: the Jedida-side event is already correctly
			// marked ended, which is what viewers/sellers see. A
			// Cloudflare-side disable failure is an operational cleanup
			// issue, logged by the handler, not a reason to tell the
			// seller their Live didn't end.
			return updated, fmt.Errorf("event ended, but disabling cloudflare live input failed: %w", err)
		}
	}
	return updated, nil
}

func (s *Service) CancelEvent(ctx context.Context, eventID, sellerID string) error {
	event, err := s.repo.GetEvent(ctx, eventID)
	if err != nil {
		return err
	}
	if event.SellerID != sellerID {
		return ErrForbidden
	}
	return s.repo.CancelEvent(ctx, eventID)
}

func (s *Service) AttachProduct(ctx context.Context, eventID, sellerID, productID string) (*models.LiveProduct, error) {
	event, err := s.repo.GetEvent(ctx, eventID)
	if err != nil {
		return nil, err
	}
	if event.SellerID != sellerID {
		return nil, ErrForbidden
	}
	return s.repo.AttachProduct(ctx, eventID, productID, sellerID)
}

func (s *Service) FeatureProduct(ctx context.Context, eventID, sellerID, productID string) error {
	event, err := s.repo.GetEvent(ctx, eventID)
	if err != nil {
		return err
	}
	if event.SellerID != sellerID {
		return ErrForbidden
	}
	return s.repo.FeatureProduct(ctx, eventID, productID)
}

func (s *Service) ListActiveEvents(ctx context.Context) ([]*models.LiveEvent, error) {
	return s.repo.ListActiveEvents(ctx, 50)
}

// ListMyEvents is the seller-dashboard equivalent of ListActiveEvents —
// every status, scoped to shops the caller actually owns.
func (s *Service) ListMyEvents(ctx context.Context, sellerID, shopID string) ([]*models.LiveEvent, error) {
	owns, err := s.repo.SellerOwnsShop(ctx, sellerID, shopID)
	if err != nil {
		return nil, fmt.Errorf("check shop ownership: %w", err)
	}
	if !owns {
		return nil, ErrForbidden
	}
	return s.repo.ListEventsForShop(ctx, shopID, 100)
}

// NotifyFollowers — spec §23. Called by the handler after StartLive
// succeeds, deliberately not inside StartLive itself: a notification
// failure must never be the reason a seller's "Start Live" tap fails.
func (s *Service) NotifyFollowers(ctx context.Context, event *models.LiveEvent) error {
	return s.repo.NotifyFollowersLiveStarted(ctx, event.ShopID, event.ID, event.Title)
}

func (s *Service) ListProducts(ctx context.Context, eventID string) ([]repository.LiveProductWithDetails, error) {
	return s.repo.ListProducts(ctx, eventID)
}

func (s *Service) GetEvent(ctx context.Context, eventID string) (*models.LiveEvent, error) {
	return s.repo.GetEvent(ctx, eventID)
}

// PlaybackInfo is the viewer-safe shape — never a stream key, never a
// broadcaster-only field. See handlers/live.go's GetPlayback for why this
// is a separate endpoint from GetEvent.
type PlaybackInfo struct {
	Status            models.LiveEventStatus `json:"status"`
	PlaybackID        string                 `json:"playbackId,omitempty"` // live input UID while live, video UID once ended+ready
	SignedToken       string                 `json:"signedToken,omitempty"`
	CustomerCode      string                 `json:"customerCode,omitempty"`
	RecordingStatus   string                 `json:"recordingStatus"`
}

func (s *Service) GetPlaybackInfo(ctx context.Context, eventID string) (*PlaybackInfo, error) {
	event, err := s.repo.GetEvent(ctx, eventID)
	if err != nil {
		return nil, err
	}
	settings, err := s.repo.GetPlatformSettings(ctx)
	if err != nil {
		return nil, fmt.Errorf("load platform settings: %w", err)
	}

	info := &PlaybackInfo{Status: event.Status, RecordingStatus: event.RecordingStatus, CustomerCode: s.cfCustomerCode}

	switch event.Status {
	case models.StatusLive:
		if event.CloudflareLiveInputUID == "" {
			return info, nil
		}
		info.PlaybackID = event.CloudflareLiveInputUID
	case models.StatusEnded:
		if event.CloudflareVideoUID == "" {
			return info, nil // recording not yet associated — see EndLive/recording-association gap in phase notes
		}
		info.PlaybackID = event.CloudflareVideoUID
	default:
		return info, nil // draft/scheduled/ready/cancelled — nothing playable yet
	}

	if settings.RequireSignedPlaybackURLs {
		token, err := s.cf.SignedPlaybackToken(ctx, info.PlaybackID, 3600)
		if err != nil {
			return nil, fmt.Errorf("generate signed playback token: %w", err)
		}
		info.SignedToken = token
	}
	return info, nil
}

// SaveAnalyticsSnapshotFromHub persists the in-memory presence/message
// counters the chat hub has been tracking (spec §15/§24) — called once,
// at EndLive, not on any regular interval, since these are cheap in-memory
// reads that only need to become durable once the live is actually over.
// Duration is computed from started_at/ended_at now that both are set.
func (s *Service) SaveAnalyticsSnapshotFromHub(ctx context.Context, eventID string, hub *chat.Hub) error {
	event, err := s.repo.GetEvent(ctx, eventID)
	if err != nil {
		return err
	}
	duration := 0
	if event.StartedAt != nil && event.EndedAt != nil {
		duration = int(event.EndedAt.Sub(*event.StartedAt).Seconds())
	}
	return s.repo.SaveAnalyticsSnapshot(ctx, eventID, repository.AnalyticsSnapshot{
		DurationSeconds:    duration,
		PeakViewers:        hub.PeakViewers(eventID),
		TotalUniqueViewers: hub.UniqueViewerCount(eventID),
		ChatMessages:       hub.MessageCount(eventID),
	})
}
