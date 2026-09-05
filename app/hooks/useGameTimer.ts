// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

/**
 * 수사 제한 시간.
 *
 * ## 왜 마감 시각(deadline) 방식인가
 *
 * 처음에는 `setInterval`로 1초마다 남은 초를 하나씩 깎았고, effect가
 * `[isActive, timerSeconds, onTimeUp]`에 의존했다. 세 가지가 조용히 깨져 있었다.
 *
 * 1. **타이핑하는 동안 시간이 멈췄다.** `onTimeUp`이 호출부에서 매 렌더 새로 만들어지는
 *    화살표 함수였고, 키를 누르면 `userInput`이 바뀌어 재렌더된다. 그때마다 effect가
 *    정리·재실행되어 **interval이 처음부터 다시 시작**했다. 1초보다 빠르게 치면
 *    interval이 한 번도 발화하지 않는다 — 타자가 빠른 사람일수록 시간이 공짜였다.
 * 2. **오차가 쌓였다.** `timerSeconds`가 의존성에 있어 매 tick마다 interval을 다시
 *    만들었다. 1000ms + 재생성 지연이 1200번 반복되면 20분 타이머가 눈에 띄게 느려진다.
 * 3. **탭을 가리면 거의 멈췄다.** 브라우저는 배경 탭의 타이머를 1분에 한 번까지 조인다.
 *    남은 초를 직접 깎는 방식에서는 그만큼 시간이 사라졌다 — 창을 내려두면 되는 셈이다.
 *
 * 그래서 **끝나는 시각을 잡아두고 남은 시간을 매번 계산한다.** tick을 몇 번 놓쳐도
 * 다음 tick에서 올바른 값으로 맞춰지고, 콜백 신원이 바뀌어도 타이머가 재시작되지 않는다.
 *
 * ## 멈춤
 *
 * `isActive`가 false인 동안은 마감 시각을 버리고 남은 시간을 그대로 들고 있다가,
 * 다시 활성화될 때 그 값으로 마감 시각을 새로 잡는다. 추리 화면에서 시간이 흐르지
 * 않는 것("이 화면에서는 시간이 흐르지 않습니다")과 AI가 답변을 만드는 동안
 * 멈추는 것이 모두 이 경로다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseGameTimerProps {
  initialSeconds: number;
  isActive: boolean;
  onTimeUp: () => void;
}

interface UseGameTimerReturn {
  timerSeconds: number;
  isOverTime: boolean;
  resetTimer: () => void;
}

/**
 * 초 경계를 놓치지 않을 만큼 자주 확인한다.
 * 값이 실제로 바뀔 때만 setState하므로 재렌더는 여전히 초당 1회다.
 */
const TICK_MS = 250;

export default function useGameTimer({
  initialSeconds,
  isActive,
  onTimeUp,
}: UseGameTimerProps): UseGameTimerReturn {
  const [timerSeconds, setTimerSeconds] = useState<number>(initialSeconds);
  const [isOverTime, setIsOverTime] = useState<boolean>(false);

  /**
   * 콜백을 ref에 담아 effect 의존성에서 뺀다.
   * 이것이 "타이핑하는 동안 시간이 멈추는" 버그의 핵심 수정이다 —
   * 호출부가 콜백을 useCallback으로 감싸는지에 타이머 정확도가 걸려 있으면 안 된다.
   */
  const onTimeUpRef = useRef(onTimeUp);
  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  /** 남은 초의 사본. effect가 `timerSeconds`에 의존하지 않고도 재개 지점을 알 수 있다. */
  const remainingRef = useRef<number>(initialSeconds);
  /** onTimeUp은 한 판에 한 번만 부른다. */
  const firedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isActive) return;

    // 재개 지점에서 마감 시각을 잡는다. 이후로는 이 값만 기준이다.
    const deadline = Date.now() + remainingRef.current * 1000;

    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (left !== remainingRef.current) {
        remainingRef.current = left;
        setTimerSeconds(left);
      }
      if (left === 0 && !firedRef.current) {
        firedRef.current = true;
        setIsOverTime(true);
        onTimeUpRef.current();
      }
    };

    tick();   // 즉시 한 번 — 멈춤 사이에 흐른 시간을 바로 반영한다
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [isActive]);

  const resetTimer = useCallback(() => {
    remainingRef.current = initialSeconds;
    firedRef.current = false;
    setTimerSeconds(initialSeconds);
    setIsOverTime(false);
  }, [initialSeconds]);

  return { timerSeconds, isOverTime, resetTimer };
}
