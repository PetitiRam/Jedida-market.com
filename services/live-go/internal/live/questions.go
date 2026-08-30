package live

import (
	"context"

	"jedida.com/live/internal/models"
)

// Questions are deliberately handled through the same Service rather than
// a separate questions.go split into its own package — spec §14 asks for
// them to be data-model-separate from chat (different table, different
// statuses), which schema_phase95_live_shopping.sql already gives them;
// splitting the Go code across files here would just be an organizational
// preference, not a functional need.

func (s *Service) SubmitQuestion(ctx context.Context, eventID, userID, text string) (*models.LiveQuestion, error) {
	return s.repo.SubmitQuestion(ctx, eventID, userID, text)
}

func (s *Service) ListPendingQuestions(ctx context.Context, eventID, sellerID string) ([]*models.LiveQuestion, error) {
	event, err := s.repo.GetEvent(ctx, eventID)
	if err != nil {
		return nil, err
	}
	if event.SellerID != sellerID {
		return nil, ErrForbidden
	}
	return s.repo.ListPendingQuestions(ctx, eventID)
}

func (s *Service) AnswerQuestion(ctx context.Context, eventID, questionID, sellerID string) error {
	event, err := s.repo.GetEvent(ctx, eventID)
	if err != nil {
		return err
	}
	if event.SellerID != sellerID {
		return ErrForbidden
	}
	return s.repo.AnswerQuestion(ctx, questionID, sellerID)
}

func (s *Service) RejectQuestion(ctx context.Context, eventID, questionID, sellerID string) error {
	event, err := s.repo.GetEvent(ctx, eventID)
	if err != nil {
		return err
	}
	if event.SellerID != sellerID {
		return ErrForbidden
	}
	return s.repo.RejectQuestion(ctx, questionID)
}
