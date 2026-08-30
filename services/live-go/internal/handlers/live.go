package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"jedida.com/live/internal/chat"
	"jedida.com/live/internal/live"
	"jedida.com/live/internal/repository"
)

type LiveHandler struct {
	svc *live.Service
	hub *chat.Hub
}

func NewLiveHandler(svc *live.Service, hub *chat.Hub) *LiveHandler {
	return &LiveHandler{svc: svc, hub: hub}
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func mapServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, repository.ErrNotFound):
		writeError(w, http.StatusNotFound, "Live event not found.")
	case errors.Is(err, live.ErrForbidden):
		writeError(w, http.StatusForbidden, "You don't have access to this live event.")
	case errors.Is(err, live.ErrNotEligible):
		writeError(w, http.StatusForbidden, "Live Shopping isn't enabled for this shop. Enable it from Shop Settings first.")
	case errors.Is(err, live.ErrCapacityExceeded):
		writeError(w, http.StatusServiceUnavailable, "The platform's maximum number of simultaneous live events has been reached. Try again shortly.")
	default:
		writeError(w, http.StatusInternalServerError, "Something went wrong.")
	}
}

func (h *LiveHandler) CreateEvent(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFromContext(r)
	var body struct {
		ShopID       string     `json:"shopId"`
		Title        string     `json:"title"`
		Description  string     `json:"description"`
		ThumbnailURL string     `json:"thumbnailUrl"`
		ScheduledAt  *time.Time `json:"scheduledAt"`
		Visibility   string     `json:"visibility"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body.")
		return
	}
	if body.Title == "" || body.ShopID == "" {
		writeError(w, http.StatusBadRequest, "shopId and title are required.")
		return
	}

	event, err := h.svc.CreateEvent(r.Context(), user.UserID, repository.CreateEventParams{
		ShopID: body.ShopID, Title: body.Title, Description: body.Description,
		ThumbnailURL: body.ThumbnailURL, ScheduledAt: body.ScheduledAt, Visibility: body.Visibility,
	})
	if err != nil {
		mapServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, event)
}

func (h *LiveHandler) ListActive(w http.ResponseWriter, r *http.Request) {
	events, err := h.svc.ListActiveEvents(r.Context())
	if err != nil {
		mapServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"events": events})
}

// ListMyEvents — seller dashboard listing, all statuses, own shop only.
func (h *LiveHandler) ListMyEvents(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFromContext(r)
	shopID := r.URL.Query().Get("shopId")
	if shopID == "" {
		writeError(w, http.StatusBadRequest, "shopId is required.")
		return
	}
	events, err := h.svc.ListMyEvents(r.Context(), user.UserID, shopID)
	if err != nil {
		mapServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"events": events})
}

func (h *LiveHandler) GetEvent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	event, err := h.svc.GetEvent(r.Context(), id)
	if err != nil {
		mapServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, event)
}

// StartLive is the ONLY handler that returns the raw broadcaster
// credentials (spec §7) — this response must never be logged in full and
// the frontend must never persist it beyond what the broadcaster software
// needs at that moment.
func (h *LiveHandler) StartLive(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFromContext(r)
	id := chi.URLParam(r, "id")
	var body struct {
		IdempotencyKey string `json:"idempotencyKey"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.IdempotencyKey == "" {
		body.IdempotencyKey = uuid.NewString() // still safe, just means this exact call can't itself be deduped by the client
	}

	event, input, freshStart, err := h.svc.StartLive(r.Context(), id, user.UserID, body.IdempotencyKey)
	if err != nil {
		mapServiceError(w, err)
		return
	}
	if freshStart {
		// Best-effort, deliberately not awaited on the response path — a
		// slow or failed follower-notification query must never delay or
		// break the seller's "Start Live" response.
		go func() {
			if err := h.svc.NotifyFollowers(context.Background(), event); err != nil {
				log.Printf("live: failed to notify followers for event %s: %v", event.ID, err)
			}
		}()
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"event": event,
		"broadcaster": map[string]interface{}{
			"rtmpsUrl":  input.RTMPS.URL,
			"streamKey": input.RTMPS.StreamKey,
			"srtUrl":    input.SRT.URL,
		},
	})
}

