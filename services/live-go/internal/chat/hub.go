// Package chat implements the realtime layer for one live event: chat
// messages and live viewer presence, broadcast over WebSockets rather
// than polled (spec §13). Presence is deliberately in-memory only (spec
// §15: "do not repeatedly query PostgreSQL to calculate the live viewer
// count") — a process restart loses the live count, which is acceptable
// for a number that's inherently a live approximation, not a financial
// record.
//
// v1 scope: connect, broadcast chat messages, live viewer count,
// first-join persistence to live_viewers. NOT implemented yet: mute
// lists, slow mode, pinned messages, blocked-user enforcement (spec §13
// lists these — they need a moderation-state store this pass didn't
// build). A message from a user who should be muted/blocked is not
// currently filtered by this hub — that enforcement has to be added
// before this goes to production with real moderation requirements.
package chat

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"jedida.com/live/internal/repository"
)

type MessageType string

const (
	MsgChat        MessageType = "chat"
	MsgViewerCount MessageType = "viewer_count"
	MsgSystem      MessageType = "system"
)

type OutboundMessage struct {
	Type      MessageType `json:"type"`
	UserID    string      `json:"userId,omitempty"`
	Text      string      `json:"text,omitempty"`
	Count     int         `json:"count,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
}

type client struct {
	conn   *websocket.Conn
	send   chan OutboundMessage
	userID string
}

// eventRoom holds all connections for one live event.
type eventRoom struct {
	mu           sync.RWMutex
	clients      map[*client]bool
	uniqueUsers  map[string]bool
	peakViewers  int
	messageCount int
}

type Hub struct {
	mu    sync.RWMutex
	rooms map[string]*eventRoom
	repo  *repository.Repository
}

func NewHub(repo *repository.Repository) *Hub {
	return &Hub{
		rooms: make(map[string]*eventRoom),
		repo:  repo,
	}
}

func (h *Hub) roomFor(eventID string) *eventRoom {
	h.mu.Lock()
	defer h.mu.Unlock()
	r, ok := h.rooms[eventID]
	if !ok {
		r = &eventRoom{clients: make(map[*client]bool), uniqueUsers: make(map[string]bool)}
		h.rooms[eventID] = r
	}
	return r
}

// CurrentViewerCount, PeakViewers, MessageCount — read at EndLive time to
// populate live_analytics (spec §24) without ever having written a row
// per heartbeat.
func (h *Hub) CurrentViewerCount(eventID string) int {
	h.mu.RLock()
	r, ok := h.rooms[eventID]
	h.mu.RUnlock()
	if !ok {
		return 0
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients)
}

func (h *Hub) PeakViewers(eventID string) int {
	h.mu.RLock()
	r, ok := h.rooms[eventID]
	h.mu.RUnlock()
	if !ok {
		return 0
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.peakViewers
}

func (h *Hub) UniqueViewerCount(eventID string) int {
	h.mu.RLock()
	r, ok := h.rooms[eventID]
	h.mu.RUnlock()
	if !ok {
		return 0
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.uniqueUsers)
}

func (h *Hub) MessageCount(eventID string) int {
	h.mu.RLock()
	r, ok := h.rooms[eventID]
	h.mu.RUnlock()
	if !ok {
		return 0
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.messageCount
}

// Join registers a new WebSocket connection for a live event, starts its
// read/write pumps, and blocks until the connection closes. Call this
// from the HTTP handler after upgrading the connection.
func (h *Hub) Join(ctx context.Context, eventID, userID string, conn *websocket.Conn) {
	room := h.roomFor(eventID)
	c := &client{conn: conn, send: make(chan OutboundMessage, 32), userID: userID}

	room.mu.Lock()
	room.clients[c] = true
	if userID != "" {
		room.uniqueUsers[userID] = true
	}
	count := len(room.clients)
	if count > room.peakViewers {
		room.peakViewers = count
	}
	room.mu.Unlock()

	if userID != "" {
		var uid *string = &userID
		if err := h.repo.RecordViewerJoin(ctx, eventID, uid); err != nil {
			log.Printf("live chat: failed to record viewer join for event %s: %v", eventID, err)
		}
	}

	h.broadcastViewerCount(eventID)

	done := make(chan struct{})
	go c.writePump(done)
	h.readPump(ctx, eventID, room, c)
	close(done)

	room.mu.Lock()
	delete(room.clients, c)
	newCount := len(room.clients)
	room.mu.Unlock()
	close(c.send)

	h.broadcastCount(eventID, newCount)
}

func (h *Hub) readPump(ctx context.Context, eventID string, room *eventRoom, c *client) {
	for {
		var inbound struct {
			Text string `json:"text"`
		}
		if err := c.conn.ReadJSON(&inbound); err != nil {
			return // connection closed or malformed frame — either way, stop reading
		}
		if inbound.Text == "" {
			continue
		}
		room.mu.Lock()
		room.messageCount++
		room.mu.Unlock()

		msg := OutboundMessage{Type: MsgChat, UserID: c.userID, Text: inbound.Text, Timestamp: time.Now()}
		h.broadcast(eventID, msg)
	}
}

func (c *client) writePump(done <-chan struct{}) {
	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				return
			}
			if err := c.conn.WriteJSON(msg); err != nil {
				return
			}
		case <-done:
			return
		}
	}
}

func (h *Hub) broadcast(eventID string, msg OutboundMessage) {
	room := h.roomFor(eventID)
	room.mu.RLock()
	defer room.mu.RUnlock()
	for c := range room.clients {
		select {
		case c.send <- msg:
		default:
			// Slow consumer — drop rather than block the whole room on one
			// stalled connection.
		}
	}
}

func (h *Hub) broadcastViewerCount(eventID string) {
	h.broadcastCount(eventID, h.CurrentViewerCount(eventID))
}

func (h *Hub) broadcastCount(eventID string, count int) {
	h.broadcast(eventID, OutboundMessage{Type: MsgViewerCount, Count: count, Timestamp: time.Now()})
}

// BroadcastQuestion notifies a room that a new question was submitted —
// called by the HTTP handler after SubmitQuestion succeeds, so the
// question actually reaching every viewer's screen doesn't depend on
// them polling the questions endpoint.
func (h *Hub) BroadcastQuestion(eventID string, questionID, userID, text string) {
	payload, _ := json.Marshal(map[string]string{"questionId": questionID, "userId": userID, "text": text})
	h.broadcast(eventID, OutboundMessage{Type: MsgSystem, Text: string(payload), Timestamp: time.Now()})
}
