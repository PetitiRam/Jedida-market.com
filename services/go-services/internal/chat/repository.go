package chat

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotParticipant = errors.New("not a participant in this conversation")
	ErrNotFound       = errors.New("conversation not found")
	ErrBlocked        = errors.New("messaging is blocked between these users")
	ErrEmptyMessage   = errors.New("message cannot be empty")
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// GetConversation loads a chat_conversations row (schema_phase8.sql).
func (r *Repository) GetConversation(ctx context.Context, conversationID string) (*Conversation, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, user_id, seller_id, status FROM chat_conversations WHERE id = $1`,
		conversationID,
	)
	var c Conversation
	if err := row.Scan(&c.ID, &c.UserID, &c.SellerID, &c.Status); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

// AssertParticipant mirrors chatSocket.js's assertParticipant: an admin may
// join any conversation (support bridging); anyone else must be the
// customer or the seller on the conversation itself. Business permission
// logic stays this simple on purpose — anything more nuanced (bridged
// conversations, dropship escalations) is left to the existing Node API,
// which Go calls into rather than re-implementing.
func (r *Repository) AssertParticipant(ctx context.Context, conversationID string, user AuthedUser) (*Conversation, error) {
	conv, err := r.GetConversation(ctx, conversationID)
	if err != nil {
		return nil, err
	}
	if user.IsAdmin {
		return conv, nil
	}
	if conv.UserID == user.ID {
		return conv, nil
	}
	if conv.SellerID != nil && *conv.SellerID == user.ID {
		return conv, nil
	}
	return nil, ErrNotParticipant
}

// IsBlockedEitherWay mirrors chatService.js's isBlockedEitherWay against the
// chat_blocks table (schema_phase35_chat_moderation.sql).
func (r *Repository) IsBlockedEitherWay(ctx context.Context, userA, userB string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM chat_blocks
			WHERE (blocker_id = $1 AND blocked_id = $2)
			   OR (blocker_id = $2 AND blocked_id = $1)
		)`,
		userA, userB,
	).Scan(&exists)
	return exists, err
}

// messageColumns is the shared SELECT/RETURNING column list used by every
// function that returns a full chat_messages row, so the client always
// receives the same shape regardless of which operation produced it
// (send, react, edit, pin, forward, ...).
const messageColumns = `id, conversation_id, user_id, sender_id, body, message_type, reply_to_id, status,
	created_at, reactions, edited_at, deleted_for_everyone, pinned, attachment_url, attachment_meta,
	forwarded_from_id, moderation_status`

func scanMessage(row pgx.Row) (*Message, error) {
	var m Message
	var userID *string
	err := row.Scan(
		&m.ID, &m.ConversationID, &userID, &m.SenderID, &m.Body, &m.MessageType, &m.ReplyToID, &m.Status,
		&m.CreatedAt, &m.Reactions, &m.EditedAt, &m.DeletedForEveryone, &m.Pinned, &m.AttachmentURL, &m.AttachmentMeta,
		&m.ForwardedFromID, &m.ModerationStatus,
	)
	if err != nil {
		return nil, err
	}
	if userID != nil {
		m.UserID = *userID
	}
	return &m, nil
}

