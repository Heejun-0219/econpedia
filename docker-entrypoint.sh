#!/bin/sh
set -e

echo "🚀 EconPedia 컨테이너 시작..."

# Nginx pid 파일 디렉터리 보장
mkdir -p /run/nginx

# Node.js API 서버 백그라운드 실행
echo "📡 Subscribe API 서버 시작 (port 3001)..."
cd /app/api
node server.js &
NODE_PID=$!

# Nginx 포그라운드 실행
echo "🌐 Nginx 시작..."
nginx -g "daemon off;" &
NGINX_PID=$!

# 둘 중 하나 종료 시 컨테이너 종료
wait -n $NODE_PID $NGINX_PID
echo "⚠️ 프로세스 종료 감지. 컨테이너를 종료합니다."
kill $NODE_PID $NGINX_PID 2>/dev/null || true
