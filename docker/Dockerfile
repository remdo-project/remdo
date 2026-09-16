###############################
# Builder: compile SPA assets #
###############################
FROM node:24.21-alpine AS builder

WORKDIR /app

# Enable the pinned package manager and install dependencies
RUN corepack enable

COPY \
  package.json \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  tsconfig.json \
  vite.config.mts \
  index.html \
  ./

COPY src ./src
COPY config ./config
COPY patches ./patches
COPY public ./public
COPY tools ./tools

RUN attempt=1 \
  && until pnpm install --frozen-lockfile --prod; do \
    [ "$attempt" -ge 3 ] && exit 1; \
    rm -rf node_modules; \
    delay=$((attempt * 5)); \
    echo "pnpm install failed; retrying in ${delay}s"; \
    sleep "$delay"; \
    attempt=$((attempt + 1)); \
  done \
  && NODE_ENV=production ./tools/env.sh pnpm run build

############################
# Python dependencies      #
############################
FROM python:3.14-alpine AS backend
COPY --from=ghcr.io/astral-sh/uv:0.12.15 /uv /bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

############################
# Production runtime       #
############################
FROM python:3.14-alpine AS runner
ENV DATA_DIR=/data DJANGO_SETTINGS_MODULE=remdo.settings
ENV PATH=/app/.venv/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin
WORKDIR /app/backend
# hadolint ignore=DL3018
RUN apk add --no-cache caddy libstdc++ \
  && mkdir -p /data /etc/caddy /srv/remdo /usr/local/share/remdo
COPY --from=backend /app/.venv /app/.venv
COPY backend /app/backend
COPY --from=builder /app/dist /srv/remdo
COPY --from=builder /app/dist/.vite/manifest.json /app/dist/.vite/manifest.json
COPY --from=builder /app/node_modules/y-sweet/bin/y-sweet /usr/local/bin/y-sweet
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY docker/entrypoint.sh /entrypoint.sh
COPY tools/env.defaults.sh /usr/local/share/remdo/env.defaults.sh
COPY docker/entrypoint-env.sh /usr/local/share/remdo/entrypoint-env.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/y-sweet
CMD ["/entrypoint.sh"]
