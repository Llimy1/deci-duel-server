import { containsProfanity } from './profanity-filter';

describe('containsProfanity', () => {
  it('정상 닉네임은 false를 반환한다', () => {
    expect(containsProfanity('데시듀얼')).toBe(false);
    expect(containsProfanity('PlayerOne')).toBe(false);
    expect(containsProfanity('소리왕123')).toBe(false);
  });

  it('한글 비속어가 포함되면 true를 반환한다', () => {
    expect(containsProfanity('시발닉네임')).toBe(true);
    expect(containsProfanity('병신왕')).toBe(true);
  });

  it('영문 비속어는 대소문자 구분 없이 감지한다', () => {
    expect(containsProfanity('FuckYou')).toBe(true);
    expect(containsProfanity('shitHead')).toBe(true);
  });

  it('숫자 치환(leet) 우회를 감지한다', () => {
    expect(containsProfanity('sh1t')).toBe(true);
    expect(containsProfanity('fu(k')).toBe(false); // 영문/숫자/한글만 허용되므로 특수문자 우회는 패턴 검증에서 차단됨
  });
});
