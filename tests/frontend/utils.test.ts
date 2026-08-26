// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import { describe, expect, it } from 'vitest';
import { formatTime, shuffled } from '@/app/lib/utils';

describe('shuffled', () => {
  it('원본을 변경하지 않는다', () => {
    const src = [1, 2, 3, 4, 5];
    shuffled(src);
    expect(src).toEqual([1, 2, 3, 4, 5]);
  });

  it('원소를 잃거나 더하지 않는다', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    for (let i = 0; i < 50; i++) {
      expect([...shuffled(src)].sort((a, b) => a - b)).toEqual(src);
    }
  });

  it('빈 배열과 1개 배열에서 터지지 않는다', () => {
    expect(shuffled([])).toEqual([]);
    expect(shuffled(['x'])).toEqual(['x']);
  });

  it('분포가 한쪽으로 치우치지 않는다', () => {
    // sort(() => Math.random() - 0.5)는 비교가 일관되지 않아 앞자리가 고정되는 경향이
    // 있다. 용의자 순서는 범인 위치를 가리는 유일한 장치이므로 균등해야 한다.
    const N = 3000;
    const firstPlace = new Map<number, number>([[0, 0], [1, 0], [2, 0]]);
    for (let i = 0; i < N; i++) {
      const head = shuffled([0, 1, 2])[0];
      firstPlace.set(head, (firstPlace.get(head) ?? 0) + 1);
    }
    for (const [value, count] of firstPlace) {
      const ratio = count / N;
      expect(ratio, `원소 ${value}가 첫 자리에 온 비율 ${ratio.toFixed(3)}`)
        .toBeGreaterThan(0.28);
      expect(ratio).toBeLessThan(0.39);
    }
  });
});

describe('formatTime', () => {
  it.each([
    [600, '10:00'],
    [59, '00:59'],
    [0, '00:00'],
    [61, '01:01'],
  ])('%d초 -> %s', (seconds, expected) => {
    expect(formatTime(seconds)).toBe(expected);
  });
});
