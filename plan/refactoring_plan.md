# 리팩토링 계획서: 오늘의 탐정 (Project Refactoring Plan)

## 1. 목표 (Objective)
현재 단일 파일(`page.tsx`, 약 700라인)에 집중된 게임 로직, UI, 상태 관리를 모듈화하여 유지보수성, 가독성, 확장성을 개선합니다.
**핵심 원칙:** 리팩토링 과정에서 **사용자 경험(UX), 시각적 디자인(UI), 기능적 동작**은 100% 동일하게 유지합니다.

## 2. 분리 기준 (Separation Criteria)

### A. 데이터 및 타입 (Data & Types)
- **기준:** 컴포넌트 간 공유되는 인터페이스 및 상수.
- **대상:** `Suspect`, `CaseData`, `ChatMessage` 등 모든 인터페이스.
- **위치:** `app/types/game.ts`

### B. 비즈니스 로직 및 상태 관리 (Logic & State)
- **기준:** UI 렌더링과 무관한 순수 로직, 데이터 패칭, 타이머, 게임 진행 상태 관리.
- **방법:** Custom Hooks 패턴 사용.
- **대상:**
    - 게임 페이즈 및 데이터 관리 -> `useGameState`
    - 타이머 로직 -> `useGameTimer`
    - API 통신 및 에러 핸들링 -> `useGeminiClient`
- **위치:** `app/hooks/`

### C. AI 프롬프트 및 유틸리티 (Prompts & Utils)
- **기준:** 하드코딩된 긴 문자열(프롬프트)과 순수 헬퍼 함수.
- **대상:** `CASE_GENERATION_PROMPT`, `generateSuspectPrompt`, 시간 포맷팅 함수, JSON 파싱 함수.
- **위치:**
    - `app/lib/prompts.ts`
    - `app/lib/utils.ts`

### D. UI 컴포넌트 (Presentation)
- **기준:** 게임의 각 단계(Phase)별 화면 단위 및 재사용 가능한 작은 단위.
- **원칙:** 로직을 최소화하고 `props`로 데이터와 핸들러를 전달받아 화면을 그리는 역할만 수행 (Dumb Components).
- **대상:**
    - `IntroScreen`
    - `TutorialModal`
    - `LoadingScreen`
    - `BriefingScreen`
    - `InvestigationScreen` (내부에 `ChatInterface`, `SuspectTabs` 등 포함 가능)
    - `DeductionScreen`
    - `ResolutionScreen`
    - 공통: `ErrorModal`
- **위치:** `app/components/`

## 3. 단계별 실행 계획 (Step-by-Step Execution)

### 1단계: 기반 다지기 (Foundation)
1.  디렉토리 생성: `types`, `hooks`, `lib`, `components`
2.  **타입 분리:** `page.tsx`의 인터페이스들을 `app/types/game.ts`로 이동.
3.  **유틸/프롬프트 분리:** `callGemini`, `parseJSON` 등 헬퍼 함수와 대형 프롬프트 문자열을 `lib` 폴더로 이동.

### 2단계: UI 컴포넌트 추출 (Component Extraction)
*이 단계에서는 로직은 `page.tsx`에 둔 채 렌더링 부분만 분리합니다.*
1.  각 `if (phase === '...')` 블록을 별도 컴포넌트 파일로 분리.
2.  필요한 데이터와 함수는 Props로 전달.
3.  Tailwind 클래스를 그대로 복사하여 디자인 유지 확인.

### 3단계: 로직 훅 분리 (Hook Extraction)
1.  `useGameTimer`: 타이머 관련 `useState`, `useEffect` 분리.
2.  `useGeminiClient`: API 호출 및 에러 핸들링 로직 분리.
3.  `useGameEngine`: 전체 게임 상태(`phase`, `caseData` 등)와 진행 함수(`handleStartGame` 등)를 통합 훅으로 구성.

### 4단계: 최종 조립 (Assembly)
1.  `page.tsx`를 정리된 Hooks와 Components로 재구성.
2.  최종 코드 라인 수를 100줄 내외로 단축 목표.

## 4. 디자인 보존 전략 (Design Preservation)
- **CSS 그대로 이동:** 기존 `className` 문자열을 변경하지 않고 그대로 새 컴포넌트로 옮깁니다.
- **구조 유지:** HTML 태그의 계층 구조(DOM Tree)를 변경하지 않습니다.
- **검증:** 각 단계마다 게임을 실행하여 레이아웃 깨짐이나 동작 오류를 확인합니다.
