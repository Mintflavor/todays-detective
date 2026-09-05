// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

/**
 * 브라우저 뒤로가기를 게임 내 뒤로가기로 만든다.
 *
 * 이 게임은 단일 페이지에서 phase만 바꾸므로 히스토리 엔트리가 생기지 않는다.
 * 그래서 뒤로가기를 누르면 **게임을 벗어나 다른 사이트로 나가버렸다** —
 * 수사 중이었다면 20분간의 심문 기록이 그대로 사라진다.
 * 안드로이드 하드웨어 뒤로가기도 같은 popstate로 들어온다.
 *
 * ## 엔트리를 쌓지 않는다
 *
 * phase마다 pushState를 하면 히스토리가 깊어지고, 게임을 나온 뒤에는 **뒤로가기를
 * 여러 번 눌러야 사이트를 떠날 수 있다** (누를 때마다 아무 일도 안 하는 것처럼 보인다).
 * 그래서 게임 안에 있는 동안 **엔트리를 정확히 하나만 유지**한다:
 *
 *   - 게임 안으로 들어가면 감시용 엔트리 1개를 만든다
 *   - 뒤로가기가 그 엔트리를 소비하면 처리하고 다시 하나 만든다
 *   - 인트로로 돌아가면 엔트리를 회수한다 → 뒤로가기 한 번에 사이트를 떠난다
 *
 * 어디로 갈지는 히스토리 내용이 아니라 현재 phase로 결정한다(`backTargetFor`).
 * 엔트리는 "뒤로가기를 우리가 받겠다"는 표식일 뿐이다.
 */

import { useCallback, useEffect, useRef } from 'react';
import { GamePhase } from '../types/game';

/** 뒤로가기 한 번이 어디로 가는가. */
type BackTarget =
  | { kind: 'phase'; phase: GamePhase }   // 조용히 이동 (되돌릴 수 있는 이동만)
  | { kind: 'reset' }                     // 인트로로 + 상태 정리 (잃을 것이 없을 때만)
  | { kind: 'confirm' }                   // 진행 중인 수사를 버리는 이동 — 확인을 받는다
  | { kind: 'exit' };                     // 사이트 이탈을 막지 않는다

/**
 * **되돌릴 수 없는 이동은 반드시 confirm이다.** 키 한 번으로 진행 중인 수사를
 * 날리면 안 된다. 반대로 사이트에서 나갈 길이 없으면 그것도 함정이므로
 * intro에서는 이탈을 막지 않는다.
 */
export function backTargetFor(phase: GamePhase): BackTarget {
  switch (phase) {
    case 'intro':
      return { kind: 'exit' };
    case 'load_menu':
    case 'tutorial':
      // 아직 사건이 시작되지 않았다. 잃을 것이 없다.
      return { kind: 'reset' };
    case 'loading':
      // 유료 생성이나 추리 평가가 진행 중일 수 있다.
      return { kind: 'confirm' };
    case 'briefing':
      // 게임 내에서 더 뒤로 갈 곳이 없다. 여기서 나가면 사건을 버린다.
      return { kind: 'confirm' };
    case 'investigation':
      return { kind: 'phase', phase: 'briefing' };
    case 'deduction':
      return { kind: 'phase', phase: 'investigation' };
    case 'resolution':
      // 게임이 끝났다. 버릴 것이 없다.
      return { kind: 'reset' };
    default:
      return { kind: 'exit' };
  }
}

interface PhaseHistoryOptions {
  phase: GamePhase;
  /** 조용한 화면 이동. */
  goToPhase: (phase: GamePhase) => void;
  /** 인트로로 돌아가며 게임 상태를 정리한다. */
  reset: () => void;
  /** 진행 중인 수사를 버릴지 확인을 받는다. */
  askQuit: () => void;
}

export default function usePhaseHistory({
  phase,
  goToPhase,
  reset,
  askQuit,
}: PhaseHistoryOptions): void {
  // popstate 핸들러가 최신 phase를 봐야 한다. 리스너는 한 번만 붙인다.
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /** 감시용 엔트리를 갖고 있는지. */
  const hasGuard = useRef(false);
  /** 우리가 직접 부른 history.back()의 popstate는 처리하지 않는다. */
  const ignoreNextPop = useRef(false);

  const addGuard = useCallback(() => {
    if (hasGuard.current) return;
    hasGuard.current = true;
    window.history.pushState({ tdGuard: true }, '');
  }, []);

  useEffect(() => {
    if (phase === 'intro') {
      // 엔트리를 남겨두면 뒤로가기 한 번이 아무 일도 하지 않는다. 회수한다.
      if (hasGuard.current) {
        hasGuard.current = false;
        ignoreNextPop.current = true;
        window.history.back();
      }
      return;
    }
    addGuard();
  }, [phase, addGuard]);

  const handlePop = useCallback(() => {
    if (ignoreNextPop.current) {
      ignoreNextPop.current = false;
      return;
    }

    hasGuard.current = false; // 엔트리가 소비됐다
    const target = backTargetFor(phaseRef.current);

    switch (target.kind) {
      case 'exit':
        return; // 인트로다. 브라우저가 이미 뒤로 갔다 — 막지 않는다.
      case 'confirm':
        // 화면은 그대로 두고 확인만 받는다. 다음 뒤로가기도 받으려면 엔트리가 필요하다.
        addGuard();
        askQuit();
        return;
      case 'reset':
        reset(); // phase가 intro가 되고, 위 effect는 hasGuard=false라 아무것도 하지 않는다
        return;
      case 'phase':
        goToPhase(target.phase);
        addGuard();
        return;
    }
  }, [addGuard, askQuit, goToPhase, reset]);

  useEffect(() => {
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [handlePop]);
}
