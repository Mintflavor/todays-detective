# 🔒 프로젝트: 스포일러 방지 서버 사이드 아키텍처 전환 계획 (Project Anti-Spoiler)

## 1. 개요 (Overview)
현재 클라이언트(브라우저)가 Gemini API로부터 사건의 전말(범인, 트릭, 정답)이 포함된 전체 JSON 데이터를 직접 수신하고 있어, 개발자 도구를 통해 정답이 유출될 수 있는 보안 취약점이 발견되었습니다. 이를 해결하기 위해 **Next.js API Routes**가 중계 서버 역할을 수행하며, 중요 데이터를 **Python Backend(DB)**에 은닉하고 게임 로직(심문, 추리 평가)을 서버 사이드에서 수행하도록 아키텍처를 개편합니다.

## 2. 목표 (Goals)
1.  **데이터 은닉:** 클라이언트는 절대 `culprit`, `trick`, `truth` 등의 민감한 데이터를 수신하지 않음. 오직 `scenarioId`와 공개된 사건 개요만 수신.
2.  **게임 로직 이관:** 프롬프트 생성 및 AI 호출 로직을 클라이언트(`useGeminiClient`)에서 서버(`app/api/gemini/*`)로 이관.
3.  **투명한 경험 유지:** 플레이어에게는 기존과 동일한 반응 속도와 게임 경험 제공.

## 3. 아키텍처 변경 사항 (Architecture Changes)

### AS-IS (현재)
*   **Client:** 사건 생성 요청 -> Gemini (전체 데이터 수신) -> `caseData` state 저장 (정답 포함).
*   **Interrogation:** Client가 정답 데이터를 프롬프트에 포함하여 Gemini 호출.
*   **Evaluation:** Client가 정답 데이터를 프롬프트에 포함하여 Gemini 호출.

### TO-BE (변경 후)
*   **Client:** 생성 요청 -> **Next.js API** -> Gemini -> **Python Backend(DB 저장)** -> Client (`scenarioId`, `intro` 데이터만 수신).
*   **Interrogation:** Client가 `scenarioId`, `question` 전송 -> **Next.js API** (DB에서 정답 조회 + 프롬프트 조립) -> Gemini -> Client (답변만 수신).
*   **Evaluation:** Client가 `scenarioId`, `deduction` 전송 -> **Next.js API** (DB에서 정답 조회 + 채점) -> Client (결과만 수신).

## 4. 상세 구현 계획 (Implementation Details)

### Phase 1: 백엔드 API 점검 및 프롬프트 이관 (Preparation)
*   **Backend (Python):** `GET /scenarios/{id}`가 `case_data` 전체를 반환하는지 확인. (이미 구현됨)
*   **Frontend Library:** `app/lib/prompts.ts`의 프롬프트 생성 함수들을 `app/api/gemini/lib/prompts.ts` (서버 전용)로 이동.

### Phase 2: Next.js API Routes 재설계 (Server-Side Logic)
기존 `app/api/gemini/route.js`를 폐기하고, 기능별로 분리된 API 엔드포인트를 신설합니다.

#### 2.1 사건 생성 및 저장 (`app/api/game/start/route.ts`)
*   **Method:** `POST`
*   **Logic:**
    1.  Gemini에게 사건 생성 요청.
    2.  생성된 JSON을 검증.
    3.  Python Backend의 `POST /scenarios`를 호출하여 DB에 저장.
    4.  저장된 `_id`와 클라이언트 공개용 데이터(제목, 개요, 용의자 목록 등)만 필터링하여 반환.

#### 2.2 용의자 심문 (`app/api/game/chat/route.ts`)
*   **Method:** `POST`
*   **Body:** `{ scenarioId, suspectId, message, history }`
*   **Logic:**
    1.  `scenarioId`로 Python Backend에서 전체 사건 데이터(`caseData`) 조회.
    2.  `caseData`에서 해당 `suspectId`의 비밀 정보(범인 여부, 비밀, 알리바이) 추출.
    3.  서버 사이드에서 시스템 프롬프트 조립.
    4.  Gemini 호출 후 답변 반환.

#### 2.3 추리 평가 (`app/api/game/evaluate/route.ts`)
*   **Method:** `POST`
*   **Body:** `{ scenarioId, deductionData }`
*   **Logic:**
    1.  `scenarioId`로 Python Backend에서 정답 데이터(`truth`, `culprit`) 조회.
    2.  사용자 추리와 정답을 비교하는 평가 프롬프트 생성.
    3.  Gemini 호출 후 채점 결과 반환.

### Phase 3: 클라이언트 수정 (Frontend Migration)
`app/hooks/useGeminiClient.ts`를 대폭 수정하여 로직을 단순화합니다.

*   `generateCase()`: `/api/game/start` 호출. 반환된 `scenarioId`를 상태에 저장.
*   `interrogateSuspect()`: `/api/game/chat` 호출.
*   `evaluateDeduction()`: `/api/game/evaluate` 호출.
*   **State Management:** `useGameEngine.ts`에서 `caseData` 타입 정의를 수정(정답 필드가 없는 `ClientCaseData` 타입 사용 권장)하거나, 정답 필드가 비어있어도 에러가 나지 않도록 수정.

## 5. 단계별 실행 순서 (Execution Steps)
1.  **Step 1:** `plan/secure_architecture_plan.md` (이 문서) 작성 및 검토.
2.  **Step 2:** `app/lib/prompts.ts`의 내용을 서버 사이드 유틸리티로 복사/이동.
3.  **Step 3:** `app/api/game/start`, `chat`, `evaluate` 라우트 구현.
4.  **Step 4:** `useGeminiClient` 훅을 새로운 API에 맞게 수정.
5.  **Step 5:** 전체 게임 플레이 테스트 및 디버깅.
