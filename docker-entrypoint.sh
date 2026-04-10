#!/bin/sh
set -e

echo "🚀 EconPedia 컨테이너 시작..."

# Nginx pid 파일 디렉터리 보장
mkdir -p /run/nginx

# ─── Node.js API 서버 (자동 복구 루프) ────────────────────
# Node.js가 크래시해도 Nginx(정적 사이트)는 살아있도록 분리.
# 크래시 시 3초 후 자동 재시작, 최대 무한 재시도.
start_node() {
  echo "📡 Subscribe API 서버 시작 (port 3001)..."
  while true; do
    cd /app/api
    node server.js || true
    echo "⚠️ Node.js API 크래시 감지. 3초 후 자동 재시작..."
    sleep 3
  done
}
start_node &
NODE_LOOP_PID=$!

# ─── Nginx 포그라운드 실행 ────────────────────────────────
echo "🌐 Nginx 시작..."
nginx -g "daemon off;" &
NGINX_PID=$!

# Nginx가 죽으면 컨테이너 종료 (Node 루프는 독립)
wait $NGINX_PID
echo "⚠️ Nginx 프로세스 종료 감지. 컨테이너를 종료합니다."
kill $NODE_LOOP_PID 2>/dev/null || true
