#!/bin/sh
set -e

echo "▶ Prisma 마이그레이션 실행..."
# prisma.config.ts가 dotenv/config로 .env 파일을 읽음.
# 컨테이너에는 .env 파일이 없고(dockerignore) env_file로 env var만 주입됨.
# 임시로 .env 생성해 prisma migrate deploy가 DATABASE_URL을 찾을 수 있도록 함.
printf 'DATABASE_URL=%s\n' "${DATABASE_URL}" > /app/.env
node_modules/.bin/prisma migrate deploy
rm -f /app/.env

echo "▶ NestJS 서버 시작..."
exec "$@"
