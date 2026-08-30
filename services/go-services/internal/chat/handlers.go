package chat

import (
	"context"
	"errors"
	"log"
	"time"
)

// Server ties the Hub and Repository together and dispatches inbound
// events. One Server instance is shared across all connections.
type Server struct {
	hub          *Hub
	repo         *Repository
	pushNotifier PushNotifier // may be nil — push notifications are optional
}

func NewServer(hub *Hub, repo *Repository, pushNotifier PushNotifier) *Server {
	return &Server{hub: hub, repo: repo, pushNotifier: pushNotifier}
}

// HandleConnect is called once per new WebSocket connection, after auth has
// already succeeded (the handshake's JWT check happens before this, in the
// HTTP handler — see cmd/chat/main.go).
func (s *Server) HandleConnect(c *Client) {
	ok, wasFirst := s.hub.Register(c)
	if !ok {
		c.Send(Outbound{Type: "error", Error: "too many connections for this account"})
		c.conn.Close()
		return
	}
	if wasFirst {
		s.hub.BroadcastPresence(c.User.ID, true, nil)
	}
	go c.writePump()
	c.readPump(s.dispatch)

	// readPump returned: connection closed (network drop, tab closed, etc).
	// The client can reconnect at any time; on reconnect it must re-issue
	// conversation:join / internal:join for whatever it was viewing, the
	// same way a fresh Socket.IO connection would need to.
	lastConn := s.hub.Unregister(c)
	if lastConn {
		now := time.Now()
		s.hub.BroadcastPresence(c.User.ID, false, &now)
	}
}

func (s *Server) dispatch(c *Client, in Inbound) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch in.Type {
	case "conversation:join":
		s.handleConversationJoin(ctx, c, in)
	case "conversation:leave":
		s.handleConversationLeave(c, in)
	case "internal:join":
		s.handleInternalJoin(ctx, c, in)
	case "internal:leave":
		s.handleInternalLeave(c, in)
	case "message:send":
		s.handleMessageSend(ctx, c, in)
	case "message:mark-read":
		s.handleMarkRead(ctx, c, in)
	case "typing:start":
		s.handleTyping(c, in, true)
	case "typing:stop":
		s.handleTyping(c, in, false)
	case "message:react":
		s.handleReact(ctx, c, in)
	case "message:edit":
		s.handleEdit(ctx, c, in)
	case "message:delete-for-everyone":
		s.handleDeleteForEveryone(ctx, c, in)
	case "message:pin":
		s.handlePin(ctx, c, in, true)
	case "message:unpin":
		s.handlePin(ctx, c, in, false)
	case "message:forward":
		s.handleForward(ctx, c, in)
	case "message:send-bridged":
		s.handleSendBridged(ctx, c, in)
	default:
		c.Send(Outbound{Type: "error", RequestID: in.RequestID, Error: "unknown event type: " + in.Type})
	}
}

func (s *Server) handleConversationJoin(ctx context.Context, c *Client, in Inbound) {
	convID := in.Payload.ConversationID
	if convID == "" {
		c.Send(ackErr(in.RequestID, "conversation:join", errors.New("conversationId is required")))
		return
	}
	if _, err := s.repo.AssertParticipant(ctx, convID, c.User); err != nil {
		c.Send(ackErr(in.RequestID, "conversation:join", err))
		return
	}
	room := "conversation:" + convID
	s.hub.JoinRoom(room, c)
	c.rooms[room] = struct{}{}
	c.Send(ackOK(in.RequestID, "conversation:join", map[string]bool{"success": true}))
}

func (s *Server) handleConversationLeave(c *Client, in Inbound) {
	if in.Payload.ConversationID == "" {
		return
	}
	room := "conversation:" + in.Payload.ConversationID
	s.hub.LeaveRoom(room, c)
	delete(c.rooms, room)
}

