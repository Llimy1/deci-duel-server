#!/bin/bash
# SSL 인증서 최초 발급 스크립트 (최초 1회만 실행)
# 2-phase: Phase 1 (HTTP only nginx) → certbot HTTP-01 → Phase 2 (HTTPS nginx)
#
# 실행 전 확인사항:
#   1. .env 파일 생성 완료 (DATABASE_URL, JWT_SECRET 등)
#   2. Cloudflare DNS에 api.deciduel.com A 레코드 43.202.20.183 등록 완료
#   3. EC2 Security Group 80/443 포트 열려 있음
#   4. docker, docker compose 설치 완료

set -e

DOMAIN="api.deciduel.com"
EMAIL="llimy.mh@gmail.com"

echo "══════════════════════════════════════════"
echo " DeciDuel Server SSL Bootstrap"
echo " Domain: $DOMAIN"
echo "══════════════════════════════════════════"

# ─── Phase 1: HTTP-only nginx 시작 ───────────────────────────────
echo ""
echo "▶ Phase 1: HTTP-only nginx 시작..."

# conf.d에 HTTP-only 설정 배포
cp nginx/templates/app.http.conf nginx/conf.d/app.conf

# nginx + nestjs 시작 (certbot은 아직)
docker compose -f docker-compose.prod.yml up -d nginx nestjs

echo "⏳ nginx 준비 대기 (8초)..."
sleep 8

# nginx 동작 확인
if ! docker compose -f docker-compose.prod.yml exec nginx nginx -t 2>/dev/null; then
    echo "❌ nginx 설정 오류. nginx 로그 확인:"
    docker compose -f docker-compose.prod.yml logs nginx
    exit 1
fi

echo "✅ nginx 정상 동작 확인"

# ─── Let's Encrypt 인증서 발급 ──────────────────────────────────
echo ""
echo "▶ Let's Encrypt 인증서 발급 중..."

docker compose -f docker-compose.prod.yml run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

echo "✅ 인증서 발급 완료"

# ─── Phase 2: HTTPS 설정으로 전환 ───────────────────────────────
echo ""
echo "▶ Phase 2: HTTPS 설정으로 전환..."

cp nginx/templates/app.https.conf nginx/conf.d/app.conf

# nginx 설정 검증
docker compose -f docker-compose.prod.yml exec nginx nginx -t

# nginx 리로드 (무중단)
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

echo "✅ HTTPS 설정 적용 완료"

# ─── 자동 갱신 crontab 등록 ────────────────────────────────────
echo ""
echo "▶ SSL 자동 갱신 crontab 등록..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RENEW_CMD="cd $SCRIPT_DIR && docker compose -f docker-compose.prod.yml run --rm certbot renew --quiet && docker compose -f docker-compose.prod.yml exec nginx nginx -s reload >> /var/log/certbot-renew.log 2>&1"

# 매일 새벽 3시 30분에 갱신 시도
(crontab -l 2>/dev/null | grep -v "certbot renew"; echo "30 3 * * * $RENEW_CMD") | crontab -

echo "✅ crontab 등록 완료 (매일 03:30 자동 갱신)"

# ─── 완료 ────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════"
echo "✅ SSL 설정 완료!"
echo "   https://$DOMAIN 접속 가능"
echo ""
echo "현재 실행 중인 컨테이너:"
docker compose -f docker-compose.prod.yml ps
echo "══════════════════════════════════════════"
