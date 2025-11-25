FROM node:22-alpine

ARG YSWEET_VERSION=0.9.1

RUN apk add --no-cache caddy \
  && npm install -g "y-sweet@${YSWEET_VERSION}" \
  && mkdir -p /data /etc/caddy

COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 8080

ENV YSWEET_PORT_INTERNAL=8081
ENV ALLOW_ORIGIN="*"

CMD ["sh", "-c", "y-sweet serve --host 0.0.0.0 --port ${YSWEET_PORT_INTERNAL} /data & caddy run --config /etc/caddy/Caddyfile --adapter caddyfile"]
