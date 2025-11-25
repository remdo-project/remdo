FROM node:22-alpine

ARG YSWEET_VERSION=0.9.1

RUN npm install -g "y-sweet@${YSWEET_VERSION}" \
  && mkdir -p /data

EXPOSE 8080

CMD ["sh", "-c", "y-sweet serve --host 0.0.0.0 --port ${PORT:-8080} /data"]
