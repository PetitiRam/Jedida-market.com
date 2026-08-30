// Command chat runs the Go Chat Engine: a WebSocket realtime transport that
// sits ALONGSIDE the existing Node/Socket.IO chat server (backend/src/chat/chatSocket.js),
// sharing the same Postgres database and JWT auth. It does not replace
// Socket.IO — see go-services/README.md for the migration plan.
package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/gorilla/websocket"

	"jedida.com/go-services/internal/authtoken"
	"jedida.com/go-services/internal/chat"
	"jedida.com/go-services/internal/config"
	"jedida.com/go-services/internal/database"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database connection error: %v", err)
	}
	defer pool.Close()

	verifier := authtoken.NewVerifier(cfg.JWTAccessSecret)
	repo := chat.NewRepository(pool)
	hub := chat.NewHub(cfg.MaxConnectionsPerUser)

	// Push notifications are optional: if GO_NODE_INTERNAL_URL isn't set,
	// pushNotifier stays nil and handlers.go's `if s.pushNotifier != nil`
	// check simply skips the callback — same effective behavior as
	// pushService.js's isPushConfigured() returning false.
	var pushNotifier chat.PushNotifier
	if cfg.NodeInternalBaseURL != "" {
		pushNotifier = chat.NewHTTPPushNotifier(cfg.NodeInternalBaseURL, cfg.InternalServiceSecret)
	}
	server := chat.NewServer(hub, repo, pushNotifier)

	upgrader := websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin: func(r *http.Request) bool {
			if cfg.FrontendOrigin == "*" {
				return true
			}
			return r.Header.Get("Origin") == cfg.FrontendOrigin
		},
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	mux.HandleFunc("/ws/chat", func(w http.ResponseWriter, r *http.Request) {
		// Same contract as chatSocket.js's io.use() handshake middleware:
		// the client must present the SAME access token used for REST
		// calls, as a query param (WebSocket handshakes can't carry a
		// custom Authorization header from a browser EventSource-style
		// connection the way fetch() can).
		token := r.URL.Query().Get("token")
		claims, err := verifier.Verify(token)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("chat: upgrade error: %v", err)
			return
		}

		user := chat.AuthedUser{
			ID:      claims.Subject,
			Role:    claims.Role,
			IsAdmin: claims.IsAdmin,
		}
		client := chat.NewClient(conn, hub, repo, user)
		go server.HandleConnect(client)
	})

	addr := ":" + strconv.Itoa(cfg.ChatPort)
	srv := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("go-chat: listening on %s (ws endpoint: /ws/chat)", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("chat server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("go-chat: shutting down gracefully...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("chat: graceful shutdown error: %v", err)
	}
}