func (s *Server) handleInternalJoin(ctx context.Context, c *Client, in Inbound) {
	if !c.User.IsAdmin {
		c.Send(ackErr(in.RequestID, "internal:join", errors.New("only agents can join internal chat")))
		return
	}
	convID := in.Payload.InternalConversationID
	if convID == "" {
		c.Send(ackErr(in.RequestID, "internal:join", errors.New("internalConversationId is required")))
		return
	}
	isMember, err := s.repo.IsInternalParticipant(ctx, convID, c.User.ID)
	if err != nil {
		log.Printf("chat: internal membership check error: %v", err)
		c.Send(ackErr(in.RequestID, "internal:join", errors.New("could not verify membership")))
		return
	}
	if !isMember {
		c.Send(ackErr(in.RequestID, "internal:join", errors.New("not a participant in this internal conversation")))
		return
	}
	room := "internal:" + convID
	s.hub.JoinRoom(room, c)
	c.rooms[room] = struct{}{}
	c.Send(ackOK(in.RequestID, "internal:join", map[string]bool{"success": true}))
}

func (s *Server) handleInternalLeave(c *Client, in Inbound) {
	if in.Payload.InternalConversationID == "" {
		return
	}
	room := "internal:" + in.Payload.InternalConversationID
	s.hub.LeaveRoom(room, c)
	delete(c.rooms, room)
}

func (s *Server) handleMessageSend(ctx context.Context, c *Client, in Inbound) {
	body := in.Payload.Body
	if body == "" && in.Payload.AttachmentURL == "" {
		c.Send(ackErr(in.RequestID, "message:send", ErrEmptyMessage))
		return
	}

	// Internal (agent) conversation vs customer-facing conversation are
	// disjoint room namespaces, matching the isolation requirement.
	if in.Payload.InternalConversationID != "" {
		s.sendInternalMessage(ctx, c, in)
		return
	}
	s.sendConversationMessage(ctx, c, in)
}

func (s *Server) sendConversationMessage(ctx context.Context, c *Client, in Inbound) {
	convID := in.Payload.ConversationID
	conv, err := s.repo.AssertParticipant(ctx, convID, c.User)
	if err != nil {
		c.Send(ackErr(in.RequestID, "message:send", err))
		return
	}

	otherUserID := conv.UserID
	if conv.UserID == c.User.ID && conv.SellerID != nil {
		otherUserID = *conv.SellerID
	}
	if !c.User.IsAdmin && otherUserID != "" {
		blocked, err := s.repo.IsBlockedEitherWay(ctx, c.User.ID, otherUserID)
		if err != nil {
			c.Send(ackErr(in.RequestID, "message:send", errors.New("could not verify block status")))
			return
		}
		if blocked {
			c.Send(ackErr(in.RequestID, "message:send", ErrBlocked))
			return
		}
	}

	// Contact/fraud moderation — ported from contactModerationEngine.js.
	// Admins are exempt (IsExemptSender); everyone else's message text is
	// scanned before it's ever persisted or broadcast, mirroring
	// chatV2.js's message-send handler exactly: block -> persist a
	// placeholder + reject, mask -> persist the redacted text and still
	// broadcast, clean -> persist as-is.
	finalBody := in.Payload.Body
	moderationStatus := "clean"
	originalBody := ""
	var scanResult ScanResult
	hasScan := false

	if !IsExemptSender(c.User) {
		scanResult = ScanMessageText(in.Payload.Body)
		hasScan = true
		if scanResult.Action == "block" {
			blockedMsg, saveErr := s.repo.SaveMessage(ctx, convID, c.User.ID,
				"[message blocked by Petiti AI — contact-sharing attempt]", in.Payload.MessageType, in.Payload.ReplyToID,
				"blocked", in.Payload.Body, "", false)
			if saveErr != nil {
				c.Send(ackErr(in.RequestID, "message:send", saveErr))
				return
			}
			if err := s.repo.RecordModerationEvent(ctx, convID, blockedMsg.ID, c.User.ID, scanResult); err != nil {
				log.Printf("chat: record moderation event error: %v", err)
			}
			c.Send(Outbound{Type: "message:send", RequestID: in.RequestID, Error: BuildReminderMessage(scanResult),
				Payload: map[string]string{"moderationStatus": "blocked"}})
			return
		}
		if scanResult.Action == "mask" {
			finalBody = scanResult.MaskedText
			moderationStatus = "masked"
			originalBody = in.Payload.Body
		}
	}

	msg, err := s.repo.SaveMessage(ctx, convID, c.User.ID, finalBody, in.Payload.MessageType, in.Payload.ReplyToID,
		moderationStatus, originalBody, in.Payload.AttachmentURL, c.User.IsAdmin)
	if err != nil {
		c.Send(ackErr(in.RequestID, "message:send", err))
		return
	}

	if hasScan && moderationStatus == "masked" {
		if err := s.repo.RecordModerationEvent(ctx, convID, msg.ID, c.User.ID, scanResult); err != nil {
			log.Printf("chat: record moderation event error: %v", err)
		}
	}

	room := "conversation:" + convID
	s.hub.BroadcastToRoomIncludingSender(room, Outbound{Type: "message:new", Payload: msg})
	ackPayload := map[string]interface{}{"message": msg}
	if moderationStatus == "masked" {
		ackPayload["moderation"] = map[string]string{"status": "masked", "reminder": BuildReminderMessage(scanResult)}
	}
	c.Send(ackOK(in.RequestID, "message:send", ackPayload))

	// Offline push notification: kept as a Node-owned concern rather than
	// duplicating Firebase credentials/SDK into Go. See
	// go-services/README.md "Push notifications" — Go calls back into a
	// small internal Node endpoint that wraps the existing
	// sendPushToUser(), the same way the Affiliate engine calls Node-side
	// business logic rather than re-implementing it.
	if otherUserID != "" && !s.hub.IsOnline(otherUserID) && s.pushNotifier != nil {
		go s.pushNotifier.NotifyNewMessage(otherUserID, c.User.ID, c.User.IsAdmin, finalBody, convID)
	}
}

