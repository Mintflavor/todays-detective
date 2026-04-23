# Step 1. 사전 조사 및 설계 매핑

작성자 : 박현일
이 문서의 소유권은 작성자에게 있으며, 일부 또는 전체는 AI(Claude)를 활용하여 작성되었습니다.

---

## 1.1 타겟 프로젝트 현재 상태
- `src/main.tsx`, `App.tsx`, `App.css`, `index.css` — Vite 기본 템플릿
- `granite.config.ts` — appName만 존재, `brand.displayName/primaryColor/icon` 미설정
- `vite.config.ts` — 기본 React 플러그인만
- 의존성: `@apps-in-toss/web-framework@^2.4.7`, `@toss/tds-mobile@^2.3.0`, `@toss/tds-mobile-ait@^2.3.0`, React 18, Emotion
- TDS Provider 미래핑 상태

## 1.2 원본 핵심 구조

### 게임 플로우 (상태 머신)
```
intro → load_menu → tutorial → loading → briefing → investigation → deduction → loading → resolution
```

### 전역 상태 (`useGameEngine`)
- `phase`, `caseData`, `currentSuspectId`, `chatLogs`(0=메모, 1~3=용의자), `actionPoints`(20), `evaluation`
- UI: `userInput`, `isTyping`, `loadingText/Type`, `inputPlaceholder`, `deductionInput`, `isMuted`, `showTimeOverModal`
- `audioRef` (HTMLAudioElement) — BGM 재생
- `timerSeconds`, `isOverTime` — 10분 타이머

### 클라이언트에서 호출하는 API 지점
| 함수 | 엔드포인트 | 위치 |
|------|-----------|------|
| `generateCase` | `POST /api/game/start` | `useGeminiClient` |
| `interrogateSuspect` | `POST /api/game/chat` | `useGeminiClient` |
| `evaluateDeduction` | `POST /api/game/evaluate` | `useGeminiClient` |
| `submitFeedback` | `POST /api/game/feedback` | `lib/api.ts` |
| `getScenarioDetail` | `GET /api/game/scenario/[id]` | `lib/api.ts` |
| `getScenarios` | `GET ${API_BASE_URL}/scenarios/` | `lib/api.ts` (직접 FastAPI) |
| `getScenarioDetailFull` | `GET ${API_BASE_URL}/scenarios/[id]` | `lib/api.ts` |
| `deleteScenario` | `DELETE ${API_BASE_URL}/scenarios/[id]` | `lib/api.ts` |
| `getFeedbacks` | `GET ${API_BASE_URL}/feedbacks/` | `lib/api.ts` |
| `deleteFeedback` | `DELETE ${API_BASE_URL}/feedbacks/[id]` | `lib/api.ts` |

### 서버 사이드 로직 (Next.js API Routes)
- `app/api/game/start/route.ts` — Gemini로 사건 생성 + S3 이미지 업로드 + MongoDB 저장
- `app/api/game/chat/route.ts` — 용의자 심문 응답 생성
- `app/api/game/evaluate/route.ts` — 추리 평가
- `app/api/game/scenario/[id]/route.ts` — 시나리오 상세
- `app/api/game/feedback/route.ts` — 피드백 저장
- `app/api/game/lib/gemini.ts`, `prompts.ts`, `s3.ts` — 공통 유틸
- `lambda/handler.py` — AWS Lambda (별도 배포)
- Admin: `app/api/admin/verify/route.ts` — ADMIN_PASSWORD 검증

### 외부 리소스
- **BGM**: `/bgm/Cold_Coffee_at_Three_compressed.mp3` (정적 파일)
- **S3**: `todays-detective.s3.ap-northeast-2.amazonaws.com` (용의자 이미지)
- **Gemini API**: 서버 사이드에서만 호출 (`GEMINI_API_KEY` 환경변수)
- **MongoDB**: FastAPI 백엔드에서 관리

## 1.3 서버 로직 분리 방안 (제안)

앱인토스는 Vite SPA이므로 `app/api/*` Route Handler를 그대로 쓸 수 없음. **3가지 옵션**:

