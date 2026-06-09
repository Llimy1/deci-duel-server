#!/bin/bash
# 롤링 배포 스크립트 (init-ssl.sh 이후 업데이트 시 사용)
#
# 수행 순서:
#   1. git pull
#   2. prisma migrate deploy (RDS 대상)
#   3. nestjs 이미지 재빌드
#   4. nestjs 컨테이너 재시작 (nginx/certbot 무중단 유지)
#   5. 오래된 이미지 정리

set -e

echo "══════════════════════════════════════════"
echo " DeciDuel Server Deploy"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "══════════════════════════════════════════"

# ─── 코드 pull ──────────────────────────────────────────────────
echo ""
echo "▶ 최신 코드 pull (main)..."
git pull origin main

# ─── DB 마이그레이션 ────────────────────────────────────────────
echo ""
echo "▶ Prisma 마이그레이션 실행..."
# 현재 실행 중인 nestjs 컨테이너에서 migrate deploy 실행
# (컨테이너가 없으면 일회성 컨테이너로 실행)
if docker compose -f docker-compose.prod.yml ps nestjs | grep -q "running"; then
    docker compose -f docker-compose.prod.yml exec nestjs \
        node_modules/.bin/prisma migrate deploy
else
    docker compose -f docker-compose.prod.yml run --rm nestjs \
        node_modules/.bin/prisma migrate deploy
fi

echo "✅ 마이그레이션 완료"

# ─── 이미지 재빌드 ────────────────────────────────────────────────
echo ""
echo "▶ NestJS 이미지 재빌드..."
docker compose -f docker-compose.prod.yml build nestjs

# ─── 무중단 재시작 ───────────────────────────────────────────────
echo ""
echo "▶ NestJS 재시작 (nginx/certbot 유지)..."
docker compose -f docker-compose.prod.yml up -d --no-deps nestjs

# ─── 오래된 이미지 정리 ──────────────────────────────────────────
echo ""
echo "▶ 오래된 이미지 정리..."
docker image prune -f

# ─── 완료 ────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════"
echo "✅ 배포 완료!"
echo ""
docker compose -f docker-compose.prod.yml ps
echo "══════════════════════════════════════════"
