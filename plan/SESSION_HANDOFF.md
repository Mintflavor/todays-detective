# 세션 인수인계 — Apps-in-Toss 마이그레이션

작성자 : 박현일
이 문서의 소유권은 작성자에게 있으며, 일부 또는 전체는 AI(Claude)를 활용하여 작성되었습니다.

**마지막 업데이트**: Step 5-b 완료 시점
**다음 작업**: Step 5-c (`InvestigationScreen` 마이그레이션)

---

## 🎯 전체 진행 상황

| Step | 내용 | 상태 |
|------|------|------|
| Step 1 | 사전 조사 및 설계 매핑 | ✅ 완료 |
| Step 2 | 프로젝트 기반 설정 | ✅ 완료 |
| Step 3 | 타입 및 공통 유틸 이식 | ✅ 완료 |
| Step 4 | 게임 엔진 훅 이식 | ✅ 완료 |
| **Step 5-a** | Intro, Loading, Error, Tutorial 화면 | ✅ 완료 |
| **Step 5-b** | Briefing, Deduction, Resolution 화면 | ✅ 완료 |
| **Step 5-c** | **InvestigationScreen 화면** | ⏳ **다음 작업** |
| Step 5-d | LoadScenarioScreen, AssetPreloader, App.tsx 라우팅 | ⏳ 대기 |
| Step 6 | 앱인토스 네이티브 기능 통합 | ⏳ 대기 |
| Step 7 | 백엔드 연동 확정 | ⏳ 대기 |
| Step 8 | 테스트 및 최적화 | ⏳ 대기 |
| Step 9 | 출시 준비 | ⏳ 대기 |

---

## 📌 Step 1 주요 결정 사항 (사용자 확정 — "기본 제안대로")

1. **백엔드 전략**: **옵션 B** — 기존 Next.js API Routes(`todays-detective/app/api/*`)를 API-only로 유지하고 앱인토스에서 `fetch`로 호출
2. **앱 분류**: **게임** — 앱인토스에 "게임"으로 출시 (게임 등급분류 절차 필요)
3. **관리자 기능**: **미니앱에서 제외** — `AdminAuthModal`, `AdminScreen`, `useSecretCommand` 이식하지 않음
4. **작성자 주석**: **유지** — 모든 새 코드 파일 최상단에 박현일 작성자 주석 포함

---

## 📁 프로젝트 구조

### Source (원본 — 읽기 전용)
```
E:\Documents\ktds\todays-detective\
├── app/                     # Next.js 16 App Router
│   ├── api/                 # API Routes (서버 로직 — 재사용)
│   │   ├── admin/verify/
│   │   └── game/
│   │       ├── start/       # POST - 사건 생성
│   │       ├── chat/        # POST - 용의자 심문
│   │       ├── evaluate/    # POST - 추리 평가
│   │       ├── feedback/    # POST - 피드백
│   │       ├── scenario/[id]/
│   │       └── lib/         # gemini.ts, prompts.ts, s3.ts
│   ├── components/          # 원본 화면 컴포넌트
│   ├── hooks/               # 원본 훅
│   ├── lib/                 # api.ts, utils.ts
│   ├── types/game.ts        # 게임 타입
│   └── page.tsx             # 메인 페이즈 라우팅
├── backend/                 # FastAPI (MongoDB)
├── lambda/                  # AWS Lambda (handler.py)
├── public/                  # 정적 리소스
│   ├── bgm/Cold_Coffee_at_Three_compressed.mp3
│   └── images/*.webp        # 배경 이미지
└── plan/                    # ← 현재 문서들 위치
    ├── appsintoss_migration_todo.md
    ├── step1_analysis.md
    └── SESSION_HANDOFF.md   # ← 이 파일
```

