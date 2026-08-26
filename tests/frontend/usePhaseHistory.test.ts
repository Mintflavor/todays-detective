// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
//
// 브라우저 뒤로가기 처리 테스트.
//
// 이 로직은 실측으로만 검증했었다. 분기가 7개인데 하나라도 틀리면 결과가 나쁘다:
//   - intro에서 막으면 사이트에서 나갈 길이 없다 (함정)
//   - briefing에서 확인 없이 나가면 10분치 수사가 키 한 번에 사라진다
//   - 엔트리를 쌓으면 게임을 나온 뒤 뒤로가기가 여러 번 먹통이 된다
//
// popstate는 브라우저가 "이미 뒤로 갔다"고 알리는 이벤트다. 그래서 테스트도
// 이벤트를 직접 발생시켜 핸들러의 계약을 검증한다 (jsdom의 history.back()은
// 비동기라 타이밍에 의존하게 된다).

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import usePhaseHistory, { backTargetFor } from '@/app/hooks/usePhaseHistory';
import { GamePhase } from '@/app/types/game';

function setup(phase: GamePhase) {
  const goToPhase = vi.fn();
  const reset = vi.fn();
  const askQuit = vi.fn();
  const pushState = vi.spyOn(window.history, 'pushState');
  const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});

  const view = renderHook(
    (p: { phase: GamePhase }) =>
      usePhaseHistory({ phase: p.phase, goToPhase, reset, askQuit }),
    { initialProps: { phase } },
  );

  return { ...view, goToPhase, reset, askQuit, pushState, back };
}

/** 브라우저가 뒤로가기로 엔트리를 소비했을 때와 같은 상황을 만든다. */
function pressBack() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  });
}

beforeEach(() => {
  window.history.replaceState(null, '');
});

describe('backTargetFor', () => {
  it('intro에서는 이탈을 막지 않는다', () => {
    // 나갈 길이 없으면 그것도 함정이다.
    expect(backTargetFor('intro')).toEqual({ kind: 'exit' });
  });

  it.each<[GamePhase, GamePhase]>([
    ['investigation', 'briefing'],
    ['deduction', 'investigation'],
  ])('%s에서는 %s로 조용히 이동한다', (from, to) => {
    expect(backTargetFor(from)).toEqual({ kind: 'phase', phase: to });
  });

  it.each<GamePhase>(['load_menu', 'tutorial', 'resolution'])(
    '%s에서는 잃을 것이 없으므로 바로 인트로로 간다',
    (phase) => {
      expect(backTargetFor(phase)).toEqual({ kind: 'reset' });
    },
  );

  it.each<GamePhase>(['briefing', 'loading'])(
    '%s에서 나가려면 확인을 받는다',
    (phase) => {
      // briefing: 게임 내에서 더 뒤로 갈 곳이 없다 = 사건을 버린다
      // loading: 유료 생성이나 추리 평가가 진행 중일 수 있다
      expect(backTargetFor(phase)).toEqual({ kind: 'confirm' });
    },
  );

  it('진행 중인 수사를 확인 없이 버리는 경로가 없다', () => {
    const inProgress: GamePhase[] = ['briefing', 'investigation', 'deduction', 'loading'];
    for (const phase of inProgress) {
      expect(backTargetFor(phase).kind, `${phase}에서 바로 초기화된다`).not.toBe('reset');
    }
  });
});

