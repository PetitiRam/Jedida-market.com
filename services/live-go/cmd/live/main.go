// Jedida Live Shopping — Go control-plane service (spec: "Cloudflare
// Stream + Go Implementation Specification"). Runs as a normal OS
// process (systemd, per DEPLOY.md) alongside the existing Node backend —
// no Docker, no second database. See internal/live/service.go and
// internal/cloudflare/ for the actual Cloudflare Stream integration, and
// backend/src/config/schema_phase95_live_shopping.sql for the schema this
// reads/writes in the SAME Postgres database as the Node backend.
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"jedida.com/live/internal/chat"
	"jedida.com/live/internal/cloudflare"
	"jedida.com/live/internal/config"
	"jedida.com/live/internal/handlers"
	"jedida.com/live/internal/live"
	"jedida.com/live/internal/repository"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	cancel()
	if err != nil {
		log.Fatalf("could not connect to postgres: %v", err)
	}
	defer pool.Close()

	repo := repository.New(pool)
	cf := cloudflare.NewClient(cfg.CloudflareAccountID, cfg.CloudflareAPIToken)
	svc := live.New(repo, cf, cfg.CloudflareCustomerCode)
	hub := chat.NewHub(repo)

	liveHandler := handlers.NewLiveHandler(svc, hub)
	chatHandler := handlers.NewChatWSHandler(hub, cfg.JWTAccessSecret)
	authMiddleware := handlers.RequireAuth(cfg.JWTAccessSecret)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger) // logs method/path/status/latency only — never headers or bodies, so no risk of a Bearer token or stream key reaching stdout
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	r.Route("/api/live", func(r chi.Router) {
		// Public: browsing and playback don't require login (spec §10/§54
		// — guests can watch Live Shopping). Everything that mutates state
		// or exposes anything seller/viewer-identity-specific is authed
		// below instead.
		r.Get("/events", liveHandler.ListActive)
		r.Get("/events/{id}", liveHandler.GetEvent)
		r.Get("/events/{id}/playback", liveHandler.GetPlayback)
		r.Get("/events/{id}/products", liveHandler.ListProducts)
		// Auth happens inside the handshake (see ChatWSHandler.Serve) —
		// this route intentionally sits outside the authMiddleware group
		// below, since a browser WebSocket connection can't carry the
		// Authorization header that middleware checks.
		r.Get("/events/{id}/realtime", chatHandler.Serve)

		r.Group(func(r chi.Router) {
			r.Use(authMiddleware)

			r.Post("/events", liveHandler.CreateEvent)
			r.Get("/my-events", liveHandler.ListMyEvents)
			r.Post("/events/{id}/start", liveHandler.StartLive)
			r.Post("/events/{id}/end", liveHandler.EndLive)
			r.Post("/events/{id}/cancel", liveHandler.CancelEvent)

			r.Post("/events/{id}/products", liveHandler.AttachProduct)
			r.Post("/events/{id}/products/{productId}/feature", liveHandler.FeatureProduct)

			r.Post("/events/{id}/questions", liveHandler.SubmitQuestion)
			r.Get("/events/{id}/questions/pending", liveHandler.ListPendingQuestions)
			r.Post("/events/{id}/questions/{questionId}/answer", liveHandler.AnswerQuestion)
			r.Post("/events/{id}/questions/{questionId}/reject", liveHandler.RejectQuestion)
		})
	})

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0, // WebSocket connections are long-lived — no fixed write deadline at the server level
	}

	go func() {
		log.Printf("jedida-live listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("shutting down…")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
}
