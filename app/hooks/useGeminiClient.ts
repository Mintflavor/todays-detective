// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

/**
 * 백엔드 게임 API 호출 계층.
 *
 * **이 계층은 에러 상태를 갖지 않는다.** 실패하면 `ApiError`를 던지고 끝이다.
 * 무엇을 보여주고 무엇으로 재시도할지는 호출부(useGameEngine)가 결정한다.
 *
 * 과거에는 이 파일이 errorMsg와 retryAction을 직접 들고 있었는데,
 * 재시도 콜백으로 `generateCase` **자기 자신**을 등록하는 바람에
 * 재시도가 성공해도 그 결과를 받는 곳이 없었다. 사건 생성은 1회 약 159원이므로
 * "돈은 나가고 화면은 그대로"가 됐다. 상태 소유권을 호출부로 옮겨 구조적으로 막는다.
 */

import { API_BASE, ApiError, errorMessage, readJson } from '../lib/http';
import { CaseData, Evaluation, Evidence } from '../types/game';

/**
 * 사건 생성 상한 타임아웃.
 *
 * 실측 25~31초다. NPM·Next는 300초까지 기다리므로 그대로 두면 무한정 로딩만 돈다.
 * 넉넉하게 잡되 반드시 끝나게 한다. 중단해도 서버 작업은 계속되며 시나리오는
 * 저장되므로, 타임아웃 시에는 기록실을 안내한다 (호출부 참조).
 */
const CASE_TIMEOUT_MS = 120_000;

/** 응답을 검사해 실패면 ApiError를 던진다. */
async function ensureOk(response: Response, fallback: string): Promise<unknown> {
  const data = await readJson(response);
  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(data, fallback));
  }
  return data;
}

async function generateCase(): Promise<CaseData> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CASE_TIMEOUT_MS);

  let data: unknown;
  try {
    const response = await fetch(`${API_BASE}/api/game/start`, {
      method: 'POST',
      signal: controller.signal,
    });
    data = await ensureOk(response, '사건 파일을 불러오는데 실패했습니다.');
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError(0, '사건 생성이 너무 오래 걸립니다.');
    }
    throw new ApiError(0, '서버에 연결할 수 없습니다.');
  } finally {
    clearTimeout(timer);
  }

  const body = data as { caseData?: CaseData; scenarioId?: string };
  if (!body?.caseData) {
    throw new ApiError(500, '사건 파일이 손상되었습니다.');
  }
  return { ...body.caseData, scenarioId: body.scenarioId } as CaseData;
}

export interface InterrogateResult {
  reply: string;
  isContradiction: boolean;
  unlockedEvidence?: Evidence;
}

async function interrogateSuspect(
  scenarioId: string,
  suspectId: number,
  history: string,
  userMsg: string,
  presentedEvidenceName?: string,
  unlockedEvidenceNames?: string[]
): Promise<InterrogateResult> {
  let data: unknown;
  try {
    const response = await fetch(`${API_BASE}/api/game/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioId,
        suspectId,
        message: userMsg,
        history,
        presentedEvidenceName,
        unlockedEvidenceNames,
      }),
    });
    data = await ensureOk(response, '용의자와의 통신이 불안정합니다.');
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, '서버에 연결할 수 없습니다.');
  }
  const body = data as {
    reply: string;
    isContradiction?: boolean;
    unlockedEvidence?: Evidence;
  };
  return {
    reply: body.reply,
    isContradiction: Boolean(body.isContradiction),
    unlockedEvidence: body.unlockedEvidence,
  };
}

async function evaluateDeduction(
  scenarioId: string,
  culpritName: string,
  reasoning: string,
  isOverTime: boolean,
  unlockedEvidenceNames?: string[]
): Promise<Evaluation> {
  let data: unknown;
  try {
    const response = await fetch(`${API_BASE}/api/game/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioId,
        deductionData: {
          culpritName,
          reasoning,
          isOverTime,
          unlockedEvidenceNames,
        },
      }),
    });
    data = await ensureOk(response, '추리 평가 중 오류가 발생했습니다.');
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, '서버에 연결할 수 없습니다.');
  }

  const d = data as Omit<Evaluation, 'timeTaken'>;
  return {
    isCorrect: d.isCorrect,
    report: d.report,
    advice: d.advice,
    grade: d.grade,
    truth: d.truth,
    culpritName: d.culpritName,
    timeTaken: '',
  };
}

interface UseGeminiClientReturn {
  generateCase: () => Promise<CaseData>;
  interrogateSuspect: (
    scenarioId: string,
    suspectId: number,
    history: string,
    userMsg: string,
    presentedEvidenceName?: string,
    unlockedEvidenceNames?: string[]
  ) => Promise<InterrogateResult>;
  evaluateDeduction: (
    scenarioId: string,
    culpritName: string,
    reasoning: string,
    isOverTime: boolean,
    unlockedEvidenceNames?: string[]
  ) => Promise<Evaluation>;
}

// 모듈 수준 함수라 참조가 안정적이다 — useCallback 의존성 배열이 매 렌더 깨지지 않는다.
export default function useGeminiClient(): UseGeminiClientReturn {
  return { generateCase, interrogateSuspect, evaluateDeduction };
}