func (s *Server) sendInternalMessage(ctx context.Context, c *Client, in Inbound) {
	if !c.User.IsAdmin {
		c.Send(ackErr(in.RequestID, "message:send", errors.New("only agents can send internal messages")))
		return
	}
	convID := in.Payload.InternalConversationID
	isMember, err := s.repo.IsInternalParticipant(ctx, convID, c.User.ID)
	if err != nil || !isMember {
		c.Send(ackErr(in.RequestID, "message:send", errors.New("not a participant in this internal conversation")))
		return
	}
	msg, err := s.repo.SaveInternalMessage(ctx, convID, c.User.ID, in.Payload.Body)
	if err != nil {
		c.Send(ackErr(in.RequestID, "message:send", err))
		return
	}
	room := "internal:" + convID
	s.hub.BroadcastToRoomIncludingSender(room, Outbound{Type: "internal:message:new", Payload: msg})
	c.Send(ackOK(in.RequestID, "message:send", msg))
}

func (s *Server) handleMarkRead(ctx context.Context, c *Client, in Inbound) {
	convID := in.Payload.ConversationID
	if convID == "" {
		return
	}
	if _, err := s.repo.AssertParticipant(ctx, convID, c.User); err != nil {
		return
	}
	if err := s.repo.MarkMessagesRead(ctx, convID, c.User.ID); err != nil {
		log.Printf("chat: mark-read error: %v", err)
		return
	}
	room := "conversation:" + convID
	s.hub.BroadcastToRoom(room, Outbound{
		Type:    "message:read-update",
		Payload: map[string]string{"conversationId": convID, "readerId": c.User.ID},
	}, c)
}

func (s *Server) handleTyping(c *Client, in Inbound, isTyping bool) {
	if in.Payload.ConversationID == "" {
		return
	}
	room := "conversation:" + in.Payload.ConversationID
	s.hub.BroadcastToRoom(room, Outbound{
		Type:    "typing:update",
		Payload: map[string]interface{}{"userId": c.User.ID, "isTyping": isTyping},
	}, c)
}