func (h *LiveHandler) EndLive(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFromContext(r)
	id := chi.URLParam(r, "id")
	var body struct {
		IdempotencyKey string `json:"idempotencyKey"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.IdempotencyKey == "" {
		body.IdempotencyKey = uuid.NewString()
	}

	peak := h.hub.PeakViewers(id)
	unique := h.hub.UniqueViewerCount(id)

	event, err := h.svc.EndLive(r.Context(), id, user.UserID, body.IdempotencyKey, peak, unique)
	if err != nil && event == nil {
		mapServiceError(w, err)
		return
	}
	// Finalize analytics best-effort even if Cloudflare disable above
	// failed (see live.Service.EndLive's comment) — the Jedida-side
	// record should still be as complete as possible.
	_ = h.svc.SaveAnalyticsSnapshotFromHub(r.Context(), id, h.hub)

	writeJSON(w, http.StatusOK, event)
}

func (h *LiveHandler) CancelEvent(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFromContext(r)
	id := chi.URLParam(r, "id")
	if err := h.svc.CancelEvent(r.Context(), id, user.UserID); err != nil {
		mapServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"cancelled": true})
}

// GetPlayback is deliberately separate from GetEvent (spec §30) — it's the
// ONLY viewer-facing endpoint allowed to return a playable video
// identifier, and it never returns the stream key (that only ever leaves
// this service once, from StartLive, to the broadcasting seller). Any
// authenticated viewer can call this for a public live event; a private
// one would need an authorization check this pass doesn't add yet (see
// LIVE_SHOPPING_PHASE1_NOTES.md — requireSignedURLs is read from
// platform settings but per-viewer authorization for private events isn't
// built).
func (h *LiveHandler) GetPlayback(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	playback, err := h.svc.GetPlaybackInfo(r.Context(), id)
	if err != nil {
		mapServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, playback)
}

func (h *LiveHandler) ListProducts(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	products, err := h.svc.ListProducts(r.Context(), id)
	if err != nil {
		mapServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"products": products})
}

func (h *LiveHandler) AttachProduct(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFromContext(r)
	id := chi.URLParam(r, "id")
	var body struct {
		ProductID string `json:"productId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ProductID == "" {
		writeError(w, http.StatusBadRequest, "productId is required.")
		return
	}
	lp, err := h.svc.AttachProduct(r.Context(), id, user.UserID, body.ProductID)
	if err != nil {
		mapServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, lp)
}

func (h *LiveHandler) FeatureProduct(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFromContext(r)
	id := chi.URLParam(r, "id")
	productID := chi.URLParam(r, "productId")
	if err := h.svc.FeatureProduct(r.Context(), id, user.UserID, productID); err != nil {
		mapServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"featured": true})
}

func (h *LiveHandler) SubmitQuestion(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFromContext(r)
	id := chi.URLParam(r, "id")
	var body struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Text == "" {
		writeError(w, http.StatusBadRequest, "text is required.")
		return
	}
	q, err := h.svc.SubmitQuestion(r.Context(), id, user.UserID, body.Text)
	if err != nil {
		mapServiceError(w, err)
		return
	}
	h.hub.BroadcastQuestion(id, q.ID, q.UserID, q.Text)
	writeJSON(w, http.StatusCreated, q)
}

// ListPendingQuestions — seller moderation queue (spec §14). Not
// realtime-pushed to the seller dashboard this pass (SubmitQuestion does
// push a system message over the WebSocket, but LiveDashboardPanel.jsx
// doesn't open a WS connection — it polls this endpoint instead, same
// interval as the product-list refresh).
func (h *LiveHandler) ListPendingQuestions(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFromContext(r)
	id := chi.URLParam(r, "id")
	questions, err := h.svc.ListPendingQuestions(r.Context(), id, user.UserID)
	if err != nil {
		mapServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"questions": questions})
}

func (h *LiveHandler) AnswerQuestion(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFromContext(r)
	eventID := chi.URLParam(r, "id")
	questionID := chi.URLParam(r, "questionId")
	if err := h.svc.AnswerQuestion(r.Context(), eventID, questionID, user.UserID); err != nil {
		mapServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"answered": true})
}

func (h *LiveHandler) RejectQuestion(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFromContext(r)
	eventID := chi.URLParam(r, "id")
	questionID := chi.URLParam(r, "questionId")
	if err := h.svc.RejectQuestion(r.Context(), eventID, questionID, user.UserID); err != nil {
		mapServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"rejected": true})
}
