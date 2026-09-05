// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
//
// 제한 시간 테스트.
//
// 이 훅이 깨지면 **예외 없이 시간만 공짜가 된다.** 화면은 정상이고 숫자가 천천히
// 줄거나 아예 멈출 뿐이라 눈으로는 잡기 어렵다. 실제로 세 가지가 조용히 깨져 있었다:
//
//   1. 타이핑하는 동안 시간이 멈췄다 (콜백 신원이 매 렌더 바뀌어 interval이 재시작)
//   2. tick마다 interval을 다시 만들어 20분에 걸쳐 오차가 쌓였다
//   3. 배경 탭에서 브라우저가 타이머를 조이면 그만큼 시간이 사라졌다
//
// 그래서 "남은 초를 깎는" 방식이 아니라 "마감 시각에서 계산하는" 방식임을 단정한다.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useGameTimer from '@/app/hooks/useGameTimer';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** 실제 시계와 타이머를 함께 진행시킨다 (마감 시각 계산이 Date.now에 의존한다). */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('기본 동작', () => {
  it('활성 상태에서 초가 줄어든다', () => {
    const { result } = renderHook(() =>
      useGameTimer({ initialSeconds: 1200, isActive: true, onTimeUp: () => {} }),
    );
    expect(result.current.timerSeconds).toBe(1200);

    advance(3_000);
    expect(result.current.timerSeconds).toBe(1197);
  });

  it('비활성 상태에서는 흐르지 않는다', () => {
    const { result } = renderHook(() =>
      useGameTimer({ initialSeconds: 1200, isActive: false, onTimeUp: () => {} }),
    );
    advance(10_000);
    expect(result.current.timerSeconds).toBe(1200);
  });
});

describe('타이핑 중에도 시간이 흐른다', () => {
  it('콜백이 매 렌더 새 함수여도 멈추지 않는다', () => {
    // 이것이 실제로 보고된 버그다. 호출부는 `onTimeUp: () => setShowTimeOverModal(true)`처럼
    // 인라인 화살표 함수를 넘기고, 키를 누르면 입력 상태가 바뀌어 재렌더된다.
    // 타이머 정확도가 호출부의 useCallback 여부에 걸려 있으면 안 된다.
    const { result, rerender } = renderHook(
      ({ tick }: { tick: number }) =>
        useGameTimer({
          initialSeconds: 1200,
          isActive: true,
          // 매번 새 함수 신원
          onTimeUp: () => void tick,
        }),
      { initialProps: { tick: 0 } },
    );

    // 1초보다 빠르게 20번 재렌더한다 (초당 4타 정도로 5초간 타이핑)
    for (let i = 1; i <= 20; i++) {
      advance(250);
      act(() => rerender({ tick: i }));
    }

    // 5초가 흘렀다. 재시작 버그가 있으면 1200에서 꼼짝하지 않는다.
    expect(result.current.timerSeconds).toBe(1195);
  });

  it('재렌더가 잦아도 오차가 쌓이지 않는다', () => {
    const { result, rerender } = renderHook(
      ({ n }: { n: number }) =>
        useGameTimer({ initialSeconds: 1200, isActive: true, onTimeUp: () => void n }),
      { initialProps: { n: 0 } },
    );

    // 60초 동안 100ms마다 재렌더
    for (let i = 1; i <= 600; i++) {
      advance(100);
      act(() => rerender({ n: i }));
    }
    expect(result.current.timerSeconds).toBe(1140);
  });
});

describe('멈춤과 재개', () => {
  it('멈춘 동안의 시간은 흐르지 않고, 재개하면 이어진다', () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useGameTimer({ initialSeconds: 100, isActive: active, onTimeUp: () => {} }),
      { initialProps: { active: true } },
    );

    advance(10_000);
    expect(result.current.timerSeconds).toBe(90);

    // 추리 화면으로 이동 = 멈춤
    act(() => rerender({ active: false }));
    advance(30_000);
    expect(result.current.timerSeconds).toBe(90);

    // 수사로 복귀 = 재개
    act(() => rerender({ active: true }));
    advance(5_000);
    expect(result.current.timerSeconds).toBe(85);
  });
});

describe('배경 탭', () => {
  it('tick을 놓쳐도 실제로 흐른 시간이 반영된다', () => {
    // 브라우저는 배경 탭의 타이머를 1분에 한 번까지 조인다.
    // 남은 초를 직접 깎는 방식이면 그만큼 시간이 사라진다 — 창을 내려두면 되는 셈이다.
    //
    // ⚠️ `advanceTimersByTime`으로는 이걸 재현할 수 없다. 가짜 타이머는 밀린 tick을
    //    **전부 실행**하므로 옛 구현도 통과한다 (실제로 그래서 이 테스트가 한 번
    //    거짓 통과했다). 시계만 앞으로 옮기고 tick은 한 번만 발화시켜야 한다.
    const { result } = renderHook(() =>
      useGameTimer({ initialSeconds: 1200, isActive: true, onTimeUp: () => {} }),
    );

    act(() => {
      vi.setSystemTime(Date.now() + 300_000);   // 5분 경과, 그동안 tick 없음
      vi.advanceTimersByTime(250);              // 복귀 후 첫 tick
    });

    expect(result.current.timerSeconds).toBe(900);
  });
});

describe('시간 초과', () => {
  it('0에서 멈추고 onTimeUp을 한 번만 부른다', () => {
    const onTimeUp = vi.fn();
    const { result } = renderHook(() =>
      useGameTimer({ initialSeconds: 3, isActive: true, onTimeUp }),
    );

    advance(3_000);
    expect(result.current.timerSeconds).toBe(0);
    expect(result.current.isOverTime).toBe(true);
    expect(onTimeUp).toHaveBeenCalledTimes(1);

    // 초과 후에도 수사는 계속할 수 있다 (등급만 B로 제한된다).
    // 음수로 내려가거나 모달이 다시 뜨면 안 된다.
    advance(20_000);
    expect(result.current.timerSeconds).toBe(0);
    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });

  it('멈췄다 재개해도 초과 통보는 한 번이다', () => {
    const onTimeUp = vi.fn();
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useGameTimer({ initialSeconds: 2, isActive: active, onTimeUp }),
      { initialProps: { active: true } },
    );

    advance(2_000);
    expect(onTimeUp).toHaveBeenCalledTimes(1);

    act(() => rerender({ active: false }));
    act(() => rerender({ active: true }));
    advance(5_000);
    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });
});

describe('초기화', () => {
  it('resetTimer가 시간과 초과 상태를 되돌린다', () => {
    const onTimeUp = vi.fn();
    const { result } = renderHook(() =>
      useGameTimer({ initialSeconds: 5, isActive: true, onTimeUp }),
    );

    advance(5_000);
    expect(result.current.isOverTime).toBe(true);

    act(() => result.current.resetTimer());
    expect(result.current.timerSeconds).toBe(5);
    expect(result.current.isOverTime).toBe(false);

    // 초기화 후에는 초과 통보를 다시 받을 수 있어야 한다 (다음 판이다).
    advance(5_000);
    expect(onTimeUp).toHaveBeenCalledTimes(2);
  });
});
