// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

/**
 * 백엔드 호출 공통 헬퍼.
 *
 * 모든 API 호출은 same-origin `/server/*` 를 지나 Next rewrite가 api 컨테이너로 넘긴다.
 * 그래서 브라우저 CORS가 발생하지 않고, `NEXT_PUBLIC_API_URL`처럼 빌드 타임에 박히는
 * 환경변수도 필요 없다.
 */
export const API_BASE = '/server';

/**
 * 에러 응답에서 메시지를 뽑는다.
 *
 * FastAPI는 `{ "detail": "..." }` 형태로 반환한다.
 * 과거 Next.js Route Handler는 `{ "error": "..." }` 였으므로 둘 다 받아준다.
 * `detail`이 검증 실패(422)일 때는 배열이므로 그 경우는 fallback을 쓴다.
 */
export function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const { detail, error } = body as { detail?: unknown; error?: unknown };
    if (typeof detail === 'string' && detail) return detail;
    if (typeof error === 'string' && error) return error;
  }
  return fallback;
}

/**
 * HTTP 상태를 들고 다니는 에러.
 *
 * 호출부가 429(레이트 리밋)와 그 외를 구분해야 한다. 예산 상한에 걸린 것과
 * 통신이 끊긴 것은 플레이어가 취할 행동이 정반대다 — 전자는 기록실로 가면 되고
 * 후자는 재시도하면 된다. 문구를 뭉개면 출구를 안내할 수 없다.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  /** 레이트 리밋. 재시도는 무의미하고 기록실로 유도해야 한다. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** 클라이언트가 자체적으로 끊은 경우 (타임아웃/취소). 서버 작업은 계속될 수 있다. */
  get isAborted(): boolean {
    return this.status === 0;
  }
}

/** 응답 본문을 JSON으로 읽는다. 본문이 없거나 JSON이 아니면 빈 객체를 준다. */
export async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}
