# Today's Detective → 앱인토스 마이그레이션 TODO

작성자 : 박현일
이 문서의 소유권은 작성자에게 있으며, 일부 또는 전체는 AI(Claude)를 활용하여 작성되었습니다.

> **📌 다음 세션 시작 시 반드시 `SESSION_HANDOFF.md`를 먼저 읽어주세요.**
> 진행 상태, 결정 사항, 파일 구조, 다음 작업(Step 5-c) 상세 가이드가 모두 담겨 있습니다.

---

## 0. 개요

### 원본(Source)
- **프로젝트**: `todays-detective/` (Next.js 16 App Router)
- **스택**: Next.js + React 19 + Tailwind CSS 4 + Google Gemini + FastAPI(MongoDB) + AWS S3
- **구조**: `app/` (App Router), `app/api/` (Route Handlers), `app/hooks/`, `app/components/`, `lambda/` (AWS Lambda)

### 타겟(Target)
- **프로젝트**: `todays-detective-appsintoss/` (Apps-in-Toss Web / Granite 기반)
- **스택**: Vite + React 18 + `@apps-in-toss/web-framework` + `@toss/tds-mobile` (TDS)
- **제약**:
  - Next.js App Router / API Routes 사용 불가 → 서버 로직은 별도 백엔드로 분리 필요
  - Tailwind 미사용(기본 구성) → TDS + Emotion으로 스타일 전환
  - React 19 → React 18 다운그레이드
  - 비게임 미니앱은 TDS 필수 (단, 이 앱은 게임성이 있어 TDS 사용 권장 수준)
  - 외부 링크/자사 앱 설치 유도 제한 (AWS S3 이미지 등 외부 리소스는 허용되지만 검수 고려)

### 마이그레이션 전략
- **프론트엔드 전용 전환**: 앱인토스 프로젝트는 Vite 기반 SPA이므로 Next.js API Routes에 있던 모든 서버 로직은 **별도 백엔드(기존 FastAPI 또는 신규 서버)**로 이동하고, 앱에서는 `fetch` / 앱인토스 `http` API로 호출.
- **UI 점진 교체**: 기존 Tailwind + 커스텀 UI → TDS 컴포넌트로 교체 + 필요한 부분은 Emotion으로 커스텀 유지.
- **게임 로직 재사용**: `useGameEngine`, `useGameTimer`, 타입(`app/types/game.ts`) 등 순수 로직은 거의 그대로 이식 가능.

---

## 진행 규칙
- 각 단계는 완료 후 사용자 확인을 받은 다음 진행.
- 완료된 항목은 `[x]`로 체크.
- 단계별 결과물과 변경 파일을 간단히 기록.

---

## Step 1. 사전 조사 및 설계 확정 🔍 ✅
- [x] 1.1 타겟 프로젝트의 현재 상태 점검 — Vite + TDS 설치 완료, Provider 미적용
- [x] 1.2 원본의 게임 플로우 / 전역 상태 / API 호출 지점 목록화
- [x] 1.3 서버 로직 분리 방안 확정 — **옵션 B 추천(기존 Next.js API 재사용)**
- [x] 1.4 앱인토스에서 필요한 permissions / 앱브릿지 API 확정
- [x] 1.5 TDS로 교체할 컴포넌트와 커스텀 유지할 컴포넌트 분류

상세 매핑: [`step1_analysis.md`](./step1_analysis.md)

## Step 2. 프로젝트 기반 설정 🛠️ ✅
- [x] 2.1 `granite.config.ts` 수정 — displayName "오늘의 탐정", primaryColor `#C8A24B`(탐정물 골드톤)
- [x] 2.2 필수 의존성 확인 — 모든 TDS 패키지 설치됨
- [x] 2.3 `TDSMobileAITProvider` 래핑 — 템플릿에 이미 적용되어 있음
- [x] 2.4 환경변수 체계 구성 — `.env.example` 작성 + `vite-env.d.ts` 타입 추가
- [x] 2.5 tsconfig / vite path alias `@/*` 설정
- [x] (추가) CLAUDE.md에 작성자 주석 규칙 이식

## Step 3. 타입 및 공통 유틸 이식 📦 ✅
- [x] 3.1 `src/types/game.ts` 작성
- [x] 3.2 `src/lib/utils.ts`, `src/lib/api.ts` 이식 — 공통 `fetchJson` 헬퍼(`src/lib/http.ts`)로 통일, `VITE_API_BASE_URL`·`VITE_FASTAPI_BASE_URL` 사용
- [x] 3.3 Gemini 호출 경로 분리 — `src/lib/gameApi.ts`에 `startCase` / `chatWithSuspect` / `evaluateCase` 함수 작성 (Step 4의 훅에서 사용)

