#!/bin/sh
set -e

echo "▶ Prisma 마이그레이션 실행..."
node_modules/.bin/prisma migrate deploy

echo "▶ NestJS 서버 시작..."
exec "$@"