### Target (마이그레이션 대상 — 쓰기 작업 중)
```
E:\Documents\ktds\todays-detective-appsintoss\
├── CLAUDE.md                # ✅ 작성자 주석 규칙 + 프로젝트 개요
├── granite.config.ts        # ✅ "오늘의 탐정", primaryColor #C8A24B
├── vite.config.ts           # ✅ @/* alias 추가
├── tsconfig.app.json        # ✅ baseUrl + paths 추가
├── .env.example             # ✅ VITE_API_BASE_URL, VITE_FASTAPI_BASE_URL
├── src/
│   ├── main.tsx             # ✅ TDSMobileAITProvider 래핑 (템플릿 기본)
│   ├── App.tsx              # ⏳ Step 5-d에서 라우팅 연결 예정
│   ├── vite-env.d.ts        # ✅ ImportMetaEnv 타입 확장
│   ├── styles/
│   │   └── theme.ts         # ✅ noir 색상/폰트 토큰
│   ├── types/
│   │   └── game.ts          # ✅ 원본 그대로 이식
│   ├── lib/
│   │   ├── http.ts          # ✅ fetchJson 헬퍼 + API 상수
│   │   ├── api.ts           # ✅ 시나리오/피드백 API
│   │   ├── gameApi.ts       # ✅ startCase/chatWithSuspect/evaluateCase
│   │   └── utils.ts         # ✅ getRandomPlaceholder, formatTime
│   ├── hooks/
│   │   ├── useGameTimer.ts  # ✅ 10분 타이머
│   │   ├── useGeminiClient.ts # ✅ gameApi 호출 래퍼
│   │   └── useGameEngine.ts # ✅ 전역 상태 머신
│   └── components/
│       ├── common/
│       │   └── SuspectAvatar.tsx # ✅ 공통 아바타 + resolvePortrait
│       ├── IntroScreen.tsx       # ✅ Step 5-a
│       ├── LoadingScreen.tsx     # ✅ Step 5-a
│       ├── ErrorModal.tsx        # ✅ Step 5-a
│       ├── TutorialModal.tsx     # ✅ Step 5-a
│       ├── BriefingScreen.tsx    # ✅ Step 5-b
│       ├── DeductionScreen.tsx   # ✅ Step 5-b
│       ├── ResolutionScreen.tsx  # ✅ Step 5-b (내부 Briefing/Feedback 모달 포함)
│       ├── InvestigationScreen.tsx # ⏳ Step 5-c (다음 작업)
│       ├── LoadScenarioScreen.tsx  # ⏳ Step 5-d
│       └── AssetPreloader.tsx      # ⏳ Step 5-d
└── docs/skills/             # 참조 문서 (apps-in-toss.md, tds-mobile.md)
```

---

## 🎨 스타일 전략

### 선택한 방식
- **Emotion CSS-in-JS** (`@emotion/react`의 `css` prop)
- 각 파일 최상단에 `/** @jsxImportSource @emotion/react */` 프래그마 필수
- TDS 컴포넌트는 필요한 부분에서만 선택적 사용 (noir 탐정 분위기를 유지하기 위함)

### 색상 토큰 (`src/styles/theme.ts`)
```ts
noir.bg900 = "#111827"  // 주 배경
noir.bg800 = "#1f2937"  // 카드 배경
noir.amber700 = "#b45309"  // 강조색 (탐정 골드)
noir.amber500 = "#f59e0b"  // 활성 상태
noir.red700 = "#b91c1c"   // 경고/위험
noir.parchment = "#f0e6d2" // 양피지 (튜토리얼, 보고서)
// ... 그 외 text100~500, red500~800, green700~800 등
fonts.serif = `"Nanum Myeongjo", "Noto Serif KR", Georgia, serif`
fonts.sans = `"Pretendard", -apple-system, BlinkMacSystemFont, system-ui, sans-serif`
fonts.mono = `"JetBrains Mono", "Courier New", monospace`
```

### 아이콘 전략
- 원본: `lucide-react` 사용
- 대체: **이모지로 임시 대체** (🔍 📄 💀 🔬 👥 ⚠ 등)
- 추후 TDS `Asset.Icon` 또는 SVG로 교체 고려 (Step 8 최적화 단계)

### Tailwind → Emotion 변환 규칙
- `className="flex items-center"` → `css={css({ display: "flex", alignItems: "center" })}`
- `animate-fade-in` → `@emotion/react`의 `keyframes` 정의 후 `animation: \`${fadeIn} 0.5s\``
- `hover:bg-X` → `&:hover: { backgroundColor: X }` (모바일에서는 `&:active` 권장)

---

## 🔌 API 호출 매핑 (원본 → 마이그레이션)

