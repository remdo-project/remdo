# Single-Container Deployment (Caddy + Y-Sweet)

This recipe builds the RemDo SPA and bundles the Y-Sweet collab backend into one
Docker image. It assumes same-origin requests: the SPA and `/doc/*` share a
single external port.

## Build & Run

- One-step: `./docker/run.sh` builds (respecting `PUBLIC_PORT`, default 8080)
  and then runs the image (tag `remdo` by default).
- Manual equivalent (override port if needed):\
  `docker build -f docker/Dockerfile --build-arg PUBLIC_PORT=443 -t remdo .`
  `docker run --rm -e APP_PORT=8080 -e YSWEET_PORT_INTERNAL=8081 -e BASICAUTH_USER -e BASICAUTH_PASSWORD -p 8080:8080 remdo`

Basic auth covers both the SPA and Y-Sweet. The script:

1. Sets `BASICAUTH_USER` to the current shell user.
2. Reads the password from `~/.password` (override with `PASSWORD_FILE`).
3. Verifies the file is mode `600`; otherwise exits and suggests
   `chmod 600 ~/.password`.
4. Requires the password to be non-empty and ≥10 chars.
5. Exports both for the container.

The container exposes only `8080`; `/doc/*` and `/d*` are proxied to Y-Sweet
inside the container. WebSockets are forwarded automatically by Caddy. Health
check: `GET /health` returns 200 when called with the same basic auth header.

## Data

- Y-Sweet stores docs in `/data` inside the container. With no volume attached,
  collaboration data is ephemeral. Mount a host volume to `/data` later if
  persistence is needed.

## Notes

- The Dockerfile lives at `docker/Dockerfile`; run builds from repo root so
  `data/.vendor/lexical` is available.
- The entrypoint hashes `BASICAUTH_PASSWORD` at runtime; the plaintext password
  never touches the image or disk. For production, feed these env vars via your
  secret store (e.g., Docker/Podman secrets, Render/Heroku config vars, or a
  sealed Kubernetes secret) instead of committing them to the repo.
