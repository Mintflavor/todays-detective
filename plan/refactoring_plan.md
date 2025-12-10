# 리팩토링 계획서: 오늘의 탐정 (Project Refactoring Plan) [완료]

## 1. 목표 (Objective)
현재 단일 파일(`page.tsx`, 약 700라인)에 집중된 게임 로직, UI, 상태 관리를 모듈화하여 유지보수성, 가독성, 확장성을 개선합니다.

**상태:** ✅ 리팩토링 완료 (2025-12-10)

## 2. 분리 기준 및 결과 (Separation Results)

### A. 데이터 및 타입 (Data & Types)
- **위치:** `app/types/game.ts`
- **상태:** ✅ 모든 인터페이스(`CaseData`, `Suspect`, `Evaluation` 등) 분리 완료.

### B. 비즈니스 로직 및 상태 관리 (Logic & State)
- **위치:** `app/hooks/`
    - `useGameEngine.ts`: 전체 게임 흐름 제어.
    - `useGameTimer.ts`: 타이머 로직.
    - `useGeminiClient.ts`: API 통신.
    - `useSecretCommand.ts`: 히든 커맨드 감지.
- **상태:** ✅ 커스텀 훅으로 분리 완료.

### C. AI 프롬프트 및 유틸리티 (Prompts & Utils)
- **위치:**
    - `app/lib/prompts.ts`: 프롬프트 생성 로직.
    - `app/lib/utils.ts`: 시간 포맷팅, JSON 파싱 등.
    - `app/lib/gemini.ts`: Gemini API 호출 래퍼.
- **상태:** ✅ 분리 완료.

### D. UI 컴포넌트 (Presentation)
- **위치:** `app/components/`
    - `IntroScreen`, `LoadScenarioScreen`, `BriefingScreen`, `InvestigationScreen`, `DeductionScreen`, `ResolutionScreen` 등 모든 화면 단위 컴포넌트화 완료.
- **상태:** ✅ 분리 완료.

## 3. 최종 조립 (Assembly)
- `page.tsx`는 현재 `useGameEngine`과 UI 컴포넌트들을 연결하는 역할만 수행하며, 코드가 매우 간결해졌습니다.
- **상태:** ✅ 완료

## 4. 디자인 보존 (Design Preservation)
- 기존의 느와르 스타일 및 UI/UX가 리팩토링 후에도 동일하게 유지되고 있습니다.
- **상태:** ✅ 검증 완료