func (s *Server) handleReact(ctx context.Context, c *Client, in Inbound) {
	if in.Payload.ConversationID == "" || in.Payload.MessageID == "" || in.Payload.Emoji == "" {
		return
	}
	if _, err := s.repo.AssertParticipant(ctx, in.Payload.ConversationID, c.User); err != nil {
		return
	}
	msg, err := s.repo.ReactToMessage(ctx, in.Payload.MessageID, c.User.ID, in.Payload.Emoji)
	if err != nil {
		log.Printf("chat: react error: %v", err)
		return
	}
	room := "conversation:" + in.Payload.ConversationID
	s.hub.BroadcastToRoomIncludingSender(room, Outbound{Type: "message:edited", Payload: msg})
}

func (s *Server) handleEdit(ctx context.Context, c *Client, in Inbound) {
	// Matches chatSocket.js's message:edit exactly: no separate
	// conversation-participant check — ownership is enforced by the SQL
	// WHERE sender_id = $2 clause itself.
	msg, err := s.repo.EditMessage(ctx, in.Payload.MessageID, c.User.ID, in.Payload.NewBody)
	if err != nil {
		c.Send(ackErr(in.RequestID, "message:edit", err))
		return
	}
	room := "conversation:" + in.Payload.ConversationID
	s.hub.BroadcastToRoomIncludingSender(room, Outbound{Type: "message:edited", Payload: msg})
	c.Send(ackOK(in.RequestID, "message:edit", map[string]interface{}{"success": true, "message": msg}))
}

func (s *Server) handleDeleteForEveryone(ctx context.Context, c *Client, in Inbound) {
	msg, err := s.repo.DeleteMessageForEveryone(ctx, in.Payload.MessageID, c.User.ID)
	if err != nil {
		log.Printf("chat: delete-for-everyone error: %v", err)
		return
	}
	if msg == nil {
		return // not found or not the sender's message — matches Node's silent no-op
	}
	room := "conversation:" + in.Payload.ConversationID
	s.hub.BroadcastToRoom(room, Outbound{
		Type:    "message:deleted",
		Payload: map[string]string{"messageId": in.Payload.MessageID},
	}, nil)
}

func (s *Server) handlePin(ctx context.Context, c *Client, in Inbound, pinned bool) {
	eventType := "message:pin"
	if !pinned {
		eventType = "message:unpin"
	}
	if in.Payload.ConversationID == "" || in.Payload.MessageID == "" {
		return
	}
	if _, err := s.repo.AssertParticipant(ctx, in.Payload.ConversationID, c.User); err != nil {
		return
	}
	msg, err := s.repo.SetMessagePinned(ctx, in.Payload.MessageID, in.Payload.ConversationID, pinned)
	if err != nil {
		log.Printf("chat: %s error: %v", eventType, err)
		return
	}
	if msg == nil {
		return
	}
	outType := "message:pinned"
	if !pinned {
		outType = "message:unpinned"
	}
	room := "conversation:" + in.Payload.ConversationID
	s.hub.BroadcastToRoom(room, Outbound{Type: outType, Payload: msg}, nil)
}

func (s *Server) handleForward(ctx context.Context, c *Client, in Inbound) {
	target := in.Payload.TargetConversationID
	conv, err := s.repo.AssertParticipant(ctx, target, c.User)
	if err != nil {
		c.Send(ackErr(in.RequestID, "message:forward", err))
		return
	}
	// Matches chatSocket.js's message:forward exactly: the block check is
	// always against the target conversation's seller_id specifically,
	// not the general "other side" computation sendConversationMessage
	// uses — a deliberate difference in the original, preserved here.
	if conv.SellerID != nil {
		blocked, err := s.repo.IsBlockedEitherWay(ctx, c.User.ID, *conv.SellerID)
		if err != nil {
			c.Send(ackErr(in.RequestID, "message:forward", errors.New("could not verify block status")))
			return
		}
		if blocked {
			c.Send(ackErr(in.RequestID, "message:forward", errors.New("you can no longer message this user")))
			return
		}
	}
	msg, err := s.repo.ForwardMessage(ctx, in.Payload.MessageID, target, c.User.ID)
	if err != nil {
		c.Send(ackErr(in.RequestID, "message:forward", err))
		return
	}
	room := "conversation:" + target
	s.hub.BroadcastToRoomIncludingSender(room, Outbound{Type: "message:new", Payload: msg})
	c.Send(ackOK(in.RequestID, "message:forward", map[string]interface{}{"success": true, "message": msg}))
}

