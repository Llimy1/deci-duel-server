# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
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

# Prisma schema (migrate deploy에 필요)
COPY prisma ./prisma

EXPOSE 3000

# dumb-init이 node 프로세스의 부모로서 신호를 올바르게 전달
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main"]