// SaveMessage inserts into chat_messages using the ChatV2 columns added in
// schema_phase8.sql (conversation_id, message_type, status) and the
// moderation columns added in schema_phase35_chat_moderation.sql
// (moderation_status, original_body, is_official). Moderation itself
// (deciding masked text / block / clean) happens in handlers.go via
// ScanMessageText before this is called — this function just persists
// whatever it's told, the same division of labor chatV2.js's route
// handler and saveMessage() have.
func (r *Repository) SaveMessage(ctx context.Context, conversationID, senderID, body, messageType, replyToID, moderationStatus, originalBody, attachmentURL string, isOfficial bool) (*Message, error) {
	if body == "" && attachmentURL == "" {
		return nil, ErrEmptyMessage
	}
	if messageType == "" {
		messageType = "text"
	}
	if moderationStatus == "" {
		moderationStatus = "clean"
	}
	var replyTo *string
	if replyToID != "" {
		replyTo = &replyToID
	}
	var origBody *string
	if originalBody != "" {
		origBody = &originalBody
	}
	var attachment *string
	if attachmentURL != "" {
		attachment = &attachmentURL
	}
	row := r.pool.QueryRow(ctx,
		`INSERT INTO chat_messages (conversation_id, user_id, sender_id, body, message_type, reply_to_id, status, moderation_status, original_body, is_official, attachment_url)
		 SELECT $1, c.user_id, $2, $3, $4, $5, 'sent', $6, $7, $8, $9
		 FROM chat_conversations c WHERE c.id = $1
		 RETURNING `+messageColumns,
		conversationID, senderID, body, messageType, replyTo, moderationStatus, origBody, isOfficial, attachment,
	)
	m, err := scanMessage(row)
	if err != nil {
		return nil, fmt.Errorf("save message: %w", err)
	}
	return m, nil
}

// GetMessageByID loads a single message row — needed by ForwardMessage to
// read the source message's content before copying it.
func (r *Repository) GetMessageByID(ctx context.Context, messageID string) (*Message, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+messageColumns+` FROM chat_messages WHERE id = $1`, messageID)
	m, err := scanMessage(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return m, nil
}

// ReactToMessage mirrors chatService.js's reactToMessage exactly: reactions
// is a JSONB map of emoji -> array of userIds, and reacting again with the
// same emoji TOGGLES it off (removes the user from that emoji's list)
// rather than adding a duplicate.
func (r *Repository) ReactToMessage(ctx context.Context, messageID, userID, emoji string) (*Message, error) {
	row := r.pool.QueryRow(ctx,
		`UPDATE chat_messages
		 SET reactions = jsonb_set(
		   reactions,
		   ARRAY[$2],
		   COALESCE(reactions->$2, '[]'::jsonb) ||
		     CASE WHEN (reactions->$2) @> to_jsonb($3::text)
		       THEN '[]'::jsonb
		       ELSE to_jsonb(ARRAY[$3]::text[])
		     END,
		   true
		 )
		 WHERE id = $1
		 RETURNING `+messageColumns,
		messageID, emoji, userID,
	)
	m, err := scanMessage(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("react to message: %w", err)
	}
	return m, nil
}

// EditMessage mirrors chatService.js's editMessage — only the original
// sender may edit, and only if the message hasn't been deleted.
func (r *Repository) EditMessage(ctx context.Context, messageID, senderID, newBody string) (*Message, error) {
	if newBody == "" {
		return nil, ErrEmptyMessage
	}
	row := r.pool.QueryRow(ctx,
		`UPDATE chat_messages SET body = $3, edited_at = now()
		 WHERE id = $1 AND sender_id = $2 AND deleted_for_everyone = FALSE
		 RETURNING `+messageColumns,
		messageID, senderID, newBody,
	)
	m, err := scanMessage(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("message not found or not yours to edit")
		}
		return nil, fmt.Errorf("edit message: %w", err)
	}
	return m, nil
}

// DeleteMessageForEveryone mirrors chatService.js's
// deleteMessageForEveryone — only the sender may delete, body is cleared
// rather than the row removed.
func (r *Repository) DeleteMessageForEveryone(ctx context.Context, messageID, senderID string) (*Message, error) {
	row := r.pool.QueryRow(ctx,
		`UPDATE chat_messages SET deleted_for_everyone = TRUE, body = ''
		 WHERE id = $1 AND sender_id = $2
		 RETURNING `+messageColumns,
		messageID, senderID,
	)
	m, err := scanMessage(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // matches chatService.js returning null (not found/not yours) — handler no-ops
		}
		return nil, fmt.Errorf("delete message: %w", err)
	}
	return m, nil
}

