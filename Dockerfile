# === Stage 1: Build Astro ===
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# === Stage 2: Serve (Nginx + Node API) ===
FROM node:22-alpine AS runtime

# Nginx 설치
RUN apk add --no-cache nginx openssl

# ── Nginx 설정 ──────────────────────────────────────────
COPY nginx.conf /etc/nginx/nginx.conf

# Nginx 실행에 필요한 /run/nginx 디렉터리 및 로그 심볼릭 링크 설정
RUN mkdir -p /run/nginx /var/log/nginx /var/lib/nginx/tmp && \
    ln -sf /dev/stdout /var/log/nginx/access.log && \
    ln -sf /dev/stderr /var/log/nginx/error.log

# ── 정적 파일 복사 ───────────────────────────────────────
COPY --from=builder /app/dist /usr/share/nginx/html

# ── API 서버 의존성 ──────────────────────────────────────
WORKDIR /app/api
COPY package.json package-lock.json /app/
RUN cd /app && npm ci --omit=dev
COPY api/server.js ./server.js

# ── 시작 스크립트 ────────────────────────────────────────
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Health check (HTTP /health endpoint, no SSL needed)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO /dev/null http://localhost/health || exit 1

EXPOSE 80 443 3001

CMD ["/docker-entrypoint.sh"]
