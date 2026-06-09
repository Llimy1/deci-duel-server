#!/bin/bash
# 최초 서버 시작 스크립트 (최초 1회 실행)
# Cloudflare Origin Certificate 방식 — Certbot 불필요
#
# 사전 준비:
#   1. nginx/certs/deci-duel-certificate.pem  — Cloudflare Origin Certificate
#   2. nginx/certs/deci-duel-private.key      — 개인 키 (EC2에 SCP로 업로드)
#   3. .env 파일 생성 완료 (DATABASE_URL, JWT_SECRET 등)
#   4. Cloudflare DNS: api.deciduel.com → 프록시됨(주황 구름)
#   5. Cloudflare SSL/TLS 모드: Full (Strict)

set -e

echo "══════════════════════════════════════════"
echo " DeciDuel Server 최초 시작"
echo "══════════════════════════════════════════"

# ─── 인증서 파일 확인 ────────────────────────────────────────────
echo ""
echo "▶ Cloudflare Origin Certificate 확인..."

if [ ! -f "nginx/certs/deci-duel-certificate.pem" ] || [ ! -f "nginx/certs/deci-duel-private.key" ]; then
    echo "❌ 인증서 파일이 없습니다."
    echo "   다음 파일을 nginx/certs/에 배치 후 재시도하세요:"
    echo "     nginx/certs/deci-duel-certificate.pem  (Cloudflare Origin Certificate)"
    echo "     nginx/certs/deci-duel-private.key      (개인 키)"
    exit 1
fi

echo "✅ 인증서 파일 확인 완료"

# ─── .env 파일 확인 ────────────────────────────────────────────────
if [ ! -f ".env" ]; then
    echo "❌ .env 파일이 없습니다. .env.example을 참고해 생성 후 재시도하세요."
    exit 1
fi

# ─── nginx 설정 배포 ───────────────────────────────────────────────
echo ""
echo "▶ nginx 설정 배포..."
cp nginx/templates/app.conf nginx/conf.d/app.conf

# ─── DB 마이그레이션 ────────────────────────────────────────────────
echo ""
echo "▶ NestJS 이미지 빌드..."
docker compose -f docker-compose.prod.yml build nestjs

# ─── 서비스 시작 (migrate deploy는 entrypoint에서 자동 실행) ────────
echo ""
echo "▶ 전체 서비스 시작 (마이그레이션은 nestjs 시작 시 자동 실행)..."
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "══════════════════════════════════════════"
echo "✅ 서버 시작 완료!"
echo ""
docker compose -f docker-compose.prod.yml ps
echo "══════════════════════════════════════════"