// SetMessagePinned mirrors chatService.js's setMessagePinned.
func (r *Repository) SetMessagePinned(ctx context.Context, messageID, conversationID string, pinned bool) (*Message, error) {
	row := r.pool.QueryRow(ctx,
		`UPDATE chat_messages SET pinned = $3 WHERE id = $1 AND conversation_id = $2
		 RETURNING `+messageColumns,
		messageID, conversationID, pinned,
	)
	m, err := scanMessage(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("set message pinned: %w", err)
	}
	return m, nil
}

// ForwardMessage mirrors chatService.js's forwardMessage. NOTE, faithfully
// preserved from the original: despite that file's own comment claiming
// forwarded messages are "scanned fresh" by moderation, the actual code —
// mirrored here — does NOT run ScanMessageText on the forwarded copy. This
// is a pre-existing quirk in the Node implementation, not something
// introduced here; flagged rather than silently "fixed" during the port,
// since changing moderation behavior wasn't asked for.
func (r *Repository) ForwardMessage(ctx context.Context, sourceMessageID, targetConversationID, userID string) (*Message, error) {
	source, err := r.GetMessageByID(ctx, sourceMessageID)
	if err != nil {
		return nil, err
	}
	if source.DeletedForEveryone {
		return nil, errors.New("cannot forward a deleted message")
	}
	row := r.pool.QueryRow(ctx,
		`INSERT INTO chat_messages
		   (conversation_id, user_id, sender_id, body, message_type, attachment_url, attachment_meta, forwarded_from_id, status)
		 SELECT $1, c.user_id, $2, $3, $4, $5, $6, $7, 'sent'
		 FROM chat_conversations c WHERE c.id = $1
		 RETURNING `+messageColumns,
		targetConversationID, userID, source.Body, source.MessageType, source.AttachmentURL, source.AttachmentMeta, source.ID,
	)
	m, err := scanMessage(row)
	if err != nil {
		return nil, fmt.Errorf("forward message: %w", err)
	}
	return m, nil
}