| 옵션 | 내용 | 장단점 |
|------|-----|--------|
| A. 기존 FastAPI 확장 | `backend/`에 Gemini 프록시 엔드포인트(`/api/game/start/chat/evaluate`) 추가 | ✅ MongoDB/S3 인프라 재사용 ❌ FastAPI에 AI 로직 추가 작업 필요 |
| B. Next.js 앱을 API 서버로 유지 | 기존 Next.js 배포본을 API-only로 운영, 앱인토스에서 fetch | ✅ 기존 TypeScript 로직 그대로 재사용 ❌ 두 배포 유지 |
| C. 신규 Lambda/서버리스 | `lambda/handler.py` 확장 또는 신규 AWS Lambda | ✅ 유연 ❌ 신규 구축 부담 |

**👉 추천: 옵션 B** (현존 Next.js 로직을 API 전용으로 계속 운영). 이 경우 마이그레이션 범위가 프론트엔드에 집중됨.

## 1.4 앱인토스 필요 기능 후보
- `TDSMobileAITProvider` 래핑 (필수)
- `Safe Area` 패딩 처리
- `useBackEvent` — 뒤로가기 처리 (단계별 이전 페이즈 복귀)
- `setScreenAwakeMode` — 10분 투자 중 화면 꺼짐 방지
- `share` / `getTossShareLink` — 결과 공유 (Resolution 단계)
- `getAnonymousKey` — 사용자 식별 (피드백과 연결 가능)
- `Analytics.init` + `LoggingPress` — 사용자 행동 기록
- `generateHapticFeedback` — 중요 이벤트 (정답/오답) 피드백
- **BGM**: HTMLAudioElement 그대로 사용 가능 (WebView 기반이므로)

## 1.5 컴포넌트 분류

| 컴포넌트 | 마이그레이션 전략 | TDS 교체 대상 |
|---------|----------------|--------------|
| `IntroScreen` | 재구성 | `Top`, `Button`, `IconButton` (음소거) |
| `LoadScenarioScreen` | 재구성 | `Top`, `ListRow`, `SegmentedControl`(장르 필터), `Skeleton` |
| `BriefingScreen` | 재구성 | `Top`, `ListRow`, `Button`, `Asset.Image` |
| `TutorialModal` | 교체 | `BottomSheet` 또는 `Dialog` + 페이지 인디케이터 |
| `LoadingScreen` | 재구성 | `Loader`, `ProgressBar` |
| `InvestigationScreen` | **가장 복잡** — 재구성 | `Tab`(용의자 전환), `Bubble`(채팅), `TextField`, `Badge`(AP), 타이머 커스텀 |
| `DeductionScreen` | 재구성 | `Top`, `TextArea`, `Checkbox.Circle`(용의자 선택), `BottomCTA` |
| `ResolutionScreen` | 재구성 | `Top`, `Asset.Image`, `Result`, `Button` |
| `AdminAuthModal` | 교체 | `Dialog` + `TextField.Password` |
| `AdminScreen` | **결정 필요** — 미니앱 포함 vs 제외 | (제외 추천) |
| `ErrorModal` | 교체 | `useDialog().openAlert` |
| `AssetPreloader` | 재구성 | 이미지 프리로드 로직 유지 (`new Image()` 기반) |

## 1.6 스타일 마이그레이션
- **Tailwind → Emotion**: 복잡한 레이아웃/애니메이션이 많아 그대로 대체 필요
- **커스텀 애니메이션** (`fade-in`, `stamp`, `loading-bar`): Emotion keyframes로 이식
- **색상**: `@toss/tds-colors`의 `adaptive` 계열 사용 권장 (다크모드 자동 대응)

## 1.7 주요 결정 필요 사항 (사용자 확인 요청)

다음 4가지를 확정해 주셔야 다음 단계 진행이 원활해요.

1. **백엔드 전략 — 옵션 A/B/C 중 어떤 것?** (기본 제안: B. 기존 Next.js API 재사용)
2. **게임 분류 — 게임으로 심사받을지?** (추리 게임 성격상 "게임"으로 출시 권장, 등급분류 절차 필요)
3. **관리자 기능 — 미니앱에 포함?** (기본 제안: 제외, 기존 Next.js 관리자 화면 사용)
4. **작성자 주석 규칙 유지?** (CLAUDE.md의 "Author: Hyunil Park..." 주석을 새 코드에도 적용)

---

## ✅ Step 1 완료
- 매핑 문서 작성 완료
- 사용자의 결정 사항(위 4가지) 답변 후 Step 2로 진행
