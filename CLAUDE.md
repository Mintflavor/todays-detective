# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

### 모든 코드를 작성할 땐 코드 파일 최상단에 아래 문구를 주석으로 추가해주세요.
작성자 : 박현일
이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.

Author: Hyunil Park
Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

## 도구 호출

한글 등 비ASCII 문자열을 도구 호출 파라미터에 넣을 때는 리터럴 UTF-8로 그대로 쓴다.
`\uXXXX` 유니코드 이스케이프로 바꿔 쓰지 않는다.

## Project Overview

**오늘의 탐정 (Today's Detective)** — Gemini가 생성한 사건을 플레이어가 20분 안에 용의자 3명을
심문해 범인을 추리하고, AI가 등급(S~F)을 매기는 웹 추리게임.

**자체 호스팅 중**: unraid 서버의 Docker Compose 스택. 공개 주소는
https://detective.mintflavor.ddns.net (이미지는 `cdn.mintflavor.ddns.net`).

> AWS(Lambda·API Gateway·S3·MongoDB Atlas)와 Vercel에서 이전했다.
> 이전 과정의 결정과 함정은 [plan/unraid_migration_plan.md](plan/unraid_migration_plan.md)에
> 전부 기록돼 있다. **인프라를 만지기 전에 그 문서를 먼저 읽을 것.**

## 구조

```
├── app/                    # Next.js 16 App Router (프론트엔드 전용)
│   ├── components/         # 화면 컴포넌트
│   ├── hooks/              # useGameEngine, useGameTimer, useGeminiClient, useSecretCommand
│   ├── lib/                # http.ts, api.ts, adminAuth.ts, utils.ts
│   ├── types/game.ts
│   └── page.tsx            # 페이즈 라우팅
├── tests/frontend/         # vitest 50건 (훅·순수 함수)
├── server/                 # FastAPI 백엔드
│   ├── app/                # config, db, gemini, storage, sanitize, models, auth, ratelimit
│   │   └── routers/        # game, scenarios, feedbacks, admin
│   ├── tests/              # pytest 239건
│   └── Dockerfile          # 멀티스테이지 (기본 runtime, --target test)
├── infra/                  # Docker Compose 스택 + 운영 스크립트
└── plan/                   # 설계·이전 계획 문서
```

**`app/api/` 디렉터리는 없다.** Route Handler를 전부 제거하고 서버 로직을 FastAPI로 단일화했다.
프론트엔드는 same-origin `/server/*`로만 백엔드를 호출한다 (Next rewrite → api 컨테이너).

**`lambda/` 디렉터리도 없다.** `server/app/*`의 주석에 `lambda/handler.py에서 이식했다` 같은
출처 표기가 남아 있는데, 그 원본은 **git 이력**에 있다:

```bash
git show $(git rev-list -1 HEAD -- lambda/handler.py):lambda/handler.py
```

이식된 로직(스포일러 정화, 평가 파싱, 피드백 매핑)의 동작을 바꿀 일이 생기면 원문과 대조할 것.

## Commands

### 프론트엔드 (개발)

```bash
npm run dev          # 개발 서버 (3000)
npm run build        # output:'standalone' 프로덕션 빌드
npm run lint         # ESLint (next build는 lint를 돌리지 않는다)
npm test             # vitest — tests/frontend/ (50건). Gemini 호출 없음
```

> 프론트엔드 테스트는 `app/` 밖의 `tests/frontend/`에 둔다. `app/`은 App Router의
> 라우팅 디렉터리라 테스트 파일을 섞으면 판단할 거리가 늘어난다 (`server/tests/`와 대칭).
> API 계층(`useGeminiClient`)을 목으로 대체하므로 비용이 발생하지 않는다.

> 로컬 `npm run dev`로 백엔드를 쓰려면 `API_INTERNAL_URL`을 실행 중인 api 주소로 지정한다.
> 기본값은 컨테이너명 `http://todays-detective-api:8000`이라 호스트에서는 해석되지 않는다.

### 백엔드 (테스트)

```bash
# 운영 이미지에는 pytest가 없다. --target test 스테이지를 쓴다.
B=/mnt/user/appdata/todays-detective
cd $B/server
docker build --target test -t todays-detective-api-test .
docker run --rm --network todays-detective-net --env-file $B/compose/.env \
  todays-detective-api-test pytest
```

라우터 테스트가 실제 Mongo에 붙으므로 `--network`와 `--env-file`이 필요하다.
`conftest.py`가 **Gemini 호출과 레이트 리밋을 모두 차단**하므로 테스트는 비용을 발생시키지 않고
운영 카운터도 건드리지 않는다.

### 배포 (unraid)

```bash
ssh unraid                                  # 키 인증 설정돼 있음
cd /mnt/user/appdata/todays-detective/compose
docker compose build -q todays-detective-api todays-detective-web
docker compose up -d
```

소스 전송과 Compose Manager 연동은 [infra/README.md](infra/README.md) 참조.
unraid 웹UI **Docker → Compose** 탭에서 스택을 Start/Stop할 수 있다.

## Architecture

### 게임 상태 머신

[app/hooks/useGameEngine.ts](app/hooks/useGameEngine.ts)가 관리한다:

`intro` → `load_menu` → `briefing` → `tutorial` → `loading` → `investigation` → `deduction` → `resolution`

- **investigation**: 20분 타이머. 심문 횟수는 **용의자 1명당 20회**(공유 풀이 아니다, 총 60회)
- **resolution**: Gemini가 등급·보고서·조언을 반환

### 컨테이너 구성

| 컨테이너 | 역할 | 포트 |
|---|---|---|
| `todays-detective-web` | Next.js standalone | `172.17.0.1:3100` → 3000 |
| `todays-detective-api` | FastAPI + uvicorn | **미공개** |
| `todays-detective-mongo` | MongoDB 8 (SCRAM) | **미공개** |
| `todays-detective-minio` | MinIO (S3 호환) | `172.17.0.1:9100` → 9000 |

`172.17.0.1`(docker0)에만 바인드한다 — 기본 bridge에 있는 NPM은 도달하지만 LAN에서는 닿지 않는다.
NPM이 컨테이너명 DNS를 쓸 수 없는 사정은 계획 §0-B 참조.

### API 경로

브라우저는 **same-origin `/server/*`만** 호출한다. [next.config.ts](next.config.ts)의 rewrite가
api 컨테이너로 넘긴다 → CORS가 발생하지 않고 `NEXT_PUBLIC_*` 빌드 타임 결합도 없다.

| 엔드포인트 | 인증 | 비고 |
|---|---|---|
| `POST /api/game/start` | 🔓 | **약 159원/회** (초상화 3장이 93%). 전역 `2/hour;3/day;25/month` |
| `POST /api/game/chat` | 🔓 | 전역 `60/hour` |
| `POST /api/game/evaluate` | 🔓 | 전역 `15/hour` |
| `POST /api/game/feedback` | 🔓 | camelCase 입력, 200 |
| `GET /api/game/scenario/{id}` | 🔓 | **정화본** + `no-store` |
| `GET /scenarios` | 🔓 | 목록. `case_data` 제외 |
| `GET /scenarios/{id}` | 🔒 | **정화되지 않은 원본** (스포일러 포함) |
| `POST /scenarios`, `DELETE /scenarios/{id}` | 🔒 | |
| `GET /feedbacks`, `DELETE /feedbacks/{id}` | 🔒 | snake_case 입력, 201 |
| `POST /admin/login` | 🔓 | 비밀번호 → 2시간 토큰. `30/hour` |

🔒 = `X-Admin-Token`(브라우저) 또는 `X-API-Key`(스크립트). [server/app/auth.py](server/app/auth.py)

### ⚠️ 손대기 전에 알아야 할 것

**1. 스포일러 정화가 이 프로젝트에서 가장 위험한 코드다.**
[server/app/sanitize.py](server/app/sanitize.py)의 두 상수를 임의로 바꾸지 말 것.
깨지면 클라이언트에 정답이 흘러가 게임이 근본적으로 망가지는데, **예외가 나지 않아 조용히 통과한다.**
`tests/test_sanitize.py`가 Lambda 원문을 oracle로 두고 출력 동일성을 검증한다.

**2. 평가 응답 파싱도 조용히 깨진다.**
[server/app/routers/game.py](server/app/routers/game.py)의 정규식 3개와 폴백 문구를 바꾸면
모든 추리가 `F` / "보고서 생성 실패"로 나온다. `tests/test_evaluate_parsing.py` 참조.

**3. Gemini 예산이 월 5,000원이다.**
새 사건 생성 159원, 기록 재생 11.7원(15배 저렴). 레이트 리밋을 끄거나 늘리기 전에
`server/app/ratelimit.py`의 단가 계산을 읽을 것. 카운터는 Mongo에 있어 재시작에도 유지된다.

**4. `case_data`를 엄격한 스키마로 만들지 말 것.**
LLM 생성 JSON이라 필드가 유동적이다. 스키마를 강제하면 정상 시나리오까지 422로 튕긴다.

**5. 프롬프트의 스키마 예시는 그대로 결과에 복사된다.**
[server/app/prompts.py](server/app/prompts.py)의 `CASE_SCHEMA_BODY`에 특정 값을 박아두면
**모든 사건이 그 값으로 나온다.** 실제로 예시가 `id 2`에 `isCulprit: true`를 박아둔 탓에
운영 데이터의 범인이 4/4 전부 id 2였다 — 기록 재생 시 수사 없이 정답을 아는 상태였다.
같은 이유로 `crime_type`은 살인 4/4, 증거는 3개 4/4로 고정됐다.

세 용의자 슬롯의 설명은 **완전히 대칭이어야 한다.** 한 슬롯에만 "거짓 알리바이"처럼
다른 문구가 있으면 그것이 범인 힌트로 복사된다. `tests/test_prompt_diversity.py`가
대칭성과 `isCulprit` 예시가 boolean인지를 검증한다.

무작위성은 LLM에 맡기지 않고 `build_case_spec()`이 서버에서 뽑아 주입한다.
"각 유형 20%"처럼 프롬프트로 부탁하면 따르지 않는다.
생성 4회 실측으로 주입이 반영되는 것을 확인했다 (구 프롬프트는 범인이 4/4 id 2였는데
신 프롬프트에서는 id 1이 2회 나왔다).

선택값과 감사 결과는 `scenarios.generation_spec`·`generation_audit`에 남는다.
**`culprit_id`와 `prompt`는 절대 저장하지 않는다** — 범인 id는 정답이고 프롬프트에는
그 id가 적혀 있다. `CaseSpec.storable()`이 걸러 주므로 dict를 직접 만들지 말 것.

무대·조건은 최근 20판/10판을 피해서 고른다. 이 회피는 **최적화이지 필수 경로가
아니다** — DB 조회 실패나 후보 소진 시 전체 풀로 되돌아간다. 생성을 막지 않는다.

`isCulprit`에 설명 문자열을 넣지 말 것. `find_culprit()`이 truthiness로 판정하므로
`"false"`가 True가 되어 엉뚱한 인물이 범인이 된다. 저장 직전
`_normalize_culprit()`이 방어하지만 애초에 boolean 예시를 쓰는 것이 맞다.

**6. 프론트엔드 에러 상태는 `useGameEngine`이 소유한다.**
[app/hooks/useGeminiClient.ts](app/hooks/useGeminiClient.ts)는 `ApiError`만 던지고
에러 상태를 갖지 않는다. 과거에 API 계층이 재시도 콜백까지 들고 있었고 그 콜백이
`generateCase` 자기 자신이라, 재시도가 성공해도 결과를 받는 곳이 없었다 —
159원을 쓰고 화면은 그대로였다. 재시도 콜백은 **상태를 반영하는 쪽**에 두어야 한다.

429는 반드시 별도 분기한다. 리밋이 `2/hour;3/day;25/month`라 429는 예외가 아니라
정상 동작이며, 재시도가 무의미하므로 기록실로 유도해야 한다.
`ErrorModal`에는 **항상 닫기가 있어야 한다** — 예전에 버튼이 재시도 하나뿐이라
실패한 플레이어가 취할 수 있는 유일한 행동이 유료 API 재호출이었다.

**7. 시간 제한은 세 곳에 흩어져 있다 — 프론트·프롬프트·문구.**
[useGameEngine.ts](app/hooks/useGameEngine.ts)의 `TOTAL_SECONDS`만 바꾸면 **AI 채점이 어긋난다.**
[server/app/prompts.py](server/app/prompts.py)의 평가 프롬프트에 "제한시간(20분)"이 두 곳
박혀 있어서, 여기가 옛 값이면 20분 게임인데 10분 기준으로 시간 관리 점수를 0점 준다.
**예외가 나지 않고 등급만 조용히 낮아진다.** 인트로 문구·메타데이터 description·튜토리얼·
시간초과 모달의 "N분"도 같이 봐야 한다.

**8. 심문 횟수는 용의자별이고, 레이트 리밋과 묶여 있다.**
`AP_PER_SUSPECT`는 **한 명당** 값이라 한 판의 상한은 그 값 x 용의자 수(현재 60회)다.
이 값을 올리면 `RATE_LIMIT_CHAT`(전역 시간당)도 같이 올려야 한다 — 한 판이 전역 한도를
다 쓰면 **다른 접속자가 수사 중에 429를 받는다.** 심문에는 월 한도를 걸지 않는다:
수사 중에 끊기면 그 판이 통째로 버려진다. 단가 계산은
[server/app/ratelimit.py](server/app/ratelimit.py) 주석에 있다.

AP 맵은 `chatLogs`와 같은 이유로 **용의자 id를 1~3으로 가정하지 않는다.**
`case_data`는 스키마를 걸지 않은 LLM 출력이라 id가 달라질 수 있다.

**9. 브라우저 뒤로가기는 `usePhaseHistory`가 가로챈다.**
단일 페이지라 히스토리 엔트리가 없어서, 예전에는 뒤로가기 한 번이 곧 사이트 이탈이었다
(수사 중이면 20분치 기록이 사라졌다). 게임 안에 있는 동안 **감시용 엔트리를 정확히
하나만 유지**한다 — phase마다 push하면 게임을 나온 뒤 뒤로가기가 여러 번 먹통이 된다.
`intro`에서는 이탈을 막지 않는다. 나갈 길이 없으면 그것도 함정이다.
되돌릴 수 없는 이동(`briefing`·`loading`에서 나가기)은 반드시 확인을 받는다.

**10. 취소 경로는 진행 중인 비동기 결과를 무효화해야 한다.**
`useGameEngine`의 `generationEpoch`가 그 역할을 한다. 없으면 생성을 취소하고 인트로로
나온 뒤에 응답이 도착해 **낡은 사건이 되살아나고**, 이어서 "새로운 의뢰"를 누르면
159원을 또 쓰면서 화면에는 옛 사건이 뜬다.

**11. 사건 생성은 25~31초 걸린다.**
타임아웃이 3곳에 있다 — NPM(`proxy_read_timeout`), Next(`experimental.proxyTimeout`, 기본 30초),
api. Next 기본값 때문에 성공 응답이 500이 된 적이 있다 (계획 §4-A).

## 환경변수

전부 `/mnt/user/appdata/todays-detective/compose/.env`(권한 600)에 있다.
`/boot`은 vfat이라 권한이 없어 두지 않는다.

```
MONGODB_URL              # SCRAM 접속 (앱 전용 계정 detective)
GEMINI_API_KEY
GEMINI_MODEL             # gemini-3.6-flash        (사건 생성·평가)
GEMINI_CHAT_MODEL        # gemini-3.5-flash-lite   (심문)
IMAGE_MODEL              # gemini-3.1-flash-lite-image (초상화, Imagen 아님)
S3_ENDPOINT_URL          # http://todays-detective-minio:9000
S3_BUCKET_NAME / S3_ACCESS_KEY / S3_SECRET_KEY
PUBLIC_ASSET_BASE_URL    # https://cdn.mintflavor.ddns.net/todays-detective
ALLOWED_ORIGINS
API_KEY_ADMIN / ADMIN_PASSWORD
RATE_LIMIT_*             # ratelimit.py 주석 참조
```

`NEXT_PUBLIC_*`는 쓰지 않는다 — 빌드 타임에 번들에 박혀 이미지가 환경에 종속된다.
web 컨테이너에는 환경변수가 **하나도 없다** (비밀값 없음).

## 데이터 모델

MongoDB `todays_detective`:

| 컬렉션 | 내용 |
|---|---|
| `scenarios` | `title`, `summary`, `crime_type`(살인/방화/납치/강도/절도), `case_data`, `created_at` |
| `feedbacks` | `content`(≤300자), `scenario_id`, `grade`, `game_result`(snake_case), `created_at` |
| `rate_limit_counters` | slowapi 카운터 |

`case_data`는 피해자 정보, 용의자 3명(1명이 범인), 증거 목록, 세계관, 타임라인을 담는다.
용의자의 `isCulprit`·`secret`·`real_action`·`motive`·`trick`과 최상위 `solution`·`timeline_truth`는
**클라이언트 응답에서 제거된다** (resolution 시점에 `Evaluation.truth`로만 공개).

초상화는 MinIO `portraits/<uuid>.jpg`에 512×512 JPEG q80으로 저장되고,
`portraits/` 프리픽스에만 익명 read가 열려 있다 (버킷 루트는 비공개).
구 데이터에는 `portraitImage`가 base64 문자열인 것이 있어 프론트가 `startsWith('http')`로 분기한다.