describe('감시용 엔트리', () => {
  it('intro에서는 만들지 않는다', () => {
    // 만들어 두면 뒤로가기 한 번이 아무 일도 하지 않는다.
    const { pushState } = setup('intro');
    expect(pushState).not.toHaveBeenCalled();
  });

  it('게임 안으로 들어가면 하나 만든다', () => {
    const { rerender, pushState } = setup('intro');
    act(() => rerender({ phase: 'briefing' }));
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it('화면이 여러 번 바뀌어도 하나만 유지한다', () => {
    // phase마다 push하면 히스토리가 깊어져, 게임을 나온 뒤 뒤로가기가 여러 번 먹통이 된다.
    const { rerender, pushState } = setup('intro');
    act(() => rerender({ phase: 'tutorial' }));
    act(() => rerender({ phase: 'briefing' }));
    act(() => rerender({ phase: 'investigation' }));
    act(() => rerender({ phase: 'deduction' }));
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it('인트로로 돌아오면 회수한다', () => {
    const { rerender, back } = setup('intro');
    act(() => rerender({ phase: 'briefing' }));
    act(() => rerender({ phase: 'intro' }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('회수하며 부른 back의 popstate는 처리하지 않는다', () => {
    // 처리하면 intro에서 또 뒤로가기가 발생한 것처럼 보인다.
    const { rerender, reset, askQuit, goToPhase } = setup('intro');
    act(() => rerender({ phase: 'briefing' }));
    act(() => rerender({ phase: 'intro' }));
    pressBack();   // 우리가 부른 back()의 결과
    expect(reset).not.toHaveBeenCalled();
    expect(askQuit).not.toHaveBeenCalled();
    expect(goToPhase).not.toHaveBeenCalled();
  });
});

describe('뒤로가기 처리', () => {
  it('intro에서는 아무것도 하지 않는다 (브라우저가 이탈한다)', () => {
    const { goToPhase, reset, askQuit, pushState } = setup('intro');
    pressBack();
    expect(goToPhase).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(askQuit).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
  });

  it('investigation에서는 briefing으로 가고 엔트리를 다시 만든다', () => {
    const { rerender, goToPhase, pushState } = setup('intro');
    act(() => rerender({ phase: 'investigation' }));
    pushState.mockClear();

    pressBack();

    expect(goToPhase).toHaveBeenCalledWith('briefing');
    // 다시 만들지 않으면 다음 뒤로가기가 사이트 이탈로 새어 나간다.
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it('briefing에서는 확인만 받고 화면을 옮기지 않는다', () => {
    const { rerender, askQuit, goToPhase, reset, pushState } = setup('intro');
    act(() => rerender({ phase: 'briefing' }));
    pushState.mockClear();

    pressBack();

    expect(askQuit).toHaveBeenCalledTimes(1);
    expect(goToPhase).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it('확인을 취소해도 다음 뒤로가기를 계속 받는다', () => {
    const { rerender, askQuit, pushState } = setup('intro');
    act(() => rerender({ phase: 'briefing' }));
    pushState.mockClear();

    pressBack();
    pressBack();
    pressBack();

    expect(askQuit).toHaveBeenCalledTimes(3);
    expect(pushState).toHaveBeenCalledTimes(3);
  });

  it('resolution에서는 확인 없이 초기화한다', () => {
    const { rerender, reset, askQuit } = setup('intro');
    act(() => rerender({ phase: 'resolution' }));

    pressBack();

    expect(reset).toHaveBeenCalledTimes(1);
    expect(askQuit).not.toHaveBeenCalled();
  });

  it('초기화 경로에서는 엔트리를 다시 만들지 않는다', () => {
    // intro는 기준점이다. 여기서 push하면 뒤로가기 한 번이 먹통이 된다.
    const { rerender, pushState } = setup('intro');
    act(() => rerender({ phase: 'resolution' }));
    pushState.mockClear();

    pressBack();

    expect(pushState).not.toHaveBeenCalled();
  });

  it('deduction -> investigation -> briefing -> 확인 순서로 내려간다', () => {
    const { rerender, goToPhase, askQuit } = setup('intro');
    act(() => rerender({ phase: 'deduction' }));

    pressBack();
    expect(goToPhase).toHaveBeenLastCalledWith('investigation');

    act(() => rerender({ phase: 'investigation' }));
    pressBack();
    expect(goToPhase).toHaveBeenLastCalledWith('briefing');

    act(() => rerender({ phase: 'briefing' }));
    pressBack();
    expect(askQuit).toHaveBeenCalledTimes(1);
  });

  it('언마운트 후에는 popstate를 처리하지 않는다', () => {
    const { rerender, unmount, goToPhase } = setup('intro');
    act(() => rerender({ phase: 'investigation' }));
    unmount();

    pressBack();

    expect(goToPhase).not.toHaveBeenCalled();
  });
});
