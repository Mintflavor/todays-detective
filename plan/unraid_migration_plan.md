# AWS → unraid Docker Compose 마이그레이션 계획

작성자 : 박현일
이 문서의 소유권은 작성자에게 있으며, 일부 또는 전체는 AI(Claude)를 활용하여 작성되었습니다.

**작성일**: 2026-08-25
**목표**: Gemini API를 제외한 모든 인프라 구성 요소를 unraid 서버의 Docker Compose 스택으로 이전

---

## 0. 확정된 결정 사항

| 항목 | 결정 |
|---|---|
| 프론트엔드 | **unraid 컨테이너로 이전** (Next.js `output: 'standalone'`) |
| 오브젝트 스토리지 | **MinIO 컨테이너** (S3 호환 유지) |
| API 서버 | **FastAPI로 정식 재작성** (Lambda `handler.py` → 네이티브 라우터) |
| 컨테이너 이름 | 전부 **`todays-detective-` 접두어** |
| 기존 데이터 | **전량 폐기, 신규 시작** (Atlas·S3 이관 없음) |
| 리버스 프록시 | **기존 NPM(Nginx Proxy Manager) 사용** — 스택에 포함하지 않고 설정 방법만 제공 |
| 외부 노출 | 공인 HTTPS. **단 `api`는 외부 노출하지 않음** (§3-3) |
| Gemini / Imagen | **이전 불가 — 외부 API 유지** (egress 필요) |
| 외부 미니앱 클라이언트 계획 | **취소** — 관련 계획 문서 삭제됨 (§3-1, §3-3의 근거) |

---

## 1. 목표 아키텍처

```
                        인터넷
                          │  (443/TCP, TLS)
                          ▼
        ┌─────────────────────────────────────────────┐
        │  NPM (기존 운영 중 — 이 스택 외부)            │
        │   detective.example.com     → web:3000       │
        │   cdn.detective.example.com → minio:9000     │
        └───┬─────────────────────────────┬───────────┘
            │   network: npm-proxy (external)
            │                             │
  ┌─────────▼──────────────┐   ┌──────────▼───────────┐
  │ todays-detective-web   │   │ todays-detective-    │
  │ Next.js 16 standalone  │   │ minio      :9000     │
  │ :3000                  │   │ bucket:              │
  │                        │   │  todays-detective    │
  │ rewrites:              │   │  portraits/ (익명 read)│
  │  /server/* ────────────┼──▶│                      │
  └────────────┬───────────┘   └──────────▲───────────┘
               │                          │
       network: todays-detective-net (내부, 포트 미공개)
               │                          │
  ┌────────────▼───────────┐              │
  │ todays-detective-api   │──────────────┘ 업로드
  │ FastAPI + uvicorn      │
  │ :8000                  │──────────┐
  │  /api/game/*           │          │
  │  /scenarios/*          │   ┌──────▼──────────────┐
  │  /feedbacks/*          │   │ todays-detective-   │
  │  /healthz              │   │ mongo   :27017      │
  └────────────┬───────────┘   │ SCRAM 인증          │
               │               └──────┬──────────────┘
               ▼                      │
    (외부) Gemini / Imagen API        │
                                      ▼
        /mnt/user/appdata/todays-detective/
                 mongo/data  mongo/config  minio/data
```

### 서비스 목록

| 컨테이너 | 이미지 | 포트 | 볼륨 | 네트워크 |
|---|---|---|---|---|
| `todays-detective-web` | 자체 빌드 (node:22-alpine) | 3000 (미공개) | — | `npm-proxy` + 내부 |
| `todays-detective-api` | 자체 빌드 (python:3.12-slim) | 8000 (미공개) | — | 내부만 |
| `todays-detective-mongo` | `mongo:8` | 27017 (미공개) | `appdata/mongo/{data,config}` | 내부만 |
| `todays-detective-minio` | `minio/minio:<고정태그>` | 9000 (미공개) | `appdata/minio/data` | `npm-proxy` + 내부 |
| `todays-detective-minio-init` | `minio/mc:<고정태그>` | — | — | 내부만 |

> **compose 서비스명 = 컨테이너명**으로 통일한다(`container_name`과 서비스 키를 동일하게). Docker DNS가 이 이름으로 해석되므로 NPM의 Forward Hostname과 `next.config.ts` rewrite 주소가 컨테이너명과 정확히 일치한다.

> `todays-detective-minio-init`은 부팅 시 1회 실행 후 종료되는 컨테이너다 (`restart: "no"`).

> **기존 데이터를 폐기하므로 Mongo 버전 호환 제약이 없다.** `mongo:8` 최신 안정 메이저로 시작하고 태그를 고정한다.

---

## 2. AWS 결합점 인벤토리 (반드시 손대야 하는 지점)

