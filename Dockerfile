# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# prisma generate는 DB 연결이 불필요하지만 prisma.config.ts를 로드함.
# 빌드 타임에 DATABASE_URL이 없으면 config가 throw하므로 더미값 주입.
# production 스테이지에는 영향 없음 (ENV는 스테이지 격리됨).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
# Prisma client 생성 (schema.prisma binaryTargets: native + linux-musl-arm64-openssl-3.0.x)
RUN npx prisma generate
RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# dumb-init: Node.js PID 1 신호 처리 (SIGTERM 등 graceful shutdown)
# curl: 헬스체크용
RUN apk add --no-cache dumb-init curl

COPY package*.json ./
# devDependencies 제외 설치
RUN npm ci --omit=dev && npm cache clean --force

# 빌드 결과물
COPY --from=builder /app/dist ./dist

# Prisma: 생성된 클라이언트 + 쿼리 엔진 바이너리 (npm ci --omit=dev로는 생성 안 됨)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Prisma CLI (deploy.sh에서 prisma migrate deploy 실행용)
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# Prisma schema + config (migrate deploy에 필요)
COPY prisma ./prisma
COPY prisma.config.ts ./

# 시작 시 migrate deploy → 앱 실행 순서를 보장하는 entrypoint
COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000

# dumb-init → entrypoint(migrate) → node dist/main
ENTRYPOINT ["/usr/bin/dumb-init", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/main"]