| 원본 호출 | 이식된 함수 | 파일 | 백엔드 대상 |
|-----------|------------|------|-----------|
| `fetch('/api/game/start', POST)` | `startCase()` | `src/lib/gameApi.ts` | Next.js API |
| `fetch('/api/game/chat', POST)` | `chatWithSuspect()` | `src/lib/gameApi.ts` | Next.js API |
| `fetch('/api/game/evaluate', POST)` | `evaluateCase()` | `src/lib/gameApi.ts` | Next.js API |
| `fetch('/api/game/feedback', POST)` | `submitFeedback()` | `src/lib/api.ts` | Next.js API |
| `fetch('/api/game/scenario/[id]')` | `getScenarioDetail()` | `src/lib/api.ts` | Next.js API |
| `fetch(${API_BASE_URL}/scenarios/)` | `getScenarios()` | `src/lib/api.ts` | **FastAPI 직접** |
| `fetch(${API_BASE_URL}/scenarios/[id]')` | `getScenarioDetailFull()` | `src/lib/api.ts` | **FastAPI 직접** |
| `fetch(${API_BASE_URL}/feedbacks/)` | `getFeedbacks()`, `deleteFeedback()` | `src/lib/api.ts` | **FastAPI 직접** |

### 환경변수
- `VITE_API_BASE_URL` → Next.js API (예: `http://localhost:3000`)
- `VITE_FASTAPI_BASE_URL` → FastAPI (예: `http://localhost:8000`)

---

## 🎮 게임 상태 머신

```
intro → (handleStartGame: 백그라운드 generateCase)
  → tutorial
  → (handleTutorialComplete: preloadedData 있으면 briefing, 없으면 loading)
  → briefing (또는 loading → briefing)
  → investigation (10분 타이머, 20 AP)
    ├─ (타이머 종료 → showTimeOverModal)
    └─ (onGoToDeduction → deduction)
  → deduction
  → (submitDeduction: loading → evaluateCase)
  → resolution (reset → window.location.reload())

load_menu 경로:
intro → goToLoadMenu → load_menu → handleLoadGame(data) → briefing
```

---

## ⏭️ Step 5-c 작업 안내 (다음 세션에서 수행)

### 대상 파일
- **원본**: `E:\Documents\ktds\todays-detective\app\components\InvestigationScreen.tsx` (읽어서 파악)
- **생성**: `E:\Documents\ktds\todays-detective-appsintoss\src\components\InvestigationScreen.tsx`

### Props (useGameEngine에서 전달되는 값)
```ts
interface InvestigationScreenProps {
  caseData: CaseData;
  currentSuspectId: number;  // 0=메모, 1~3=용의자
  setCurrentSuspectId: (id: number) => void;
  chatLogs: ChatLogs;        // { 0: [], 1: [], 2: [], 3: [] }
  actionPoints: number;      // 0~20
  timerSeconds: number;      // 0~600
  isOverTime: boolean;
  showTimeOverModal: boolean;
  closeTimeOverModal: () => void;
  userInput: string;
  handleInputChange: (e) => void;
  handleKeyDown: (e) => void;
  handleSendMessage: () => void;
  inputPlaceholder: string;
  isTyping: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  onGoToBriefing: () => void;
  onGoToDeduction: () => void;
}
```

### 주요 UI 요소
1. **상단 헤더**: 타이머(mm:ss) + AP 게이지 + 음소거 토글 + 브리핑/추리 버튼
2. **탭**: 수사 수첩(id=0) / 용의자 1~3 (아바타 + 이름) — TDS `Tab` 또는 커스텀
3. **채팅 영역**: 메시지 버블 (role별 스타일: user/ai/system/note) — TDS `Bubble` 고려
4. **입력 영역**: TextField + 전송 버튼, placeholder는 `inputPlaceholder`
5. **타임오버 모달**: `showTimeOverModal` true일 때 중앙 모달

### 주의사항
- 채팅 로그 자동 스크롤: `useRef` + `useEffect` + `scrollIntoView({ behavior: 'smooth' })`
- 메모 탭(id=0)은 AP 소모 없음 — `actionPoints` 표시 시 조건부
- AP 0이고 메모가 아닐 때 입력 비활성화
- `isTyping` 중에는 전송 비활성화, 타이핑 표시(점 3개 애니메이션 등)
- 타임오버 후에도 계속 추리 가능하나 최대 B등급 (이는 서버에서 처리)

