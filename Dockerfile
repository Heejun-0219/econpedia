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

# Nginx 실행에 필요한 /run/nginx 디렉터리
RUN mkdir -p /run/nginx /var/log/nginx /var/lib/nginx/tmp

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

# Health check (HTTPS or HTTP fallback)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider --no-check-certificate https://localhost/ \
   || wget --no-verbose --tries=1 --spider http://localhost/api/health \
   || exit 1

EXPOSE 80 443 3001

CMD ["/docker-entrypoint.sh"]
