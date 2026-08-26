// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
//
// 취소된 생성 결과가 되살아나지 않는지 검증한다.
//
// 뒤로가기와 로딩 취소로 생성 중에 인트로로 나올 수 있게 되면서 생긴 버그다.
// 취소한 뒤 응답이 도착하면 setPreloadedData가 실행되어 **낡은 사건이 살아났고**,
// 그 상태에서 "새로운 의뢰"를 누르면 새 생성(159원)을 또 걸면서 화면에는 옛 사건이 떴다.
//
// Gemini는 호출하지 않는다 (API 계층을 목으로 대체하므로 비용 0원).

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaseData } from '@/app/types/game';

const generateCase = vi.fn();
const interrogateSuspect = vi.fn();
const evaluateDeduction = vi.fn();

vi.mock('@/app/hooks/useGeminiClient', () => ({
  default: () => ({ generateCase, interrogateSuspect, evaluateDeduction }),
}));

// 목 등록 후에 불러야 한다.
const { default: useGameEngine } = await import('@/app/hooks/useGameEngine');

function makeCase(title: string): CaseData {
  return {
    title,
    summary: '요약',
    crime_type: '절도',
    world_setting: { location: '창고', weather: '한파' },
    victim_info: {
      name: '피해자', damage_details: '', body_condition: '', incident_time: '02:00',
    },
    evidence_list: [{ name: '증거', description: '' }],
    suspects: [
      { id: 1, name: '가', role: '역', personality: '성격' },
      { id: 2, name: '나', role: '역', personality: '성격' },
      { id: 3, name: '다', role: '역', personality: '성격' },
    ],
    scenarioId: 'sid-' + title,
  };
}

/** 원하는 시점에 결과를 주기 위한 지연 프라미스. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  generateCase.mockReset();
  localStorage.clear();
  window.history.replaceState(null, '');
});

describe('취소된 생성 결과 무효화', () => {
  it('취소 후 도착한 사건은 버린다', async () => {
    const first = deferred<CaseData>();
    generateCase.mockReturnValueOnce(first.promise);

    const { result } = renderHook(() => useGameEngine());

    act(() => result.current.handleStartGame());
    expect(result.current.phase).toBe('tutorial');

    // 뒤로가기나 로딩 취소로 인트로로 나온다.
    act(() => result.current.resetGame());
    expect(result.current.phase).toBe('intro');

    // 그 뒤에 생성이 완료된다.
    await act(async () => {
      first.resolve(makeCase('낡은 사건'));
      await first.promise;
    });

    // 두 번째 의뢰. 여기서 낡은 사건이 살아나면 화면과 과금이 어긋난다.
    const second = deferred<CaseData>();
    generateCase.mockReturnValueOnce(second.promise);
    act(() => result.current.handleStartGame());
    act(() => result.current.handleTutorialComplete());

    expect(result.current.caseData).toBeNull();
    expect(result.current.phase).toBe('loading');

    // 두 번째 결과는 정상적으로 반영된다.
    await act(async () => {
      second.resolve(makeCase('새 사건'));
      await second.promise;
    });
    await waitFor(() => expect(result.current.phase).toBe('briefing'));
    expect(result.current.caseData?.title).toBe('새 사건');
  });

  it('취소 후 도착한 실패도 화면에 띄우지 않는다', async () => {
    const first = deferred<CaseData>();
    generateCase.mockReturnValueOnce(first.promise);

    const { result } = renderHook(() => useGameEngine());
    act(() => result.current.handleStartGame());
    act(() => result.current.resetGame());

    await act(async () => {
      first.reject(new Error('실패'));
      await first.promise.catch(() => {});
    });

    // 이미 인트로로 나온 사용자에게 지난 실패를 보여줄 이유가 없다.
    expect(result.current.gameError).toBeNull();
    expect(result.current.phase).toBe('intro');
  });

  it('취소하지 않으면 결과가 정상 반영된다', async () => {
    const d = deferred<CaseData>();
    generateCase.mockReturnValueOnce(d.promise);

    const { result } = renderHook(() => useGameEngine());
    act(() => result.current.handleStartGame());

    await act(async () => {
      d.resolve(makeCase('사건'));
      await d.promise;
    });
    act(() => result.current.handleTutorialComplete());

    expect(result.current.phase).toBe('briefing');
    expect(result.current.caseData?.title).toBe('사건');
  });
});

describe('생성 실패 처리', () => {
  it('실패하면 로딩에 갇히지 않고 인트로로 돌아온다', async () => {
    generateCase.mockRejectedValueOnce(new Error('실패'));

    const { result } = renderHook(() => useGameEngine());
    act(() => result.current.handleStartGame());
    await waitFor(() => expect(result.current.gameError).not.toBeNull());

    // 모달을 닫아도 실패한 사실은 남아야 한다.
    act(() => result.current.dismissError());
    act(() => result.current.handleTutorialComplete());

    expect(result.current.phase).toBe('intro');
    expect(result.current.gameError).not.toBeNull();
  });

  it('실패 후에도 기록실로 갈 길을 준다', async () => {
    generateCase.mockRejectedValueOnce(new Error('실패'));

    const { result } = renderHook(() => useGameEngine());
    act(() => result.current.handleStartGame());
    await waitFor(() => expect(result.current.gameError).not.toBeNull());

    // 유일한 행동이 유료 재호출이면 안 된다.
    expect(result.current.gameError?.secondary?.label).toContain('기록실');
  });
});

describe('사건 시작', () => {
  it('용의자 순서를 섞는다', async () => {
    // 프롬프트 예시 탓에 운영 데이터의 범인이 4/4 전부 id 2였다.
    // 기록 재생에서 순서가 고정되면 수사 없이 정답을 알게 된다.
    localStorage.setItem('td_tutorial_seen', '1');   // 튜토리얼을 건너뛰고 바로 브리핑으로
    const orders = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const { result } = renderHook(() => useGameEngine());
      act(() => result.current.handleLoadGame(makeCase('사건')));
      orders.add(result.current.caseData!.suspects.map((s) => s.id).join(''));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('용의자 id마다 대화 로그를 만든다', () => {
    // id를 1~3으로 가정하면 LLM이 다른 id를 주는 순간 렌더링에서 크래시한다.
    localStorage.setItem('td_tutorial_seen', '1');
    const odd = makeCase('사건');
    odd.suspects = [
      { id: 7, name: '가', role: '역', personality: 'p' },
      { id: 9, name: '나', role: '역', personality: 'p' },
    ];

    const { result } = renderHook(() => useGameEngine());
    act(() => result.current.handleLoadGame(odd));

    expect(result.current.chatLogs[7]).toBeDefined();
    expect(result.current.chatLogs[9]).toBeDefined();
    expect(result.current.chatLogs[0]).toBeDefined();   // 수사 수첩
    expect([7, 9]).toContain(result.current.currentSuspectId);
  });

  it('기록실 첫 방문이면 튜토리얼을 보여준다', () => {
    const { result } = renderHook(() => useGameEngine());
    act(() => result.current.handleLoadGame(makeCase('사건')));
    expect(result.current.phase).toBe('tutorial');
  });

  it('튜토리얼을 본 적이 있으면 바로 브리핑으로 간다', () => {
    localStorage.setItem('td_tutorial_seen', '1');
    const { result } = renderHook(() => useGameEngine());
    act(() => result.current.handleLoadGame(makeCase('사건')));
    expect(result.current.phase).toBe('briefing');
  });
});
