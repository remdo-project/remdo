###############################
# Builder: compile SPA assets #
###############################
FROM node:22-alpine AS builder

WORKDIR /app

# Enable the pinned package manager and install dependencies
RUN corepack enable

ARG PUBLIC_PORT=8080

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json tsconfig.tests.json vite.config.mts .
COPY eslint.config.mts index.html ./
COPY src ./src
COPY lib ./lib
COPY config ./config
COPY tools ./tools
COPY docs ./docs
COPY data/.vendor ./data/.vendor

# Production build-time env (same-origin proxy on configurable PUBLIC_PORT)
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=${PUBLIC_PORT} \
    COLLAB_ENABLED=true \
    COLLAB_CLIENT_PORT=${PUBLIC_PORT} \
    COLLAB_DOCUMENT_ID=main

RUN pnpm install --frozen-lockfile
RUN pnpm run build


############################
# Runner: serve SPA + YJS  #
############################
FROM node:22-alpine AS runner

ARG YSWEET_VERSION=0.9.1

WORKDIR /app

RUN apk add --no-cache caddy \
  && npm install -g "y-sweet@${YSWEET_VERSION}" \
  && mkdir -p /data /etc/caddy /srv/remdo

# Runtime defaults
ENV YSWEET_PORT_INTERNAL=8081 \
    APP_PORT=8080

COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/data/dist /srv/remdo

EXPOSE 8080

CMD ["sh", "-c", "y-sweet serve --host 0.0.0.0 --port ${YSWEET_PORT_INTERNAL} /data & caddy run --config /etc/caddy/Caddyfile --adapter caddyfile"]
