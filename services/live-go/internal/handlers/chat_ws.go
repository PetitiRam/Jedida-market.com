package handlers

import (
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"jedida.com/live/internal/chat"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Auth happens via the first-message handshake below, not at upgrade
	// time — so origin checking here isn't the security boundary either.
	// Tighten if this ever needs to be origin-restricted for other reasons.
	CheckOrigin: func(r *http.Request) bool { return true },
}

type ChatWSHandler struct {
	hub    *chat.Hub
	secret string
}

func NewChatWSHandler(hub *chat.Hub, jwtSecret string) *ChatWSHandler {
	return &ChatWSHandler{hub: hub, secret: jwtSecret}
}

type authHandshake struct {
	Type  string `json:"type"`
	Token string `json:"token"`
}

// Serve upgrades the connection unauthenticated (browsers cannot set an
// Authorization header on a WebSocket handshake, and a ?token= query
// param would end up in this service's own access logs — see
// cmd/live/main.go's middleware.Logger) then requires the FIRST frame
// sent to be {"type":"auth","token":"<access token>"}, validated with the
// exact same check RequireAuth uses for normal HTTP requests. Anything
// else as the first frame, or silence past the timeout, closes the
// connection without ever reaching the chat hub.
func (h *ChatWSHandler) Serve(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("live chat: websocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	var handshake authHandshake
	if err := conn.ReadJSON(&handshake); err != nil || handshake.Type != "auth" || handshake.Token == "" {
		_ = conn.WriteJSON(map[string]string{"type": "error", "text": "Expected an auth message first."})
		return
	}
	user, err := ValidateToken(h.secret, handshake.Token)
	if err != nil {
		_ = conn.WriteJSON(map[string]string{"type": "error", "text": "Invalid or expired token."})
		return
	}
	_ = conn.SetReadDeadline(time.Time{}) // clear the handshake-only deadline for the rest of the connection's life

	_ = conn.WriteJSON(map[string]string{"type": "auth_ok"})
	h.hub.Join(r.Context(), eventID, user.UserID, conn)
}
