###############################
# Builder: compile SPA assets #
###############################
FROM node:22-alpine AS builder

WORKDIR /app

# Enable the pinned package manager and install dependencies
RUN corepack enable

ARG PUBLIC_PORT=8080

COPY \
  package.json \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  tsconfig.json \
  vite.config.mts \
  index.html \
  ./

COPY src ./src
COPY lib ./lib
COPY config ./config

# Production build-time env (same-origin proxy on configurable PUBLIC_PORT)
ENV NODE_ENV=production \
  PORT=${PUBLIC_PORT} \
  COLLAB_CLIENT_PORT=${PUBLIC_PORT}

RUN pnpm install --frozen-lockfile && pnpm run build

############################
# Runner: serve SPA + YJS  #
############################
FROM node:22-alpine AS runner

ARG YSWEET_VERSION
RUN test -n "$YSWEET_VERSION" || (echo "YSWEET_VERSION build-arg is required" >&2 && exit 1)

WORKDIR /app

ENV YSWEET_PORT_INTERNAL=8081 \
  APP_PORT=8080

# hadolint ignore=DL3018
RUN apk add --no-cache caddy \
  && npm install -g "y-sweet@${YSWEET_VERSION}" \
  && mkdir -p /data /etc/caddy /srv/remdo

COPY --from=builder /app/data/dist /srv/remdo
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 8080

CMD ["/entrypoint.sh"]
