// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import { describe, expect, it } from 'vitest';
import { ApiError, errorMessage } from '@/app/lib/http';

describe('errorMessage', () => {
  it('FastAPI의 detail을 읽는다', () => {
    expect(errorMessage({ detail: '한도 초과' }, '기본값')).toBe('한도 초과');
  });

  it('구 Route Handler의 error도 읽는다', () => {
    expect(errorMessage({ error: '구 형식' }, '기본값')).toBe('구 형식');
  });

  it('detail이 배열(422 검증 실패)이면 기본값을 쓴다', () => {
    expect(errorMessage({ detail: [{ loc: ['body'] }] }, '기본값')).toBe('기본값');
  });

  it.each([[null], [undefined], [{}], ['문자열'], [{ detail: '' }]])(
    '읽을 수 없으면 기본값 (%s)',
    (body) => {
      expect(errorMessage(body, '기본값')).toBe('기본값');
    },
  );
});

describe('ApiError', () => {
  it('429만 레이트 리밋이다', () => {
    // 429는 예외가 아니라 정상 동작이다. 재시도가 무의미하므로 반드시 구분해야 한다.
    expect(new ApiError(429, 'x').isRateLimited).toBe(true);
    for (const status of [400, 500, 503, 0]) {
      expect(new ApiError(status, 'x').isRateLimited).toBe(false);
    }
  });

  it('status 0만 클라이언트 중단이다', () => {
    expect(new ApiError(0, 'x').isAborted).toBe(true);
    expect(new ApiError(429, 'x').isAborted).toBe(false);
  });

  it('Error를 상속하고 메시지를 보존한다', () => {
    const e = new ApiError(429, '한도 초과');
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe('한도 초과');
    expect(e.name).toBe('ApiError');
  });
});