// GetBridgeByID mirrors chatService.js's getBridgeById.
func (r *Repository) GetBridgeByID(ctx context.Context, linkID string) (*Bridge, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, buyer_conversation_id, seller_conversation_id FROM chat_bridges WHERE id = $1`,
		linkID,
	)
	var b Bridge
	if err := row.Scan(&b.ID, &b.BuyerConversationID, &b.SellerConversationID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &b, nil
}

// RecordModerationEvent mirrors contactModerationEngine.js's
// recordModerationEvent: writes the chat_moderation_events row, escalates
// the user's cumulative chat_risk_score (with the same repeat-offense
// penalty formula), writes to the platform-wide security log
// (platform_security_log) and the AI ops log (ai_logs), and raises an
// admin alert (ai_alerts) past the same thresholds the JS version uses.
// No-ops if result.Violations is empty, same as the original.
func (r *Repository) RecordModerationEvent(ctx context.Context, conversationID, messageID, userID string, result ScanResult) error {
	if len(result.Violations) == 0 {
		return nil
	}

	categories := map[string]bool{}
	for _, v := range result.Violations {
		categories[v.Category] = true
	}
	categoryList := make([]string, 0, len(categories))
	for c := range categories {
		categoryList = append(categoryList, c)
	}

	_, err := r.pool.Exec(ctx,
		`INSERT INTO chat_moderation_events (conversation_id, message_id, user_id, action, categories, details)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		conversationID, messageID, userID, result.Action, categoryList, result.Violations,
	)
	if err != nil {
		return fmt.Errorf("record moderation event: %w", err)
	}

	var recentViolations int
	err = r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM chat_moderation_events WHERE user_id = $1 AND created_at > now() - interval '7 days'`,
		userID,
	).Scan(&recentViolations)
	if err != nil {
		return fmt.Errorf("count recent violations: %w", err)
	}

	repeatPenalty := 0
	if recentViolations >= 2 {
		repeatPenalty = (recentViolations - 1) * 5
		if repeatPenalty > 25 {
			repeatPenalty = 25
		}
	}

	var newScore int
	err = r.pool.QueryRow(ctx,
		`UPDATE users SET chat_risk_score = LEAST(chat_risk_score + $2, 100) WHERE id = $1 RETURNING chat_risk_score`,
		userID, result.RiskDelta+repeatPenalty,
	).Scan(&newScore)
	if err != nil {
		return fmt.Errorf("update risk score: %w", err)
	}

	level := "info"
	if result.Action == "block" {
		level = "warning"
	}
	types := make([]string, 0, len(result.Violations))
	for _, v := range result.Violations {
		types = append(types, v.Type)
	}
	_, _ = r.pool.Exec(ctx,
		`INSERT INTO ai_logs (actor, level, category, message, metadata) VALUES ($1,$2,$3,$4,$5)`,
		"petiti", level, "chat_moderation",
		fmt.Sprintf("Contact-sharing attempt (%s) in conversation %s.", strings.Join(types, ", "), conversationID),
		map[string]interface{}{"userId": userID, "conversationId": conversationID, "messageId": messageID, "action": result.Action},
	)

	_, _ = r.pool.Exec(ctx,
		`INSERT INTO platform_security_log (actor_id, actor_role, event_type, entity_type, entity_id, metadata)
		 VALUES ($1, 'user', 'chat_contact_violation', 'chat_conversation', $2, $3)`,
		userID, conversationID,
		map[string]interface{}{
			"messageId": messageID, "action": result.Action,
			"recentViolations": recentViolations, "repeatPenalty": repeatPenalty,
			"categories": categoryList,
		},
	)

	if newScore >= 60 || recentViolations >= 3 {
		severity := "high"
		if newScore >= 85 {
			severity = "critical"
		}
		_, _ = r.pool.Exec(ctx,
			`INSERT INTO ai_alerts (actor, severity, title, description, related_user_id, metadata)
			 VALUES ('petiti', $1, $2, $3, $4, $5)`,
			severity, "Repeated contact-sharing attempts in chat",
			fmt.Sprintf("User has %d contact-sharing/off-platform attempts in the last 7 days (risk score %d).", recentViolations, newScore),
			userID,
			map[string]interface{}{"conversationId": conversationID, "recentViolations": recentViolations, "riskScore": newScore},
		)
	}

	return nil
}

// MarkMessagesRead mirrors chatService.js's markMessagesRead — marks every
// message in the conversation not sent by `readerID` as read.
func (r *Repository) MarkMessagesRead(ctx context.Context, conversationID, readerID string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE chat_messages SET read_at = now()
		 WHERE conversation_id = $1 AND sender_id != $2 AND read_at IS NULL`,
		conversationID, readerID,
	)
	return err
}

// IsInternalParticipant checks internal_conversations membership the same
// way agentCommsService.js's listMyInternalConversations does, without
// pulling the whole list into Go — just the one membership check needed to
// authorize a room join.
func (r *Repository) IsInternalParticipant(ctx context.Context, internalConversationID, agentID string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM internal_conversations ic
			WHERE ic.id = $1 AND (
				ic.participant_one_id = $2 OR ic.participant_two_id = $2
				OR EXISTS (
					SELECT 1 FROM agent_group_members gm
					WHERE gm.group_id = ic.group_id AND gm.agent_id = $2
				)
			)
		)`,
		internalConversationID, agentID,
	).Scan(&exists)
	return exists, err
}

// SaveInternalMessage inserts into internal_messages (agent-to-agent /
// group chat), separate from customer-facing chat_messages per the
// isolation requirement in the spec.
func (r *Repository) SaveInternalMessage(ctx context.Context, internalConversationID, senderID, body string) (*Message, error) {
	if body == "" {
		return nil, ErrEmptyMessage
	}
	var m Message
	err := r.pool.QueryRow(ctx,
		`INSERT INTO internal_messages (internal_conversation_id, sender_id, body)
		 VALUES ($1, $2, $3)
		 RETURNING id, internal_conversation_id, sender_id, body, created_at`,
		internalConversationID, senderID, body,
	).Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Body, &m.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("save internal message: %w", err)
	}
	m.MessageType = "text"
	m.Status = "sent"
	return &m, nil
}