// handleSendBridged mirrors chatSocket.js's message:send-bridged. NOTE: it
// does NOT run translateForRecipient — that depends on an external AI
// translation call (backend/src/chat/translate.js) that was out of scope
// for this port; a bridged message sent through Go will not be
// auto-translated for the other side the way one sent through Socket.IO
// is. Flagged, not silently dropped.
func (s *Server) handleSendBridged(ctx context.Context, c *Client, in Inbound) {
	body := in.Payload.Body
	if body == "" {
		c.Send(ackErr(in.RequestID, "message:send-bridged", ErrEmptyMessage))
		return
	}
	bridge, err := s.repo.GetBridgeByID(ctx, in.Payload.LinkID)
	if err != nil {
		c.Send(ackErr(in.RequestID, "message:send-bridged", errors.New("bridge not found")))
		return
	}
	senderConvID := in.Payload.SenderConversationID
	isBuyerSide := bridge.BuyerConversationID == senderConvID
	isSellerSide := bridge.SellerConversationID == senderConvID
	if !isBuyerSide && !isSellerSide {
		c.Send(ackErr(in.RequestID, "message:send-bridged", errors.New("not part of this bridge")))
		return
	}
	otherConvID := bridge.SellerConversationID
	if !isBuyerSide {
		otherConvID = bridge.BuyerConversationID
	}

	finalBody := body
	moderationStatus := "clean"
	originalBody := ""
	var scanResult ScanResult
	if !IsExemptSender(c.User) {
		scanResult = ScanMessageText(body)
		if scanResult.Action == "block" {
			blockedMsg, saveErr := s.repo.SaveMessage(ctx, senderConvID, c.User.ID,
				"[message blocked by Petiti AI — contact-sharing attempt]", "bridged", "", "blocked", body, "", false)
			if saveErr != nil {
				c.Send(ackErr(in.RequestID, "message:send-bridged", saveErr))
				return
			}
			if err := s.repo.RecordModerationEvent(ctx, senderConvID, blockedMsg.ID, c.User.ID, scanResult); err != nil {
				log.Printf("chat: record moderation event error: %v", err)
			}
			c.Send(Outbound{Type: "message:send-bridged", RequestID: in.RequestID, Error: BuildReminderMessage(scanResult),
				Payload: map[string]string{"moderationStatus": "blocked"}})
			return
		}
		if scanResult.Action == "mask" {
			finalBody = scanResult.MaskedText
			moderationStatus = "masked"
			originalBody = body
		}
	}

	msg, err := s.repo.SaveMessage(ctx, senderConvID, c.User.ID, finalBody, "bridged", "", moderationStatus, originalBody, "", c.User.IsAdmin)
	if err != nil {
		c.Send(ackErr(in.RequestID, "message:send-bridged", err))
		return
	}
	if moderationStatus == "masked" {
		if err := s.repo.RecordModerationEvent(ctx, senderConvID, msg.ID, c.User.ID, scanResult); err != nil {
			log.Printf("chat: record moderation event error: %v", err)
		}
	}

	s.hub.BroadcastToRoomIncludingSender("conversation:"+senderConvID, Outbound{Type: "message:new", Payload: msg})
	s.hub.BroadcastToRoomIncludingSender("conversation:"+otherConvID, Outbound{Type: "message:new", Payload: msg})

	if moderationStatus == "masked" {
		c.Send(Outbound{Type: "moderation:warning", Payload: map[string]string{
			"conversationId": senderConvID, "messageId": msg.ID, "reminder": BuildReminderMessage(scanResult),
		}})
	}

	c.Send(ackOK(in.RequestID, "message:send-bridged", map[string]interface{}{
		"success": true, "message": msg, "moderation": map[string]string{"status": moderationStatus},
	}))
}
