module jedida.com/live

go 1.22

// Versions pinned to what was current knowledge as of writing — this
// sandbox has no network access, so `go mod tidy` could not be run here
// to resolve/verify these or generate go.sum. Run `go mod tidy` on a
// machine with real internet access before building; it will fetch the
// actual latest patch versions and populate go.sum. Treat every version
// number below as a starting point, not a verified pin.
require (
	github.com/go-chi/chi/v5 v5.0.12
	github.com/golang-jwt/jwt/v5 v5.2.1
	github.com/gorilla/websocket v1.5.1
	github.com/jackc/pgx/v5 v5.5.5
	github.com/google/uuid v1.6.0
)
