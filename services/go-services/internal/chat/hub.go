package chat

import (
	"sync"
	"time"
)

// Hub tracks live connections, presence, and room membership in memory.
// This mirrors what Socket.IO's adapter does internally for a single-node
// deployment — if the Go service is ever scaled to multiple nodes, this is
// the piece that would move to Redis pub/sub (spec allows Redis "where
// genuinely useful"; a single node does not need it yet).
type Hub struct {
	mu sync.RWMutex

	// userID -> set of this user's active connections (multi-tab/device)
	usersConns map[string]map[*Client]struct{}

	// room name ("conversation:<id>" or "internal:<id>") -> set of clients
	rooms map[string]map[*Client]struct{}

	maxConnsPerUser int
}

func NewHub(maxConnsPerUser int) *Hub {
	return &Hub{
		usersConns:      make(map[string]map[*Client]struct{}),
		rooms:           make(map[string]map[*Client]struct{}),
		maxConnsPerUser: maxConnsPerUser,
	}
}

// Register adds a connected client. Returns false (and the caller must
// close the socket) if the user is already at the connection cap — a
// simple, explicit backpressure control per the spec's "connection limits"
// requirement, rather than letting one user open unbounded sockets.
func (h *Hub) Register(c *Client) (ok bool, wasFirstConnection bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	conns, exists := h.usersConns[c.User.ID]
	if !exists {
		conns = make(map[*Client]struct{})
		h.usersConns[c.User.ID] = conns
	}
	if len(conns) >= h.maxConnsPerUser {
		return false, false
	}
	wasFirst := len(conns) == 0
	conns[c] = struct{}{}
	return true, wasFirst
}

// Unregister removes a client on disconnect and reports whether that was
// the user's last remaining connection (i.e. they've now gone offline).
func (h *Hub) Unregister(c *Client) (wasLastConnection bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if conns, ok := h.usersConns[c.User.ID]; ok {
		delete(conns, c)
		if len(conns) == 0 {
			delete(h.usersConns, c.User.ID)
			wasLastConnection = true
		}
	}
	for room, members := range h.rooms {
		if _, ok := members[c]; ok {
			delete(members, c)
			if len(members) == 0 {
				delete(h.rooms, room)
			}
		}
	}
	return wasLastConnection
}

func (h *Hub) JoinRoom(room string, c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.rooms[room]; !ok {
		h.rooms[room] = make(map[*Client]struct{})
	}
	h.rooms[room][c] = struct{}{}
}

func (h *Hub) LeaveRoom(room string, c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if members, ok := h.rooms[room]; ok {
		delete(members, c)
		if len(members) == 0 {
			delete(h.rooms, room)
		}
	}
}

// IsOnline reports whether a user has at least one live connection —
// mirrors chatSocket.js's isUserOnline, used to decide whether to send a
// push notification to an offline recipient.
func (h *Hub) IsOnline(userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	conns, ok := h.usersConns[userID]
	return ok && len(conns) > 0
}

// BroadcastToRoom sends a message to every client currently in a room,
// except excludeSender when set (matches socket.to(room).emit(...) which
// excludes the emitting socket).
func (h *Hub) BroadcastToRoom(room string, out Outbound, excludeSender *Client) {
	h.mu.RLock()
	members := h.rooms[room]
	targets := make([]*Client, 0, len(members))
	for c := range members {
		if c != excludeSender {
			targets = append(targets, c)
		}
	}
	h.mu.RUnlock()

	for _, c := range targets {
		c.Send(out)
	}
}

// BroadcastToRoomIncludingSender is used for events the sender should also
// receive an echo of (e.g. message:new so every tab of the sender updates).
func (h *Hub) BroadcastToRoomIncludingSender(room string, out Outbound) {
	h.BroadcastToRoom(room, out, nil)
}

// BroadcastPresence sends a presence update to ALL connected clients,
// matching chatSocket.js's io.emit('presence:update', ...) (global, not
// room-scoped — presence dots can appear anywhere in the UI).
func (h *Hub) BroadcastPresence(userID string, isOnline bool, lastSeenAt *time.Time) {
	payload := map[string]interface{}{
		"userId":   userID,
		"isOnline": isOnline,
	}
	if lastSeenAt != nil {
		payload["lastSeenAt"] = lastSeenAt.Format(time.RFC3339)
	}
	out := Outbound{Type: "presence:update", Payload: payload}

	h.mu.RLock()
	all := make([]*Client, 0)
	for _, conns := range h.usersConns {
		for c := range conns {
			all = append(all, c)
		}
	}
	h.mu.RUnlock()

	for _, c := range all {
		c.Send(out)
	}
}
