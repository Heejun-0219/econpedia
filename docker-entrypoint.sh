#!/bin/sh

echo "🚀 EconPedia 컨테이너 시작..."

# Nginx 로그를 docker logs로 리다이렉트
mkdir -p /run/nginx /var/log/nginx
ln -sf /dev/stdout /var/log/nginx/access.log
ln -sf /dev/stderr /var/log/nginx/error.log

# ─── Nginx 설정 사전 검증 ──────────────────────────────────
echo "🔍 Nginx 설정 검증..."
if ! nginx -t 2>&1; then
  echo "❌ Nginx 설정 오류 - 컨테이너 종료"
  exit 1
fi
echo "✅ Nginx 설정 정상"

# ─── Node.js API 서버 (자동 복구 루프) ────────────────────
start_node() {
  echo "📡 Subscribe API 서버 시작 (port 3001)..."
  while true; do
    cd /app/api
    node server.js
    echo "⚠️ Node.js API 크래시 감지. 3초 후 자동 재시작..."
    sleep 3
  done
}
start_node &
NODE_LOOP_PID=$!

# ─── Nginx 포그라운드 실행 ────────────────────────────────
echo "🌐 Nginx 시작..."
nginx -g "daemon off;"
NGINX_EXIT=$?

echo "⚠️ Nginx 종료됨 (exit: $NGINX_EXIT). 컨테이너를 종료합니다."
kill $NODE_LOOP_PID 2>/dev/null || true
exit $NGINX_EXIT
