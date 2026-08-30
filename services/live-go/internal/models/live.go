package models

import "time"

type LiveEventStatus string

const (
	StatusDraft     LiveEventStatus = "draft"
	StatusScheduled LiveEventStatus = "scheduled"
	StatusReady     LiveEventStatus = "ready"
	StatusLive      LiveEventStatus = "live"
	StatusEnding    LiveEventStatus = "ending"
	StatusEnded     LiveEventStatus = "ended"
	StatusCancelled LiveEventStatus = "cancelled"
	StatusSuspended LiveEventStatus = "suspended"
)

// LiveEvent mirrors live_events (schema_phase95_live_shopping.sql).
// StreamKey is intentionally NOT a field here — it is never loaded from
// the database into this struct outside the one broadcaster-credential
// handler that needs it (see internal/handlers/live.go), and is never
// serialized in any list/detail response. See spec §7/§19.
type LiveEvent struct {
	ID                     string          `json:"id"`
	SellerID               string          `json:"sellerId"`
	ShopID                 string          `json:"shopId"`
	Title                  string          `json:"title"`
	Description            string          `json:"description,omitempty"`
	ThumbnailURL           string          `json:"thumbnailUrl,omitempty"`
	Status                 LiveEventStatus `json:"status"`
	Visibility             string          `json:"visibility"`
	ScheduledAt            *time.Time      `json:"scheduledAt,omitempty"`
	StartedAt              *time.Time      `json:"startedAt,omitempty"`
	EndedAt                *time.Time      `json:"endedAt,omitempty"`
	CloudflareLiveInputUID string          `json:"-"` // internal only — never serialized to any client
	CloudflareVideoUID     string          `json:"videoUid,omitempty"`
	RecordingStatus        string          `json:"recordingStatus"`
	PeakViewers            int             `json:"peakViewers"`
	TotalUniqueViewers     int             `json:"totalUniqueViewers"`
	CreatedAt              time.Time       `json:"createdAt"`
	UpdatedAt              time.Time       `json:"updatedAt"`
}

type LiveProduct struct {
	ID          string     `json:"id"`
	LiveEventID string     `json:"liveEventId"`
	ProductID   string     `json:"productId"`
	SellerID    string     `json:"-"`
	Position    int        `json:"position"`
	Featured    bool       `json:"featured"`
	FeaturedAt  *time.Time `json:"featuredAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
}

type QuestionStatus string

const (
	QuestionPending  QuestionStatus = "pending"
	QuestionApproved QuestionStatus = "approved"
	QuestionAnswered QuestionStatus = "answered"
	QuestionRejected QuestionStatus = "rejected"
)

type LiveQuestion struct {
	ID          string         `json:"id"`
	LiveEventID string         `json:"liveEventId"`
	UserID      string         `json:"userId"`
	Text        string         `json:"text"`
	Status      QuestionStatus `json:"status"`
	AnsweredBy  *string        `json:"answeredBy,omitempty"`
	AnsweredAt  *time.Time     `json:"answeredAt,omitempty"`
	CreatedAt   time.Time      `json:"createdAt"`
}

// AuthedUser is what the JWT middleware attaches to each request — the
// same claim shape backend/src/utils/jwt.js signs (sub/role/isAdmin).
type AuthedUser struct {
	UserID   string
	Role     string
	IsAdmin  bool
	AdminRole string
}
