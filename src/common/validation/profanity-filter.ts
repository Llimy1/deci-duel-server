// 닉네임에 사용될 수 없는 비속어/욕설 목록 (한글 + 영문)
// 리더보드/대전 화면 등 다른 사용자에게 노출되는 UGC(닉네임)에 대한 최소한의 필터링
const BANNED_WORDS = [
  // 한글 비속어
  '시발',
  '씨발',
  '씨발놈',
  '씨발년',
  '시팔',
  '씨팔',
  '병신',
  '븅신',
  '개새끼',
  '개새',
  '새끼',
  '좆',
  '좇',
  '존나',
  '졸라',
  '지랄',
  '느금',
  '니애미',
  '니에미',
  '느그애비',
  '창녀',
  '창놈',
  '걸레년',
  '보지',
  '자지',
  '딱쳐',
  '꺼져',
  '죽어',
  '한남',
  '한녀',
  '메갈',
  '워마드',
  '일베',

  // 영문 비속어
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'dick',
  'pussy',
  'cunt',
  'bastard',
  'nigger',
  'nigga',
  'fag',
  'rape',
  'whore',
  'slut',
];

// 흔한 우회 표기를 정규화 (숫자/대체 문자 -> 알파벳)
const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  '$': 's',
};

function normalize(nickname: string): string {
  const lowered = nickname.toLowerCase();
  return Array.from(lowered)
    .map((ch) => LEET_MAP[ch] ?? ch)
    .join('');
}

export function containsProfanity(nickname: string): boolean {
  const normalized = normalize(nickname);
  return BANNED_WORDS.some((word) => normalized.includes(word));
}