### 원본의 주요 Tailwind 클래스 참고용
- 컨테이너: `bg-gray-900 text-gray-100`
- 타이머 경고: 60초 이하 `text-red-500 animate-pulse`
- AP 게이지: 20 → 빨강, 10 → 주황, 그 이하 → 기본
- 채팅 버블 user: `bg-amber-800 text-amber-100` (우측 정렬)
- 채팅 버블 ai: `bg-gray-800 text-gray-200` (좌측 정렬)
- 채팅 버블 system: `bg-gray-950 text-gray-500 italic` (중앙)
- 채팅 버블 note: `bg-[#f0e6d2] text-gray-900` (양피지 느낌)

---

## 🛠️ 다음 세션 시작 체크리스트

1. 이 파일(`SESSION_HANDOFF.md`) 읽기
2. `plan/appsintoss_migration_todo.md` 전체 상태 확인
3. `plan/step1_analysis.md` 설계 문서 재확인 (필요 시)
4. 원본 `app/components/InvestigationScreen.tsx` 분석
5. 마이그레이션 타겟 `src/components/InvestigationScreen.tsx` 작성
6. 완료 후 이 문서의 "전체 진행 상황" 표와 `plan/appsintoss_migration_todo.md` 업데이트
7. 사용자에게 Step 5-d 진행 여부 확인

### Step 5-d (그 다음)
- `LoadScenarioScreen.tsx` — 저장된 시나리오 목록 (TDS `ListRow`, `SegmentedControl` 활용)
- `AssetPreloader.tsx` — 배경 이미지 프리로드 (원본: `/images/*.webp`를 public에 복사 필요)
- `App.tsx` — 페이즈별 라우팅 연결 (현재 템플릿 버전에서 `useGameEngine` 기반으로 교체)
- BGM 정적 파일(`bgm/*.mp3`) + 배경 이미지(`images/*.webp`) `public/`에 복사

---

## 📦 의존성 상태

### 이미 설치됨 (`package.json` 기준)
- `@apps-in-toss/web-framework@^2.4.7`
- `@toss/tds-mobile@^2.3.0`
- `@toss/tds-mobile-ait@^2.3.0`
- `@toss/tds-colors@^0.1.0`
- `@emotion/react@^11.14.0`
- React 18.3.1

### 설치 필요 시 (아직 추가 안 했지만 필요할 수 있음)
- 없음 (Step 5-c까지는 현재 의존성으로 충분)

---

## ⚠️ 알려진 이슈 / 대기 항목

1. **정적 리소스**: `public/bgm/*.mp3`, `public/images/*.webp` 미복사 (Step 5-d에서 처리)
2. **아이콘**: 현재 이모지 — 추후 SVG/TDS Asset으로 교체
3. **다크모드**: `@toss/tds-colors`의 `adaptive`를 아직 활용하지 않음 — noir 테마가 다크 전용이므로 충돌 가능성
4. **백엔드 CORS**: Step 7에서 Next.js API가 앱인토스 도메인 허용하도록 설정 필요
5. **게임 등급분류**: Step 9에서 처리

---

## 🔑 대화 컨텍스트 요약

- 사용자: 박현일 (hamer1009@gmail.com)
- 사용자가 원하는 방식: 한 단계씩 진행하며 다음 단계 전에 확인 요청
- 사용자가 "진행해"/"이어서 진행해"라고 답하면 그대로 다음 단계 진행
- 기본 제안대로 진행하라는 지시가 있었으므로 Step 1의 4가지 결정은 기본값 적용 완료
- 원본 프로젝트의 `CLAUDE.md`에 **작성자 주석 규칙**이 명시되어 있고, 이를 준수 중

### 대화 패턴
1. 원본 파일 Read
2. TDS/Emotion 기반으로 타겟 파일 Write
3. `plan/appsintoss_migration_todo.md` 체크박스 업데이트
4. 완료 요약 + 다음 단계 제안
5. 사용자 확인 대기
