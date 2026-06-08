/**
 * metadata에 토큰/시크릿 류가 실수로 섞여 들어와도 저장 전에 한 번 더 걸러낸다.
 * 1차 방어선은 "애초에 넘기지 않기"이며, 이 함수는 2차 안전망이다.
 */
const SENSITIVE_KEY_PATTERN =
  /token|password|secret|^code$|adminaccesscode|authorization|cookie/i;

const MAX_DEPTH = 4;

export function sanitizeMetadata(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value) return null;
  const result = sanitizeValue(value, 0);
  return (result as Record<string, unknown>) ?? null;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : sanitizeValue(val, depth + 1);
    }
    return out;
  }

  return value;
}
