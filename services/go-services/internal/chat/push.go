package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// PushNotifier abstracts "notify this user they have a new message" so
// handlers.go doesn't need to know HOW that happens. The concrete
// implementation below calls back into Node; a nil PushNotifier (see
// cmd/chat/main.go) simply means push is disabled, same as
// isPushConfigured() returning false does in pushService.js today.
type PushNotifier interface {
	NotifyNewMessage(recipientUserID, senderUserID string, senderIsAdmin bool, messageBody, conversationID string)
}

// HTTPPushNotifier calls POST {NodeInternalURL}/internal/push/chat-message
// on the Node backend, authenticated the same way go-affiliate
// authenticates its calls (a shared secret header, constant-time
// compared on Node's side). This keeps Firebase entirely inside Node — no
// service account JSON, no firebase-admin-equivalent Go SDK, no
// duplicated credential surface. See go-services/README.md "Push
// notifications" for the small Node-side route this expects to exist
// (NOT yet added to server.js — see the README's integration steps).
type HTTPPushNotifier struct {
	client       *http.Client
	baseURL      string
	sharedSecret string
}

func NewHTTPPushNotifier(baseURL, sharedSecret string) *HTTPPushNotifier {
	return &HTTPPushNotifier{
		client:       &http.Client{Timeout: 5 * time.Second},
		baseURL:      baseURL,
		sharedSecret: sharedSecret,
	}
}

type pushChatMessageBody struct {
	RecipientUserID string `json:"recipientUserId"`
	SenderUserID    string `json:"senderUserId"`
	SenderIsAdmin   bool   `json:"senderIsAdmin"`
	MessageBody     string `json:"messageBody"`
	ConversationID  string `json:"conversationId"`
}

// NotifyNewMessage is fire-and-forget from the caller's perspective
// (handlers.go calls this via `go s.pushNotifier.NotifyNewMessage(...)`) —
// matches the original's own "non-fatal" push-notify pattern
// ((async () => {...})().catch(...)) exactly: a push failure must never
// affect message delivery, which has already succeeded by the time this
// runs.
func (n *HTTPPushNotifier) NotifyNewMessage(recipientUserID, senderUserID string, senderIsAdmin bool, messageBody, conversationID string) {
	if n == nil || n.baseURL == "" {
		return
	}
	body := pushChatMessageBody{
		RecipientUserID: recipientUserID,
		SenderUserID:    senderUserID,
		SenderIsAdmin:   senderIsAdmin,
		MessageBody:     messageBody,
		ConversationID:  conversationID,
	}
	payload, err := json.Marshal(body)
	if err != nil {
		log.Printf("chat: push notify marshal error: %v", err)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.baseURL+"/internal/push/chat-message", bytes.NewReader(payload))
	if err != nil {
		log.Printf("chat: push notify request build error: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Secret", n.sharedSecret)

	resp, err := n.client.Do(req)
	if err != nil {
		log.Printf("chat: push notify error (non-fatal): %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		log.Printf("chat: push notify non-2xx response: %d", resp.StatusCode)
	}
}
