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

**오늘의 탐정 (Today's Detective)** — Gemini가 생성한 사건을 플레이어가 10분 안에 용의자 3명을
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
├── server/                 # FastAPI 백엔드
│   ├── app/                # config, db, gemini, storage, sanitize, models, auth, ratelimit
│   │   └── routers/        # game, scenarios, feedbacks, admin
│   ├── tests/              # pytest 223건
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
```

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

- **investigation**: 10분 타이머, 20 AP로 용의자 3명 심문
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
신 프롬프트에서는 id 1이 2회 나왔다). 결과는 `scenarios.generation_audit`에
불리언으로 남는다 — **지정 범인 id는 저장하지 않는다. 그 자체가 정답 노출이다.**

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

**7. 사건 생성은 25~31초 걸린다.**
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
