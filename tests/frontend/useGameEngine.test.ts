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

describe('심문 횟수는 용의자별로 따로다', () => {
  // 예전에는 20을 셋이 공유했다. 한 명에게 다 쓰면 나머지 둘은 아예 만나지 못했다 —
  // 플레이어의 선택이 아니라 규칙이 만든 데드엔드였다.
  beforeEach(() => {
    localStorage.setItem('td_tutorial_seen', '1');
  });

  it('용의자 id마다 몫을 만든다', () => {
    const { result } = renderHook(() => useGameEngine());
    act(() => result.current.handleLoadGame(makeCase('사건')));

    const total = result.current.totalActionPoints;
    for (const s of result.current.caseData!.suspects) {
      expect(result.current.actionPoints[s.id]).toBe(total);
    }
    // 수사 수첩은 AP를 쓰지 않으므로 몫이 없다.
    expect(result.current.actionPoints[0]).toBeUndefined();
  });

  it('id를 1~3으로 가정하지 않는다', () => {
    // case_data는 스키마를 걸지 않은 LLM 출력이라 id가 달라질 수 있다.
    const odd = makeCase('사건');
    odd.suspects = [
      { id: 7, name: '가', role: '역', personality: 'p' },
      { id: 9, name: '나', role: '역', personality: 'p' },
    ];
    const { result } = renderHook(() => useGameEngine());
    act(() => result.current.handleLoadGame(odd));

    expect(result.current.actionPoints[7]).toBe(result.current.totalActionPoints);
    expect(result.current.actionPoints[9]).toBe(result.current.totalActionPoints);
  });

  it('한 용의자에게 써도 다른 용의자의 몫은 줄지 않는다', async () => {
    interrogateSuspect.mockResolvedValue({ reply: '진술', isContradiction: false });

    const { result } = renderHook(() => useGameEngine());
    act(() => result.current.handleLoadGame(makeCase('사건')));

    const ids = result.current.caseData!.suspects.map((s) => s.id);
    const [target, other] = ids;
    const total = result.current.totalActionPoints;

    act(() => result.current.setCurrentSuspectId(target));
    await act(async () => {
      result.current.handleInputChange({ target: { value: '어디 있었습니까?' } } as never);
    });
    await act(async () => {
      result.current.handleSendMessage();
    });

    expect(result.current.actionPoints[target]).toBe(total - 1);
    expect(result.current.actionPoints[other]).toBe(total);
  });

  it('용의자 진술이 모순일 때 조서에 붉은 시스템 메시지가 삽입된다', async () => {
    interrogateSuspect.mockResolvedValue({ reply: '저는 계속 방에 있었습니다.', isContradiction: true });

    const { result } = renderHook(() => useGameEngine());
    act(() => result.current.handleLoadGame(makeCase('사건')));

    const target = result.current.caseData!.suspects[0].id;
    act(() => result.current.setCurrentSuspectId(target));
    await act(async () => {
      result.current.handleInputChange({ target: { value: '알리바이가 뭡니까?' } } as never);
    });
    await act(async () => {
      result.current.handleSendMessage();
    });

    const logs = result.current.chatLogs[target]!;
    // 0: 초기 현장 정보, 1: user 질문, 2: ai 답변, 3: system 모순 알림
    expect(logs).toHaveLength(4);
    expect(logs[1]).toEqual({ role: 'user', text: '알리바이가 뭡니까?' });
    expect(logs[2]).toEqual({ role: 'ai', text: '저는 계속 방에 있었습니다.' });
    expect(logs[3]).toEqual({
      role: 'system',
      text: '※ 조서 특기사항: 용의자의 미세한 동요 포착 — 확인된 사실과의 불일치',
    });
  });

  it('용의자 진술이 모순이 아닐 때는 시스템 메시지가 삽입되지 않는다', async () => {
    interrogateSuspect.mockResolvedValue({ reply: '아무것도 모릅니다.', isContradiction: false });

    const { result } = renderHook(() => useGameEngine());
    act(() => result.current.handleLoadGame(makeCase('사건')));

    const target = result.current.caseData!.suspects[0].id;
    act(() => result.current.setCurrentSuspectId(target));
    await act(async () => {
      result.current.handleInputChange({ target: { value: '알리바이가 뭡니까?' } } as never);
    });
    await act(async () => {
      result.current.handleSendMessage();
    });

    const logs = result.current.chatLogs[target]!;
    // 0: 초기 현장 정보, 1: user 질문, 2: ai 답변
    expect(logs).toHaveLength(3);
    expect(logs[1]).toEqual({ role: 'user', text: '알리바이가 뭡니까?' });
    expect(logs[2]).toEqual({ role: 'ai', text: '아무것도 모릅니다.' });
  });

  it('전체 잔량 합계도 내보낸다 (추리 화면용)', () => {
    const { result } = renderHook(() => useGameEngine());
    act(() => result.current.handleLoadGame(makeCase('사건')));

    const count = result.current.caseData!.suspects.length;
    expect(result.current.apGrandTotal).toBe(count * result.current.totalActionPoints);
    expect(result.current.apRemainingTotal).toBe(result.current.apGrandTotal);
  });

  it('초기화하면 몫이 사라진다', () => {
    const { result } = renderHook(() => useGameEngine());
    act(() => result.current.handleLoadGame(makeCase('사건')));
    act(() => result.current.resetGame());
    expect(result.current.actionPoints).toEqual({});
  });

  describe('증거 제시 및 해금', () => {
    it('증거를 첨부하여 질문을 보내면 displayText에 증거 제시가 포함되고 해금된 증거가 등록된다', async () => {
      interrogateSuspect.mockResolvedValue({
        reply: '사실 그 열쇠는 제가 숨겼습니다.',
        isContradiction: false,
        unlockedEvidence: { name: '비밀 열쇠', description: '화분 밑에서 발견' },
      });

      const { result } = renderHook(() => useGameEngine());
      act(() => result.current.handleLoadGame(makeCase('사건')));

      const target = result.current.caseData!.suspects[0].id;
      act(() => result.current.setCurrentSuspectId(target));

      act(() => result.current.setSelectedEvidenceName('피 묻은 손수건'));
      await act(async () => {
        result.current.handleInputChange({ target: { value: '이 손수건을 보십시오.' } } as never);
      });
      await act(async () => {
        result.current.handleSendMessage();
      });

      const logs = result.current.chatLogs[target]!;
      expect(logs[1].text).toContain('[증거 제시: 피 묻은 손수건]');
      expect(logs[2].text).toBe('사실 그 열쇠는 제가 숨겼습니다.');
      expect(logs[3].role).toBe('system');
      expect(logs[3].text).toContain('새로운 증거 확보: [비밀 열쇠]');

      const evidenceList = result.current.caseData!.evidence_list;
      expect(evidenceList.some(e => e.name === '비밀 열쇠')).toBe(true);
    });

    it('이미 존재하는 증거가 응답으로 내려와도 중복 등록되거나 중복 시스템 메시지가 남지 않는다', async () => {
      interrogateSuspect.mockResolvedValue({
        reply: '이미 아시는 증거입니다.',
        isContradiction: false,
        unlockedEvidence: { name: '현장 증거 1', description: '기존에 이미 있던 증거' },
      });

      const { result } = renderHook(() => useGameEngine());
      const customCase = makeCase('사건');
      customCase.evidence_list = [{ name: '현장 증거 1', description: '기존에 이미 있던 증거' }];
      act(() => result.current.handleLoadGame(customCase));

      const target = result.current.caseData!.suspects[0].id;
      act(() => result.current.setCurrentSuspectId(target));

      await act(async () => {
        result.current.handleInputChange({ target: { value: '현장 증거 1에 대해 말해보세요.' } } as never);
      });
      await act(async () => {
        result.current.handleSendMessage();
      });

      const logs = result.current.chatLogs[target]!;
      // 0: 초기 정보, 1: 질문, 2: 답변 ('새로운 증거 확보' 시스템 메시지가 없어야 함)
      expect(logs).toHaveLength(3);
      expect(logs.some(l => l.role === 'system' && l.text.includes('새로운 증거 확보'))).toBe(false);
      expect(result.current.caseData!.evidence_list).toHaveLength(1);
      expect(result.current.newlyUnlockedEvidence).toBeNull();
    });
  });
});
