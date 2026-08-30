package chat

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 64 * 1024 // 64KB per frame — bounds abuse via oversized payloads
	sendBufferSize = 32
)

// Client wraps one live WebSocket connection. A user may have several of
// these at once (multiple tabs/devices), all tracked under the same
// AuthedUser.ID in the Hub.
type Client struct {
	conn *websocket.Conn
	hub  *Hub
	repo *Repository

	User AuthedUser
	send chan Outbound

	rooms map[string]struct{} // rooms this client has joined, for cleanup/logging
}

func NewClient(conn *websocket.Conn, hub *Hub, repo *Repository, user AuthedUser) *Client {
	return &Client{
		conn:  conn,
		hub:   hub,
		repo:  repo,
		User:  user,
		send:  make(chan Outbound, sendBufferSize),
		rooms: make(map[string]struct{}),
	}
}

// Send is non-blocking best-effort: if a client's outbound buffer is full
// (a slow/stuck consumer), we drop the connection rather than let one bad
// client back-pressure the whole hub — this is the "bounded queues" /
// "backpressure" requirement from the spec.
func (c *Client) Send(out Outbound) {
	select {
	case c.send <- out:
	default:
		log.Printf("chat: dropping slow client %s (send buffer full)", c.User.ID)
		c.conn.Close()
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			b, err := json.Marshal(msg)
			if err != nil {
				log.Printf("chat: marshal outbound error: %v", err)
				continue
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, b); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// readPump reads inbound frames and dispatches them via the given handler.
// It returns when the connection closes (client navigated away, network
// drop, etc.) — the caller is responsible for hub cleanup and presence
// broadcast, matching chatSocket.js's disconnect handler.
func (c *Client) readPump(dispatch func(*Client, Inbound)) {
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var in Inbound
		if err := json.Unmarshal(raw, &in); err != nil {
			c.Send(Outbound{Type: "error", Error: "malformed message"})
			continue
		}
		dispatch(c, in)
	}
}
