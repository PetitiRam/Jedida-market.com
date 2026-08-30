package chat

import "time"

// AuthedUser is the identity established from the verified JWT — never
// trusted from client-supplied fields. Mirrors backend/src/middleware/auth.js's
// req.user shape.
type AuthedUser struct {
	ID      string
	Role    string
	IsAdmin bool
}

// Inbound is the envelope every client->server WebSocket frame must use.
// `type` mirrors the existing Socket.IO event names 1:1 (e.g. "message:send",
// "conversation:join") so the frontend's event vocabulary doesn't change —
// only the transport does. `requestId` is optional; if present, the server
// echoes it back in the ack so the client can correlate request/response the
// way a Socket.IO acknowledgement callback would.
type Inbound struct {
	Type      string         `json:"type"`
	RequestID string         `json:"requestId,omitempty"`
	Payload   InboundPayload `json:"payload"`
}

// InboundPayload holds the union of possible fields across event types.
// Only the fields relevant to `Type` are read; the rest are ignored. This
// keeps decoding simple without needing a discriminated-union library.
type InboundPayload struct {
	ConversationID         string `json:"conversationId,omitempty"`
	InternalConversationID string `json:"internalConversationId,omitempty"`
	Body                   string `json:"body,omitempty"`
	MessageType            string `json:"messageType,omitempty"`
	AttachmentURL          string `json:"attachmentUrl,omitempty"`
	ReplyToID              string `json:"replyToId,omitempty"`
	MessageID              string `json:"messageId,omitempty"`
	Emoji                  string `json:"emoji,omitempty"`
	NewBody                string `json:"newBody,omitempty"`
	TargetConversationID   string `json:"targetConversationId,omitempty"`
	LinkID                 string `json:"linkId,omitempty"`
	SenderConversationID   string `json:"senderConversationId,omitempty"`
}

// Outbound is the envelope every server->client frame uses.
type Outbound struct {
	Type      string      `json:"type"`
	RequestID string      `json:"requestId,omitempty"`
	Payload   interface{} `json:"payload,omitempty"`
	Error     string      `json:"error,omitempty"`
}

// Message mirrors the RAW row shape chatService.js's saveMessage (and every
// sibling function — reactToMessage, editMessage, forwardMessage, etc.)
// returns straight from Postgres. Node never camelCases these before
// emitting them over Socket.IO (`io.to(room).emit('message:new', message)`
// emits the pg row as-is), and the frontend's useChatSocket.js reads them
// as such (`msg.sender_id`, `m.deleted_for_everyone`, ...). Using the same
// snake_case field names here — rather than idiomatic Go camelCase — is
// deliberate: it's what makes a future frontend integration a transport
// swap instead of also a payload-shape rewrite.
type Message struct {
	ID                  string                 `json:"id"`
	ConversationID      string                 `json:"conversation_id"`
	UserID              string                 `json:"user_id,omitempty"`
	SenderID            string                 `json:"sender_id"`
	Body                string                 `json:"body"`
	MessageType         string                 `json:"message_type"`
	ReplyToID           *string                `json:"reply_to_id,omitempty"`
	Status              string                 `json:"status"`
	CreatedAt           time.Time              `json:"created_at"`
	Reactions           map[string]interface{} `json:"reactions,omitempty"`
	EditedAt            *time.Time             `json:"edited_at,omitempty"`
	DeletedForEveryone  bool                   `json:"deleted_for_everyone"`
	Pinned              bool                   `json:"pinned"`
	AttachmentURL       *string                `json:"attachment_url,omitempty"`
	AttachmentMeta      map[string]interface{} `json:"attachment_meta,omitempty"`
	ForwardedFromID     *string                `json:"forwarded_from_id,omitempty"`
	ModerationStatus    string                 `json:"moderation_status,omitempty"`
}

// Bridge mirrors a chat_bridges row — an admin-created link fanning a
// buyer-side conversation and a seller-side conversation into each other.
type Bridge struct {
	ID                   string
	BuyerConversationID  string
	SellerConversationID string
}

// Conversation is the minimal shape needed to check participancy and to
// figure out who the "other" participant is for presence/notifications.
type Conversation struct {
	ID       string
	UserID   string
	SellerID *string
	Status   string
}

func ackOK(requestID string, msgType string, payload interface{}) Outbound {
	return Outbound{Type: msgType, RequestID: requestID, Payload: payload}
}

func ackErr(requestID string, msgType string, err error) Outbound {
	return Outbound{Type: msgType, RequestID: requestID, Error: err.Error()}
}