## Step 4. 게임 엔진 훅 이식 🧠 ✅
- [x] 4.1 `useGameEngine.ts` 이식 (상태 머신 로직)
- [x] 4.2 `useGameTimer.ts` 이식 (10분 타이머, `window.setInterval` 사용)
- [x] 4.3 `useGeminiClient.ts` → `src/lib/gameApi.ts` 호출로 전환
- [x] 4.4 `useSecretCommand.ts` 제외 — 관리자 기능 미포함 결정에 따라 이식 생략

## Step 5. 화면 컴포넌트 마이그레이션 🎨
각 화면을 Emotion 기반으로 재구성 (noir 탐정 테마 유지를 위해 TDS 컴포넌트보다 커스텀 스타일 위주). `src/styles/theme.ts`에 색상/폰트 토큰 정의.

### Step 5-a ✅
- [x] 5.1 `IntroScreen`
- [x] 5.4 `TutorialModal`
- [x] 5.5 `LoadingScreen`
- [x] 5.10 `ErrorModal`

### Step 5-b ✅
- [x] (공통) `SuspectAvatar` + `resolvePortrait` 유틸 추가
- [x] 5.3 `BriefingScreen`
- [x] 5.7 `DeductionScreen`
- [x] 5.8 `ResolutionScreen` (Briefing/Feedback 서브모달 포함)

### Step 5-c
- [ ] 5.6 `InvestigationScreen`

### Step 5-d
- [ ] 5.2 `LoadScenarioScreen`
- [ ] 5.11 `AssetPreloader`
- [ ] `App.tsx` 페이즈 라우팅 연결

### 제외 (Step 1 결정)
- ~~5.9 `AdminAuthModal`, `AdminScreen`~~ — 미니앱에서 제외

## Step 6. 앱인토스 네이티브 기능 통합 📱
- [ ] 6.1 상단 네비게이션 바 설정 (브랜딩 가이드 준수)
- [ ] 6.2 Safe Area 적용
- [ ] 6.3 뒤로가기 이벤트 처리 (`useBackEvent`)
- [ ] 6.4 화면 꺼짐 방지 (`setScreenAwakeMode`) — 투자 중 필요 시
- [ ] 6.5 결과 공유 기능 (`share` 또는 `getTossShareLink`)
- [ ] 6.6 사용자 식별키 (`getUserKeyForGame` or `getAnonymousKey`)
- [ ] 6.7 Analytics 연동 (`Analytics.init`, `LoggingPress` 등)

## Step 7. 백엔드 연동 확정 🔌
- [ ] 7.1 백엔드 배포 / 엔드포인트 URL 확정
- [ ] 7.2 CORS 설정 검증 (앱인토스 도메인 허용)
- [ ] 7.3 Gemini API 프록시 엔드포인트 구현 (서버에서 키 관리)
- [ ] 7.4 MongoDB 시나리오 CRUD 연동
- [ ] 7.5 S3 이미지 업로드/서빙 경로 확정

## Step 8. 테스트 및 최적화 ✅
- [ ] 8.1 로컬 실행 (`granite dev`) 확인
- [ ] 8.2 앱인토스 샌드박스 앱으로 실기기 테스트
- [ ] 8.3 이미지/리소스 최적화 (번들 사이즈, 로딩 속도)
- [ ] 8.4 에러 처리 및 로딩 상태 검증
- [ ] 8.5 다크모드 대응 (TDS adaptive colors 활용)

## Step 9. 출시 준비 🚀
- [ ] 9.1 앱인토스 콘솔 등록 (로고, 이름, appName, 연령, 카테고리)
- [ ] 9.2 비게임 출시 가이드 체크리스트 대조 (또는 게임 등급분류 필요성 검토)
- [ ] 9.3 다크패턴 방지 정책 준수 확인
- [ ] 9.4 UX 라이팅 토스 보이스톤 점검
- [ ] 9.5 `ait build` → `ait deploy` 배포

---

## 주요 리스크 / 결정 필요 사항
1. **백엔드 배포 주체**: 기존 FastAPI/MongoDB를 그대로 쓸지, 신규 서버리스로 옮길지 결정 필요
2. **Gemini API 비용**: 사용자별 호출 제한 / 캐싱 전략
3. **게임 vs 비게임 분류**: 앱인토스 정책상 심사 기준이 다름 — "게임"으로 분류될 가능성 높음 → 게임 등급분류 필요 여부 확인
4. **관리자 기능**: 앱인토스 미니앱에 포함 vs 별도 웹으로 분리

---
