# Single-Container Deployment (Caddy + Y-Sweet)

This recipe builds the RemDo SPA and bundles the Y-Sweet collab backend into one
Docker image. It assumes same-origin requests: the SPA and `/doc/*` share a
single external port.

## Build

- Fast path: `./docker/build.sh` (uses `docker/Dockerfile`, tags `remdo`, sets `PUBLIC_PORT=8080`).
- Manual equivalent (override port if needed):\
  `docker build -f docker/Dockerfile --build-arg PUBLIC_PORT=443 -t remdo .`

## Run

`./docker/run.sh` (hardcoded: tag `remdo`, `APP_PORT=8080`,
`YSWEET_PORT_INTERNAL=8081`, no volume mounts). Manual equivalent:\
`docker run --rm -e APP_PORT=8080 -e YSWEET_PORT_INTERNAL=8081 -p 8080:8080 remdo`

The container exposes only `8080`; `/doc/*` and `/d*` are proxied to Y-Sweet
inside the container. WebSockets are forwarded automatically by Caddy. Health
check: `GET /health` returns 200.

## Data

- Y-Sweet stores docs in `/data` inside the container. With no volume attached,
  collaboration data is ephemeral. Mount a host volume to `/data` later if
  persistence is needed.

## Notes

- The Dockerfile lives at `docker/Dockerfile`; run builds from repo root so
  `data/.vendor/lexical` is available.
