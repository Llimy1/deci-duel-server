#!/bin/sh
set -e

echo "▶ Prisma 마이그레이션 실행..."
# DATABASE_URL은 docker-compose.prod.yml의 env_file로 이미 환경변수에 주입됨.
# prisma.config.ts에서 import 'dotenv/config' 제거 → process.env.DATABASE_URL 직접 참조.
node_modules/.bin/prisma migrate deploy

echo "▶ NestJS 서버 시작..."
exec "$@"