| # | 위치 | 현재 | 변경 |
|---|---|---|---|
| 1 | [lambda/handler.py:32](../lambda/handler.py#L32) `_get_db()` | `authMechanism="MONGODB-AWS"` (IAM 인증) | **삭제** — SCRAM 접속 문자열로 전환 |
| 2 | [lambda/handler.py:276](../lambda/handler.py#L276) `handler(event, context)` | API Gateway event dict 파싱, `{statusCode, headers, body}` 반환 | FastAPI 라우터 + Pydantic으로 재작성 |
| 3 | [lambda/handler.py:24](../lambda/handler.py#L24) `CORS_HEADERS` | `Access-Control-Allow-Origin: *` | `CORSMiddleware` + 자기 오리진만 (§3-3) |
| 4 | [lambda/handler.py:75](../lambda/handler.py#L75) `_game_start` | `$sample` 랜덤 추출 + `excludeIds` | **삭제** — Gemini 신규 생성으로 복원 (§3-1) |
| 5 | [lambda/s3_upload.py:49](../lambda/s3_upload.py#L49) | 반환 URL 하드코딩 `https://{bucket}.s3.{region}.amazonaws.com/{key}` | `PUBLIC_ASSET_BASE_URL` 환경변수 기반 |
| 6 | [lambda/s3_upload.py:19](../lambda/s3_upload.py#L19) `boto3.client("s3", region_name=...)` | AWS 엔드포인트 자동 해석 | `endpoint_url` + `addressing_style="path"` 추가 |
| 7 | [app/api/game/lib/s3.ts](../app/api/game/lib/s3.ts) | `@aws-sdk/client-s3` 직접 업로드 | **파일 삭제** (업로드 책임을 FastAPI로 단일화) |
| 8 | [next.config.ts:8](../next.config.ts#L8) `images.remotePatterns` | S3 호스트명 하드코딩 | MinIO 공개 호스트(`cdn.*`)로 교체 |
| 9 | [next.config.ts:15](../next.config.ts#L15) `rewrites` | `/server/*` → API Gateway (**현재 호출되는 곳 없는 死코드**) | `/server/*` → `http://todays-detective-api:8000/*`로 **부활시켜 활용** |
| 10 | [app/api/game/](../app/api/game/) 5개 route handler | Gemini 호출 + Lambda로 저장 (Python과 로직 중복) | **삭제** — FastAPI로 단일화 |
| 11 | [lambda/build.sh](../lambda/build.sh) | Docker로 arm64 wheel 빌드 → zip | **삭제** — unraid는 x86_64, Dockerfile로 대체 |
| 12 | `lambda/function_min.zip` (36MB) | 배포 산출물 | 삭제 (gitignore 대상이라 커밋 이력엔 없음) |
| 13 | `.env` `AWS_ACCESS_KEY_ID` / `SECRET` / `S3_BUCKET_NAME` / `MONGODB_URL` | AWS 자원 | MinIO 자격증명 / 로컬 Mongo URI로 교체 |
| 14 | [app/layout.tsx:4](../app/layout.tsx#L4) `@vercel/analytics` | Vercel 전용 | 제거 (필요 시 셀프호스트 Umami로 대체) |
| 15 | `package.json` `sharp`, `@aws-sdk/client-s3` | Next.js에서 리사이즈·업로드 | **의존성 제거** (Pillow가 담당) — 이미지 용량·빌드 시간 감소 |

---

## 3. 이번 이전으로 함께 해결되는 구조적 문제

### 3-1. `/api/game/start`가 원래 의미로 되돌아간다

현재 같은 경로가 클라이언트마다 다르게 동작한다:

- Next.js [start/route.ts](../app/api/game/start/route.ts) — Gemini로 **신규 사건 생성** (원래 설계)
- Lambda `_game_start` — DB에서 **랜덤 추출만**. API Gateway 30초 타임아웃 회피용 임시 조치이고, 초상화 생성 블록은 주석 처리된 상태

**컨테이너로 옮기면 30초 제약이 사라진다.** 그리고 별도 미니앱 클라이언트 계획이 취소됐으므로 랜덤 추출 경로를 유지할 이유도 사라졌다 — `$sample`과 `excludeIds`는 애초에 그 클라이언트를 위한 코드였다(웹 클라이언트 `generateCase()`는 body를 아예 보내지 않는다).

**결론: `POST /api/game/start` = 신규 사건 생성, 단일 동작.** `mode` 파라미터도 필요 없다.

지난 사건 재생은 이미 **별도 플로우로 존재**한다 — `IntroScreen`의 "지난 사건 기록" → `load_menu` → `GET /scenarios` 목록 → `GET /api/game/scenario/{id}`. 랜덤 추출은 이 플로우와 중복이었다.

생성에 필요한 재료는 이미 전부 Python에 있고 미사용으로 방치돼 있다 — `prompts.CASE_GENERATION_PROMPT`, `prompts.generate_portrait_prompt()`, `gemini_client.generate_image()`, `s3_upload.upload_portrait()`. 주석을 풀고 배선만 하면 된다.

### 3-2. 인증 부재가 지금 반드시 고쳐져야 한다

`handler.py`에 인증 체크가 **0건**이고 CORS가 `*`다. AWS API Gateway URL은 그나마 무작위 문자열이었지만, 자기 도메인으로 공개 노출하는 순간 다음이 전부 열린다:

| 엔드포인트 | 위험 |
|---|---|
| `DELETE /scenarios/{id}` | 누구나 시나리오 삭제 (Gemini 비용을 들여 만든 자산) |
| `DELETE /feedbacks/{id}` | 누구나 피드백 삭제 |
| `POST /scenarios` | 쓰레기 데이터 무제한 삽입 |
| `GET /scenarios/{id}` | **스포일러 미정화 원본 반환** — `solution`, `isCulprit`가 그대로 노출. 관리자용(`getScenarioDetailFull`)인데 인증이 없다 |
| `POST /api/game/start` | Gemini 텍스트 1회 + Imagen 3장을 타인이 무제한 소진 (**요청당 실비 발생**) |

관리자 인증은 [app/api/admin/verify](../app/api/admin/verify/route.ts)에서 비밀번호를 비교할 뿐이고, 실제 삭제·원본 조회는 브라우저가 API로 **직접** 호출한다 — 우회 가능하다. Phase 5에서 처리한다.

### 3-3. `api`를 외부에 노출할 필요가 없어졌다

별 오리진 SPA 클라이언트 계획이 취소됐으므로 **API를 직접 호출하는 외부 클라이언트가 존재하지 않는다.** 브라우저는 `web`의 same-origin `/server/*` rewrite만 사용한다.

따라서:
- **NPM에 `api` 프록시 호스트를 만들지 않는다.** API는 내부 네트워크에만 존재한다
- 브라우저 CORS가 원천적으로 발생하지 않는다 → `ALLOWED_ORIGINS`는 자기 도메인 1개 (또는 미들웨어 자체를 생략)
- 인터넷에서 `DELETE /scenarios/{id}`에 도달할 경로가 없다. §3-2의 인증은 여전히 넣지만, 노출면이 크게 줄어든다

외부 클라이언트가 없다는 점이 이번 구성에서 얻는 가장 큰 보안 이득이다.

---

## 4. 단계별 실행 계획

### Phase 0 — 준비

- [ ] 0.1 도메인 2개 확보: `detective.example.com`(웹), `cdn.detective.example.com`(이미지)
- [ ] 0.2 NPM이 붙어 있는 docker 네트워크 이름 확인
  ```bash
  docker inspect <npm-container> --format '{{json .NetworkSettings.Networks}}'
  ```
  → 이 이름을 compose의 `external` 네트워크로 쓴다 (Phase 4.2)
- [ ] 0.3 `appdata` 경로 생성
  ```
  /mnt/user/appdata/todays-detective/{mongo/data,mongo/config,minio/data}
  ```
  **cache 풀(SSD)에 위치**시킬 것. array(HDD)에 두면 Mongo 성능이 크게 떨어진다
- [x] 0.4 ~~(선택) Atlas 스냅샷 + `aws s3 sync`로 폐기 전 사본~~ — **불가 확인**. §0-A 참조
- [x] 0.5 신규 시크릿 생성 — `.env.unraid` 생성 (gitignore 대상). Mongo root/app 비밀번호, MinIO 루트 자격증명, `API_KEY_ADMIN`, 신규 `ADMIN_PASSWORD`
- [ ] 0.6 **유효한 `GEMINI_API_KEY` 확보** — Phase 2 검증의 하드 블로커 (§0-A)

#### §0-A. 로컬 `.env` 자격증명 전량 만료 (2026-08-25 확인)

로컬 `.env`의 키를 실제로 호출해 검증한 결과 **전부 죽어 있다**:

| 키 | 결과 |
|---|---|
| `AWS_ACCESS_KEY_ID` / `SECRET` | `InvalidClientTokenId` — STS·S3 모두 거부 |
| `GEMINI_API_KEY` | `API_KEY_INVALID` — "API key not valid" |

**영향**
- Phase 0.4 보험 백업 불가 → **데이터 폐기 결정이 사실상 유일한 선택지**가 됐다 (되돌릴 자격증명이 없음)
- Phase 2에서 사건 생성·심문·평가를 **테스트할 수 없다** → 유효한 Gemini 키 확보가 선행 조건
- Phase 5.7의 "AWS 키 로테이션"은 무의미해졌다 (이미 무효). 자원 삭제만 남음

**주의**: 이는 **로컬 파일이 낡았다는 뜻일 뿐**, 운영 환경이 죽었다는 뜻은 아니다. Vercel과 Lambda는 각자 대시보드/콘솔에 설정된 환경변수를 쓴다. 실제 유효한 값은 다음에서 확보한다:
1. Vercel 프로젝트 → Settings → Environment Variables
2. AWS Lambda `todays-detective-api` → Configuration → Environment variables
3. 위 두 곳도 무효면 신규 발급 (Gemini: Google AI Studio)

### Phase 1 — 데이터 계층 부팅 (개발 PC에서 선검증)

- [ ] 1.1 `docker-compose.yml` 초안 — `todays-detective-mongo` + `todays-detective-minio` + `todays-detective-minio-init`
- [ ] 1.2 MinIO 버킷 초기화 (`todays-detective-minio-init`, 1회성)
  ```sh
  mc alias set local http://todays-detective-minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
  mc mb -p local/todays-detective
  mc anonymous set download local/todays-detective/portraits
  ```
  > MinIO 커뮤니티 에디션은 2025년 이후 웹 콘솔 기능이 축소됐다. **`mc` CLI 기준으로 운영**하고 콘솔에 의존하지 않는 것이 안전하다.
  > 익명 read는 **`portraits/` 프리픽스에만** 부여한다. 버킷 전체 공개 금지
- [ ] 1.3 Mongo 접속 확인 — SCRAM 자격증명으로 `todays_detective` DB 생성 (컬렉션은 첫 삽입 시 자동 생성)
  - ⚠️ `.env.unraid`의 `MONGODB_URL`은 **앱 전용 계정**(`detective`, `authSource=todays_detective`)을 쓴다. mongo 공식 이미지의 entrypoint는 `admin` DB에 root 계정만 만들므로, 앱 계정은 초기화 스크립트로 따로 생성해야 한다
  - `/docker-entrypoint-initdb.d/01-app-user.js` 를 마운트 (볼륨이 빈 첫 부팅에만 실행됨)
    ```js
    db = db.getSiblingDB("todays_detective");
    db.createUser({ user: process.env.MONGO_APP_USERNAME,
                    pwd:  process.env.MONGO_APP_PASSWORD,
                    roles: [{ role: "readWrite", db: "todays_detective" }] });
    ```
  - root 계정으로 단순화하고 싶다면 `MONGODB_URL`을 `root:...@.../?authSource=admin`으로 바꾸면 되지만, 최소 권한 원칙에서 벗어난다
- [ ] 1.4 `mc cp`로 더미 이미지 1장 업로드 → 익명 URL로 GET 200 확인

### Phase 2 — FastAPI 서비스 작성 (가장 큰 작업)

새 디렉터리 `server/`를 만들고 `lambda/`의 검증된 로직을 이식한다.

```
server/
├── Dockerfile
├── requirements.txt
├── app/
│   ├── main.py            # FastAPI 앱, CORS, /healthz
│   ├── config.py          # pydantic-settings — 모든 환경변수 단일 정의
│   ├── db.py              # MongoClient (SCRAM), get_collection / get_feedback_collection
│   ├── storage.py         # ← lambda/s3_upload.py (endpoint_url + public base URL)
│   ├── gemini.py          # ← lambda/gemini_client.py (변경 거의 없음)
│   ├── prompts.py         # ← lambda/prompts.py (그대로)
│   ├── sanitize.py        # ← _sanitize_case_data + 스포일러 필드 상수
│   ├── security.py        # API 키 / 관리자 토큰 의존성
│   ├── models.py          # Pydantic 요청·응답 모델
│   └── routers/
│       ├── game.py        # /api/game/{start,chat,evaluate,feedback,scenario/{id}}
│       ├── scenarios.py   # /scenarios CRUD
│       └── feedbacks.py   # /feedbacks CRUD
```

- [ ] 2.1 `config.py` + `db.py` — `authMechanism` 제거, `MONGODB_URL`을 SCRAM URI로
- [ ] 2.2 `storage.py` — MinIO 대응
  ```python
  boto3.client("s3",
      endpoint_url=settings.s3_endpoint_url,           # http://todays-detective-minio:9000
      aws_access_key_id=..., aws_secret_access_key=...,
      config=Config(s3={"addressing_style": "path"}),  # MinIO는 path-style
      region_name="us-east-1")                         # MinIO는 무의미하나 SDK가 요구
  # 반환 URL: f"{settings.public_asset_base_url}/{key}"
  #   → https://cdn.detective.example.com/todays-detective/portraits/<uuid>.jpg
  ```
  업로드 시 `Cache-Control: public, max-age=31536000, immutable`은 기존 코드 그대로 유지 (불변 UUID 키라서 안전)
- [ ] 2.3 `sanitize.py` — **아래 상수를 글자 그대로 이식** (스포일러 유출 방지의 핵심)
  ```python
  _SPOILER_TOP_FIELDS = ("solution", "timeline_truth", "truth")
  _SPOILER_SUSPECT_FIELDS = ("isCulprit", "secret", "real_action", "motive", "trick")
  ```
- [ ] 2.4 `routers/game.py` — **재작성이 아니라 이식**해야 할 부분:
  - **`start` (신규 생성, §3-1)**: `CASE_GENERATION_PROMPT` → JSON 파싱(` ```json ` 펜스 제거) → 초상화 3장 병렬 생성 → Pillow 512px JPEG q80 → MinIO 업로드 → DB 저장 → **정화본** 반환. 초상화 실패는 개별 흡수(아이콘 폴백). `$sample`/`excludeIds` 코드는 이식하지 않는다
  - `chat`: `generate_suspect_prompt(suspect, world_setting, timeline_truth, evidence_list)` → `f"{system}\n\n[이전 대화]\n{history}\n\n탐정: {message}\n용의자:"`, 모델은 `GEMINI_CHAT_MODEL or GEMINI_MODEL`
  - `evaluate`: 정규식 3개와 폴백 문구를 **원문 유지**
    ```python
    _GRADE_RE  = re.compile(r"\[GRADE[^\]]*\]\s*(.*)")
    _REPORT_RE = re.compile(r"\[REPORT[^\]]*\]\s*([\s\S]*?)(?=\[ADVICE[^\]]*\]|$)")
    _ADVICE_RE = re.compile(r"\[ADVICE[^\]]*\]\s*([\s\S]*)")
    # 폴백: grade="F", report="보고서 생성 실패", advice="조언을 불러올 수 없습니다."
    # is_correct = real_culprit_name.strip() == culprit_name.strip()
    ```
  - `feedback`: camelCase 수신 → snake_case 저장 매핑 10개 필드, 300자 제한
  - `scenario/{id}`: 정화본 반환 + `Cache-Control: no-store`
- [ ] 2.5 `routers/scenarios.py` — 목록은 `{"case_data": 0}` projection, `page>=1`, `1<=limit<=50` 클램프 유지
- [ ] 2.6 `routers/feedbacks.py` — 조회 시 snake→camel 역매핑 유지
- [ ] 2.7 `Dockerfile` — `python:3.12-slim`, non-root 유저, `uvicorn --host 0.0.0.0 --port 8000`
- [ ] 2.8 **pytest 회귀 테스트** — 최소 3종: 스포일러 정화 / 평가 정규식 파싱 / 피드백 필드 매핑. 정식 재작성을 택했으므로 사실상 필수다

### Phase 3 — Next.js 컨테이너화

- [ ] 3.1 `next.config.ts`
  - `output: 'standalone'` 추가
  - `images.remotePatterns` → `cdn.detective.example.com`
  - `/server/:path*` → `http://todays-detective-api:8000/:path*`
- [ ] 3.2 **`app/api/game/` 전체 삭제** (route 5개 + `lib/{gemini,prompts,s3}.ts`)
  - ⚠️ **필수 순서**: Next.js는 같은 경로에 Route Handler가 있으면 rewrite를 무시한다. 과거 커밋 `0af9b78`("`/api/:path*` rewrite 제거 — Route Handler 우선 적용")이 정확히 이 함정에 걸린 기록이다. **핸들러를 지우기 전에는 rewrite가 동작하지 않는다.**
- [ ] 3.3 [app/lib/api.ts](../app/lib/api.ts) — `API_BASE_URL`을 `'/server'` 상수로 교체
- [ ] 3.4 [useGeminiClient.ts](../app/hooks/useGeminiClient.ts) — `/api/game/*` → `/server/api/game/*` (3곳)
- [ ] 3.5 **`NEXT_PUBLIC_API_URL` 클라이언트 사용 전면 제거**
  - `NEXT_PUBLIC_*`는 **빌드 타임에 번들에 박힌다.** 런타임 주입이 안 되므로 컨테이너 이미지가 환경에 종속된다. 전부 same-origin `/server/*`로 바꾸면 이 문제와 CORS가 **동시에** 사라진다
- [ ] 3.6 `package.json` — `sharp`, `@aws-sdk/client-s3`, `@vercel/analytics` 제거 + `app/layout.tsx`에서 `<Analytics />` 제거
- [ ] 3.7 `Dockerfile` (multi-stage)
  ```
  deps  : npm ci
  build : npm run build           # output:'standalone'
  run   : node:22-alpine, non-root
          COPY .next/standalone ./ ; .next/static ; public
          CMD ["node", "server.js"]
  ```
- [ ] 3.8 `.dockerignore` — `node_modules`, `.next`, `lambda/`, `plan/`, `.git`

### Phase 4 — unraid 배포 + NPM 설정

- [ ] 4.1 unraid **Docker Compose Manager** 플러그인에 스택 등록 (unraid는 swarm 미지원 — 단일 compose)
- [ ] 4.2 네트워크 2개 구성
  ```yaml
  networks:
    todays-detective-net:          # 스택 내부 통신
    npm-proxy:
      external: true
      name: <Phase 0.2에서 확인한 NPM 네트워크명>
  ```
  - `todays-detective-web`, `todays-detective-minio` → 두 네트워크 모두 연결
  - `todays-detective-api`, `todays-detective-mongo` → **내부 네트워크만**
  - ⚠️ 내부 네트워크에 `internal: true`를 **쓰지 말 것** — api가 Gemini API로 나가는 egress가 막힌다. 포트를 host에 publish하지 않는 것으로 충분히 격리된다
- [ ] 4.3 `.env`를 `/mnt/user/appdata/todays-detective/.env`에 배치, 권한 `600`, compose에서 `env_file`로 참조
- [ ] 4.4 `docker compose up -d` → `docker exec todays-detective-web wget -qO- http://todays-detective-api:8000/healthz`로 내부 연결 확인
- [ ] 4.5 **어떤 서비스도 `ports:`로 host에 노출하지 않는다.** NPM이 컨테이너명으로 직접 도달한다
- [ ] 4.6 전 서비스 `restart: unless-stopped`, 이미지 태그 **고정** (`latest` 금지 — 재부팅 시 예고 없는 메이저 업그레이드 방지)
- [ ] 4.7 백업 구성
  - unraid **CA Appdata Backup** 플러그인에 `todays-detective` 포함
  - `mongodump` 일일 cron (컨테이너 파일 백업만으로는 Mongo 정합성이 보장되지 않는다)

#### NPM 설정 (직접 진행)

**프록시 호스트 2개만 만든다. `api`용 호스트는 만들지 않는다** (§3-3).

**① 웹 — `detective.example.com`**

| 탭 | 항목 | 값 |
|---|---|---|
| Details | Domain Names | `detective.example.com` |
| Details | Scheme | `http` |
| Details | Forward Hostname | `todays-detective-web` |
| Details | Forward Port | `3000` |
| Details | Block Common Exploits | ✅ |
| Details | Websockets Support | ✅ |
| SSL | SSL Certificate | Let's Encrypt (신규 발급) |
| SSL | Force SSL / HTTP/2 / HSTS | ✅ |
| Advanced | Custom Nginx Configuration | 아래 블록 |

```nginx
# 사건 생성은 Gemini 텍스트 1회 + Imagen 3장이라 수십 초가 걸린다.
# NPM 기본 60초로는 /server/api/game/start 가 502로 끊긴다.
proxy_connect_timeout 60s;
proxy_send_timeout    300s;
proxy_read_timeout    300s;
```

**② 이미지 — `cdn.detective.example.com`**

| 탭 | 항목 | 값 |
|---|---|---|
| Details | Domain Names | `cdn.detective.example.com` |
| Details | Scheme | `http` |
| Details | Forward Hostname | `todays-detective-minio` |
| Details | Forward Port | `9000` |
| Details | Block Common Exploits | ✅ |
| SSL | SSL Certificate | Let's Encrypt |
| SSL | Force SSL / HTTP/2 | ✅ |

MinIO는 path-style이므로 최종 이미지 URL은 버킷명이 경로에 포함된다:
`https://cdn.detective.example.com/todays-detective/portraits/<uuid>.jpg`
캐시 헤더는 업로드 시 객체에 이미 박히므로 NPM에서 추가 설정할 것이 없다.

**전제 조건**: NPM 컨테이너와 이 스택이 **같은 docker 네트워크**에 있어야 Forward Hostname이 컨테이너명으로 해석된다 (Phase 4.2).

<details>
<summary>네트워크를 공유하고 싶지 않은 경우 (Option B)</summary>

`todays-detective-web`에 `ports: ["3000:3000"]`, `todays-detective-minio`에 `["9000:9000"]`을 열고, NPM의 Forward Hostname을 **unraid 호스트 IP**(예: `192.168.1.10`)로 지정한다.
단점: 포트가 LAN 전체에 열리고, unraid 방화벽 규칙을 따로 관리해야 한다. 권장하지 않는다.
</details>

### Phase 5 — 보안 하드닝

- [ ] 5.1 CORS — `*` 제거. 외부 클라이언트가 없으므로 `ALLOWED_ORIGINS`는 `https://detective.example.com` 하나
- [ ] 5.2 `X-API-Key` 의존성 적용: `DELETE /scenarios/{id}`, `DELETE /feedbacks/{id}`, `POST /scenarios`
- [ ] 5.3 `GET /scenarios/{id}`(**스포일러 원본**)를 관리자 인증 뒤로 이동. 관리자 화면만 이 경로를 쓰고, 플레이어는 정화본 `/api/game/scenario/{id}`만 사용
- [ ] 5.4 관리자 인증을 FastAPI로 이동 — `POST /admin/login`(비밀번호) → 단기 토큰 발급. 현재는 Next.js가 비밀번호만 확인하고 삭제는 브라우저→API 직접 호출이라 우회된다
- [ ] 5.5 **`POST /api/game/start` 레이트 리밋 필수** (`slowapi` 또는 NPM 레벨). 이제 모든 시작 요청이 실제 생성이므로 **요청 1건 = Gemini 텍스트 1회 + Imagen 3장의 실비**다. IP당 시간 제한을 반드시 건다
- [ ] 5.6 `/api/game/{chat,evaluate}`도 완만한 레이트 리밋 (토큰 비용 방어)
- [ ] 5.7 **모든 외부 키 로테이션**
  - `.env`에 장기간 평문으로 있던 `GEMINI_API_KEY`, `GITHUB_MCP_PAT` 교체
  - `ADMIN_PASSWORD` 신규 난수로 교체 (Phase 0.5에서 생성)
  - AWS 키는 Phase 6에서 자원과 함께 폐기

### Phase 6 — AWS 정리 및 문서 갱신

- [ ] 6.1 신규 스택 정상 동작 확인 (§5 체크리스트 완주)
- [ ] 6.2 Lambda `todays-detective-api` + API Gateway 삭제
- [ ] 6.3 S3 버킷 `todays-detective` 삭제
- [ ] 6.4 MongoDB Atlas 클러스터 삭제
- [ ] 6.5 IAM 사용자 `todays-detective-uploader` + Access Key 삭제
- [ ] 6.6 Vercel 프로젝트 정리 (또는 배포 중단)
- [ ] 6.7 `lambda/` 디렉터리 제거 (git 이력에 남으므로 복구 가능)
- [ ] 6.8 **`CLAUDE.md` 전면 갱신** — 현재도 이미 삭제된 FastAPI/Docker 구조를 설명하고 있어 낡았다. 이번엔 두 번 낡지 않게 한 번에 정리 (Commands, Architecture, Environment Variables, Data Model 전 섹션)
- [ ] 6.9 `plan/aws_migration_plan.md`, `plan/backend_integration_plan.md`에 "과거 이력" 표기 (현행 아님)
- [ ] 6.10 `README.md` — create-next-app 기본 템플릿 그대로다. compose 기동 방법으로 교체

---

## 5. 환경변수 매트릭스

| 변수 | web | api | 값 예시 | 비고 |
|---|:-:|:-:|---|---|
| `MONGODB_URL` | | ✅ | `mongodb://detective:<pw>@todays-detective-mongo:27017/todays_detective?authSource=admin` | `authMechanism` 인자 제거 |
| `GEMINI_API_KEY` | | ✅ | `AIza...` | **api만** 보유 |
| `GEMINI_MODEL` | | ✅ | `gemini-3-flash-preview` | |
| `GEMINI_CHAT_MODEL` | | ✅ | `gemini-3.1-flash-lite-preview` | |
| `IMAGEN_MODEL` | | ✅ | `imagen-4.0-fast-generate-001` | |
| `S3_ENDPOINT_URL` | | ✅ | `http://todays-detective-minio:9000` | 신규 |
| `S3_BUCKET_NAME` | | ✅ | `todays-detective` | 유지 |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | | ✅ | MinIO 자격증명 | AWS 키 대체 |
| `PUBLIC_ASSET_BASE_URL` | | ✅ | `https://cdn.detective.example.com/todays-detective` | 업로드 반환 URL |
| `NEXT_PUBLIC_ASSET_HOST` | ✅(빌드) | | `cdn.detective.example.com` | `images.remotePatterns`용 |
| `ALLOWED_ORIGINS` | | ✅ | `https://detective.example.com` | 1개면 충분 (§3-3) |
| `API_KEY_ADMIN` | | ✅ | 난수 | 파괴적 엔드포인트 보호 |
| `ADMIN_PASSWORD` | ✅ | ✅ | 난수 | Phase 5.4에서 api로 이동 |
| `MONGO_INITDB_ROOT_USERNAME` / `PASSWORD` | | | | mongo 서비스 전용 |
| `MINIO_ROOT_USER` / `PASSWORD` | | | | minio·minio-init 전용 |
| ~~`NEXT_PUBLIC_API_URL`~~ | | | — | **폐기** (same-origin `/server/*`) |
| ~~`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`~~ | | | — | **폐기** |

---

## 6. 검증 체크리스트

**인프라**
1. `docker compose ps` — 5개 중 4개 running, `todays-detective-minio-init`은 exited(0)
2. `todays-detective-{api,mongo}`가 host에 포트를 열지 않았음 (`docker ps` PORTS 비어 있음)
3. 외부에서 `api.` 서브도메인이 존재하지 않음 / API에 도달 불가
4. `docker exec todays-detective-api python -c "import boto3..."` 로 MinIO 연결 확인

**기능 E2E (빈 DB 시작 기준)**
5. `https://detective.example.com` 접속 → 인트로 렌더링
6. "지난 사건 기록" → **빈 목록이 정상 표시**되고 에러가 아님 (초기 상태)
7. "새로운 사건 의뢰" → 사건 생성 완주. **NPM 300초 타임아웃 안에 완료**
8. 브리핑 화면 초상화 3장 렌더링 + DevTools Network에서 `cdn.` 도메인 200
9. MinIO에 객체 3개 생성 확인 (`mc ls --recursive local/todays-detective/portraits`)
10. 심문 — AP 소모, Gemini 응답 수신
11. 추리 제출 → 등급/보고서/조언 파싱 정상 (`F` + "보고서 생성 실패" 폴백이 **아닌** 실제 값)
12. 피드백 제출 → 관리자 화면에서 조회
13. 다시 "지난 사건 기록" → 방금 만든 사건 1건이 목록에 있고, 불러와서 재생 가능

**스포일러 방어 (회귀 위험 최상)**
14. `POST /server/api/game/start` 응답 JSON에 `solution`, `timeline_truth`, `truth` **없음**
15. 같은 응답의 각 suspect에 `isCulprit`, `secret`, `real_action`, `motive`, `trick` **없음**
16. `GET /server/api/game/scenario/{id}` 응답도 14·15 만족

**보안**
17. `DELETE /scenarios/{id}` — 키 없이 호출 시 401/403
18. `GET /scenarios/{id}` — 인증 없이 호출 시 거부 (스포일러 원본)
19. `POST /api/game/start` 연속 호출 시 레이트 리밋 발동
20. `cdn.` 도메인에서 `portraits/` 외 경로(예: 버킷 루트 목록)가 403

**운영**
21. unraid 재부팅 후 스택 자동 복구
22. `mongodump` cron 산출물 확인 및 **복원 리허설 1회**

---

## 7. 리스크와 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| **FastAPI 재작성 중 스포일러 정화 누락** | 게임이 근본적으로 망가짐(정답 노출). 가장 치명적 | Phase 2.8 pytest 필수 + 검증 14~16 |
| **평가 정규식 이식 오류** | 모든 추리가 `F` / "보고서 생성 실패" | 정규식·폴백 문구를 원문 그대로 복사, 실제 Gemini 응답 픅스처로 테스트 |
| **생성 요청이 곧 실비** | 모든 `start`가 Gemini+Imagen 호출. 공개 도메인이므로 봇 한 대에 비용 폭증 | Phase 5.5 레이트 리밋을 **배포와 동시에** 적용. 나중으로 미루지 않는다 |
| NPM 기본 60초 타임아웃 | 사건 생성이 502로 끊김 | NPM Advanced에 `proxy_read_timeout 300s` (§Phase 4 NPM 설정) |
| NPM과 네트워크 미공유 | Forward Hostname이 해석 안 됨 → 502 | Phase 0.2 → 4.2. 안 되면 Option B |
| `NEXT_PUBLIC_*` 빌드 타임 박힘 | 잘못된 주소가 이미지에 고정 | Phase 3.5로 클라이언트에서 완전 제거 |
| Route Handler가 rewrite를 가림 | `/server/*` 프록시 무동작 | Phase 3.2 순서 준수 (`app/api/game/` 삭제 먼저) |
| unraid array(HDD)에 Mongo 배치 | 심각한 성능 저하 | Phase 0.3 — cache 풀 강제 |
| 단일 서버 = 단일 장애점 | Vercel/Atlas의 가용성 상실 | 감수 (개인 프로젝트). 백업·복원 리허설로 보완 |
| 가정용 회선 IP 변동 | 도메인이 끊김 | DDNS. 문제 지속 시 Cloudflare Tunnel 검토 |
| 데이터 폐기 결정 철회 | 기존 시나리오 복구 불가 | Phase 0.4 보험 사본 + **Phase 6까지 AWS 자원 유지** |

**롤백**: Phase 6 전까지 AWS 자원과 Vercel 배포를 **모두 유지**한다. 문제 발생 시 Vercel 쪽 `NEXT_PUBLIC_API_URL`을 API Gateway로 되돌리면 즉시 구 환경으로 복귀된다. 데이터가 분리돼 있으므로 병합 걱정도 없다.

---

## 8. 작업량 추정

| Phase | 내용 | 예상 |
|---|---|---|
| 0 | 준비 (도메인·네트워크·appdata·시크릿) | 1h |
| 1 | 데이터 계층 부팅 + 검증 | 1~2h |
| **2** | **FastAPI 재작성 + 테스트** | **7~10h** ← 최대 비중 |
| 3 | Next.js 컨테이너화 | 3~4h |
| 4 | unraid 배포 + NPM 설정 | 2~3h |
| 5 | 보안 하드닝 | 2~3h |
| 6 | AWS 정리 + 문서 갱신 | 1~2h |
| | **합계** | **약 17~25h** |

기존 데이터 이관 단계가 사라져 초안(23~34h) 대비 줄었다.

---

## 9. 착수 지점

Phase 0(준비)과 Phase 1(데이터 계층)은 기존 운영에 **영향이 없고 되돌릴 수 있으므로** 여기서 시작하는 것이 안전하다. Phase 2(FastAPI 재작성)가 실제 분기점이다.
