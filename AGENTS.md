# 운영 제약 (150줄 이하 유지)

## 절대 금지
- rm -rf 계열 단독 실행 금지
- 프로덕션 DB 직접 수정 금지 (Prisma migrate만 사용)
- main/master 직접 push 금지
- .env 파일 커밋 금지
- Prisma migrate 없이 스키마 변경 금지
- docs/api.md 파괴적 변경 금지 (append/update만 허용)

## 파일 접근 제한
- 수정 허용: src/, prisma/, test/, docs/, .claude/
- 수정 금지: node_modules/, dist/, .env, .env.*

## 협업 규칙
- API 변경 시 docs/api.md 동기화 필수
- 백엔드→앱 전달 사항은 docs/CLAUDE_TO_CODEX.md에 append
- 앱→백엔드 요청은 deci-duel-app/docs/CODEX_TO_CLAUDE.md 확인

## 과거 실패 기록
- socket.io-client 버전 불일치: 서버와 동일한 버전(4.x)으로 설치해야 함
- settings.json에 mcpServers 필드 추가 불가: ~/.mcp.json 사용할 것
