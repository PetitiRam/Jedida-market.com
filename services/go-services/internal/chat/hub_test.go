package chat

import "testing"

func newTestClient(userID string) *Client {
	// send is a buffered channel so Send() in tests doesn't block without a
	// running writePump.
	return &Client{
		User: AuthedUser{ID: userID},
		send: make(chan Outbound, 8),
	}
}

func TestHub_RegisterEnforcesConnectionCap(t *testing.T) {
	h := NewHub(2)
	c1 := newTestClient("user-1")
	c2 := newTestClient("user-1")
	c3 := newTestClient("user-1")

	if ok, first := h.Register(c1); !ok || !first {
		t.Fatalf("expected first registration to succeed and report wasFirst=true, got ok=%v first=%v", ok, first)
	}
	if ok, first := h.Register(c2); !ok || first {
		t.Fatalf("expected second registration to succeed with wasFirst=false, got ok=%v first=%v", ok, first)
	}
	ok, _ := h.Register(c3)
	if ok {
		t.Fatal("expected third registration for the same user to be rejected at the connection cap")
	}
}

func TestHub_UnregisterReportsLastConnection(t *testing.T) {
	h := NewHub(5)
	c1 := newTestClient("user-1")
	c2 := newTestClient("user-1")
	h.Register(c1)
	h.Register(c2)

	if last := h.Unregister(c1); last {
		t.Fatal("expected wasLastConnection=false when another connection remains")
	}
	if last := h.Unregister(c2); !last {
		t.Fatal("expected wasLastConnection=true when the final connection is removed")
	}
	if h.IsOnline("user-1") {
		t.Fatal("expected user to be offline after all connections removed")
	}
}

func TestHub_RoomBroadcastExcludesSender(t *testing.T) {
	h := NewHub(5)
	sender := newTestClient("user-1")
	other := newTestClient("user-2")
	h.Register(sender)
	h.Register(other)
	h.JoinRoom("conversation:abc", sender)
	h.JoinRoom("conversation:abc", other)

	h.BroadcastToRoom("conversation:abc", Outbound{Type: "typing:update"}, sender)

	select {
	case <-sender.send:
		t.Fatal("sender should not receive its own excluded broadcast")
	default:
	}

	select {
	case msg := <-other.send:
		if msg.Type != "typing:update" {
			t.Fatalf("unexpected message type: %s", msg.Type)
		}
	default:
		t.Fatal("expected other client to receive the broadcast")
	}
}

func TestHub_LeaveRoomStopsFurtherBroadcasts(t *testing.T) {
	h := NewHub(5)
	c := newTestClient("user-1")
	h.Register(c)
	h.JoinRoom("conversation:abc", c)
	h.LeaveRoom("conversation:abc", c)

	h.BroadcastToRoomIncludingSender("conversation:abc", Outbound{Type: "message:new"})

	select {
	case <-c.send:
		t.Fatal("client should not receive broadcasts after leaving the room")
	default:
	}
}

func TestHub_UnregisterRemovesClientFromAllRooms(t *testing.T) {
	h := NewHub(5)
	c := newTestClient("user-1")
	h.Register(c)
	h.JoinRoom("conversation:a", c)
	h.JoinRoom("conversation:b", c)

	h.Unregister(c)

	h.BroadcastToRoomIncludingSender("conversation:a", Outbound{Type: "x"})
	h.BroadcastToRoomIncludingSender("conversation:b", Outbound{Type: "y"})

	select {
	case <-c.send:
		t.Fatal("unregistered client should not receive room broadcasts")
	default:
	}
}
