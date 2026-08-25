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
        │   detective.example.com     → 172.17.0.1:3100 │
        │   cdn.detective.example.com → 172.17.0.1:9100 │
        └───┬─────────────────────────────┬───────────┘
            │   docker0 바인드 (LAN 미노출, §0-B)
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
| `todays-detective-web` | 자체 빌드 (node:22-alpine) | `172.17.0.1:3100`→3000 | — | `todays-detective-net` |
| `todays-detective-api` | 자체 빌드 (python:3.12-slim) | 미공개 | — | `todays-detective-net` |
| `todays-detective-mongo` | `mongo:8` | 미공개 | `appdata/mongo/{data,config,init}` | `todays-detective-net` |
| `todays-detective-minio` | `minio/minio:<고정태그>` | `172.17.0.1:9100`→9000 | `appdata/minio/data` | `todays-detective-net` |
| `todays-detective-minio-init` | `minio/mc:<고정태그>` | — | — | `todays-detective-net` |

> **compose 서비스명 = 컨테이너명**으로 통일한다(`container_name`과 서비스 키를 동일하게). Docker DNS가 이 이름으로 해석되므로 NPM의 Forward Hostname과 `next.config.ts` rewrite 주소가 컨테이너명과 정확히 일치한다.

> `todays-detective-minio-init`은 부팅 시 1회 실행 후 종료되는 컨테이너다 (`restart: "no"`).

> **기존 데이터를 폐기하므로 Mongo 버전 호환 제약이 없다.** `mongo:8` 최신 안정 메이저로 시작하고 태그를 고정한다.

> 볼륨 실경로는 `/mnt/user/appdata/todays-detective/` (물리적으로 `disk3`, array). §0-C

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
- [x] 0.2 NPM 네트워크 확인 — **기본 `bridge`에 있음 → 컨테이너명 DNS 불가.** §0-B 참조
- [x] 0.3 `appdata` 경로 생성 — `/mnt/user/appdata/todays-detective/` 하위 5개 디렉터리 (물리 위치 `disk3`). §0-C 참조
- [x] 0.4 ~~(선택) Atlas 스냅샷 + `aws s3 sync`로 폐기 전 사본~~ — **불가 확인**. §0-A 참조
- [x] 0.5 신규 시크릿 생성 — `.env.unraid` 생성 (gitignore 대상). Mongo root/app 비밀번호, MinIO 루트 자격증명, `API_KEY_ADMIN`, 신규 `ADMIN_PASSWORD`
- [x] 0.6 유효한 `GEMINI_API_KEY` 확보 + 모델 3종 교체 — 검증 완료. §0-E

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

#### §0-B. NPM이 기본 `bridge`에 있어 컨테이너명 DNS가 불가 (결정: docker0 바인드)

```
Nginx-Proxy-Manager-Official   NetworkMode: bridge   IP: 172.17.0.3
```

Docker 임베디드 DNS는 **user-defined 네트워크에서만** 컨테이너명을 해석한다. 기본 `bridge`에 있는 NPM은 `todays-detective-web`이라는 이름을 알 수 없다 → 초안의 "Forward Hostname = 컨테이너명" 전제가 성립하지 않는다.

**결정: docker0 게이트웨이(`172.17.0.1`)에만 포트를 바인드한다.**

```yaml
# todays-detective-web
ports: ["172.17.0.1:3100:3000"]
# todays-detective-minio
ports: ["172.17.0.1:9100:9000"]
```

- NPM(172.17.0.3, bridge)은 `172.17.0.1:3100`에 도달할 수 있다
- **LAN(192.168.0.x)에서는 도달 불가** — `172.17.0.1`은 LAN에서 라우팅되지 않는다. §3-3의 보안 수준이 유지된다
- 컨테이너 재생성·재부팅에도 유지된다 (User Scripts 훅 같은 취약한 장치가 필요 없다)
- ⚠️ **호스트 3000번은 NPM이 이미 점유**(`0.0.0.0:3000->3000`) → 웹은 **3100**, MinIO는 **9100**을 쓴다
- `todays-detective-api`, `todays-detective-mongo`는 **포트를 전혀 공개하지 않는다**

검토했으나 채택하지 않은 대안:
- `docker network connect`로 NPM을 스택 네트워크에 추가 → 컨테이너명 DNS는 깔끔해지지만 **NPM 컨테이너 재생성 시 끊어짐**
- `0.0.0.0`으로 공개 → 가장 단순하나 웹·이미지 서버가 LAN에 직접 노출됨

#### §0-C. appdata는 array(disk3)에 있음 (결정: 그대로 사용)

```
appdata share: shareUseCache="no", shareInclude="disk3"   → HDD
cache pool   : sdc1 단일 ZFS, 444G 중 443G 여유 (거의 미사용)
```

초안은 "cache 풀(SSD)에 배치"를 권고했으나, **기존 appdata(array)를 그대로 쓰기로 결정**했다.

- 이 게임의 DB 부하는 사건 생성 1회 + 조회 약건 수준이라 HDD로도 실사용에 지장이 없을 것으로 판단
- array는 **parity 보호**를 받는다. cache 풀은 `sdc1` 단일 디스크 ZFS로 이중화가 없다
- 기존 컨테이너(immich·NPM 등) 전체에 영향을 주는 share 설정 변경을 이 프로젝트 부산물로 하지 않는다

생성된 경로 (`disk3`에 실체):
```
/mnt/user/appdata/todays-detective/
├── mongo/data     # Mongo 데이터
├── mongo/config   # Mongo 설정
├── mongo/init     # /docker-entrypoint-initdb.d 마운트 (Phase 1.3 앱 계정 스크립트)
├── minio/data     # MinIO 객체
└── backup/        # mongodump 산출물 (Phase 4.7)
```

#### §0-D. 확인된 서버 환경

| 항목 | 값 |
|---|---|
| unraid | 7.3.2 (커널 6.18.38) |
| Docker | 29.5.3 / Compose v5.1.2 |
| CPU | Intel i3-9100F (x86_64) — arm64 대상이던 `lambda/build.sh`는 무의미 |
| Compose Manager 플러그인 | 설치됨 (`immich` 프로젝트 운영 중) |
| 호스트 점유 포트 | 180, 181, 1443, 2283, 3000(NPM), 8080 |
| docker0 | 172.17.0.1 |
| SSH | `ssh unraid` (키 인증, `~/.ssh/unraid_todays_detective`) |

#### §0-E. Gemini 키·모델 갱신 결과 (2026-08-25)

키가 새로 발급되어 유효하고, 모델 3종이 모두 교체됐다. 셋 다 접근 가능함을 확인했다.

| 용도 | 모델 | 지원 메서드 | 토큰 한도 |
|---|---|---|---|
| 사건 생성 | `gemini-3.6-flash` | `generateContent` 등 | in 1,048,576 / out 65,536 |
| 용의자 심문 | `gemini-3.5-flash-lite` | `generateContent` 등 | in 1,048,576 / out 65,536 |
| 초상화 | `gemini-3.1-flash-lite-image` | `generateContent` **만** | in 65,536 / out 65,536 |

**⚠️ 비용 한도: 개발용 키, 월 5,000원.** 이것이 두 가지를 강제한다.

1. **Phase 5.5 레이트 리밋은 선택이 아니다.** `POST /api/game/start` 1건 = 텍스트 1회 + 이미지 3장. 공개 도메인에 무제한으로 열어두면 봇 한 대가 월 한도를 순식간에 소진한다. **배포와 동시에** 적용한다
2. **Phase 2 테스트도 절약한다.** 키 유효성·모델 존재 확인은 무료(메타데이터 조회)로 처리하고, 실제 생성 호출은 필요한 최소 횟수만 수행한다

#### §0-F. ⚠️ 초상화 생성 코드가 그대로는 동작하지 않는다 (Phase 2 필수 변경)

`IMAGEN_MODEL`이 Imagen이 아니라 **Gemini 이미지 모델**로 바뀌었다. `gemini-3.1-flash-lite-image`는
`generateContent`만 지원하고 **`predict`를 지원하지 않는다.** 그런데 현재 코드는 Imagen의 `predict`
엔드포인트를 쓴다:

- [lambda/gemini_client.py](../lambda/gemini_client.py) `generate_image()` — `client.models.generate_images()` + `types.GenerateImagesConfig`
- [app/api/game/lib/gemini.ts](../app/api/game/lib/gemini.ts) `generateImage()` — `genAI.models.generateImages()`

**둘 다 실패한다.** Phase 2에서 `generateContent` 방식으로 재작성해야 한다.

실제 호출로 확인한 동작 형태 (1회 프로브):

```python
resp = client.models.generate_content(
    model=settings.image_model,
    contents=prompt,
    config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
)
for part in resp.candidates[0].content.parts:
    if part.inline_data:                      # REST에서는 inlineData
        image_bytes = part.inline_data.data   # base64 디코드된 bytes
        # mime_type = "image/jpeg"
```

확인된 응답 특성:

| 항목 | 값 |
|---|---|
| `finishReason` | `STOP` |
| part 구성 | `inlineData` + `thoughtSignature` (텍스트 part 없음) |
| mimeType | `image/jpeg` |
| 원본 크기 | **768 × 1344 (세로 9:16)** — 1:1이 아니다 |
| 용량 | 약 866 KB |
| 토큰 사용 | prompt 11 + image out 1,120 = 1,516 |

**종횡비는 `imageConfig`로 직접 지정한다 — 크롭 불필요 (확정)**

종횡비를 지정하지 않으면 768×1344 세로 이미지가 온다. 그대로 `img.resize((512, 512))`하면
인물이 가로로 찌그러지고, center-crop으로 잘라내면 머리나 상체가 날아간다. 둘 다 답이 아니다.

정답은 **요청 시점에 1:1을 명시**하는 것이다. 실측으로 확정한 필드 형태:

```json
{
  "contents": [{ "parts": [{ "text": "<프롬프트>" }] }],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "imageConfig": { "aspectRatio": "1:1", "imageSize": "1K" }
  }
}
```

Python SDK에서는 `config=types.GenerateContentConfig(response_modalities=["IMAGE"],
image_config=types.ImageConfig(aspect_ratio="1:1", image_size="1K"))`.

| 항목 | 확정 값 |
|---|---|
| `aspectRatio` 유효값 | `1:1`, `1:4`, `1:8`, `2:3`, `3:2`, `3:4`, `4:1`, `4:3`, `4:5`, `5:4`, `8:1`, `9:16`, `16:9`, `21:9` |
| `imageSize` 유효값 (API 전체) | `1K`, `2K`, `4K`, `512`, `512P`, `512PX` |
| `imageSize` — 이 모델에서 실제 사용 가능 | **`1K`만.** `512`·`512P`·`512PX`는 `Image size ... is not supported for this model`로 거부된다 (512px는 Flash Image 전용, 우리는 Flash **Lite** Image) |
| 1:1 + 1K 결과 | **1024 × 1024 JPEG**, 약 921 KB, image out 1,120 토큰 |

→ **Pillow은 1024→512 균등 축소만 하면 된다.** 크롭도, 왜곡 보정도 필요 없다.
기존 `s3_upload.py`의 `img.resize((size, size))` 로직을 그대로 쓸 수 있다 (입력이 정사각형이므로).

존재하지 않는 형태 (문서 요약이 잘못 안내한 것들 — 시도하지 말 것):
- `response_format: {...}` → `Unknown name "response_format"`
- `generationConfig.aspectRatio` (평평한 배치) → `Unknown name "aspectRatio" at 'generation_config'`

> **비용 없이 API 스펙을 알아내는 방법** — 일부러 잘못된 enum 값을 보내면 생성 전에 400으로 거부되며
> 에러 메시지에 유효값 목록이 담겨 온다. 토큰이 소비되지 않는다. 문서가 애매할 때 이 방법을 먼저 쓴다.

**환경변수명**: `IMAGEN_MODEL` → `IMAGE_MODEL`로 정리한다 (더 이상 Imagen이 아니다).

**⚠️ `google-genai` 버전**: `lambda/requirements.txt`가 `google-genai==0.3.0`(2024년 말)으로 고정돼 있다.
`types.ImageConfig`도, Gemini 3 이미지 모델도 지원하지 않는 버전이다. 최신은 **2.19.0** —
Phase 2 `server/requirements.txt`에서 반드시 올려야 한다.

#### §0-G. 512×512를 직접 받을 수 있는가 — 가능하지만 33% 더 비싸다

"1K로 받아 축소하지 말고 처음부터 512로 받자"를 실측 검증했다. **기술적으로는 된다.**
단 512px를 지원하는 모델이 `gemini-3.1-flash-image`(**non-lite**)뿐이고, 이 모델의
이미지 출력 단가가 lite의 **2배**여서 총액은 오히려 올라간다.

| | `gemini-3.1-flash-lite-image` @ `1K` | `gemini-3.1-flash-image` @ `512` |
|---|---|---|
| 반환 크기 | 1024×1024 (921 KB) | **512×512** (275 KB) |
| image out 토큰 | 1,120 | **747** (−33%) |
| 이미지 출력 단가 | **$30 / 1M 토큰** | $60 / 1M 토큰 (2배) |
| **장당 비용** | **$0.0336** | **$0.0448 (+33%)** |
| 사건 1건(3장) | **$0.101** | $0.134 |
| Pillow 축소 | 필요 (1024→512 균등) | 불필요 |

토큰은 33% 줄지만 단가가 2배라 **결과적으로 33% 더 비싸다.** 월 5,000원(약 $3.4) 한도에서는
사건 생성 가능 횟수가 약 33건 → 약 25건으로 줄어든다.

**결정: `gemini-3.1-flash-lite-image` @ `1K` 유지 + Pillow로 512 축소.**

부수 근거:
- 1024→512 축소는 **균등 축소**라 왜곡이 없다 (§0-F). 크롭도 아니다
- 다운샘플링은 안티에일리어싱이 걸려 네이티브 512 렌더보다 오히려 선명한 경우가 많다
- 1K 원본(921 KB)은 api 컨테이너 메모리에만 머물고, MinIO에는 축소본만 올라간다.
  Google→api 구간 전송량은 비용에 영향이 없다
- 512는 `gemini-3.1-flash-lite-image`에서 거부된다 (`not supported for this model`).
  lite 모델로는 애초에 선택지가 없다

참고 — 확인한 이미지 모델 6종: `gemini-2.5-flash-image`, `gemini-3-pro-image`,
`gemini-3-pro-image-preview`, `gemini-3.1-flash-image`, `gemini-3.1-flash-image-preview`,
`gemini-3.1-flash-lite-image`. 이 중 `gemini-3.1-flash-lite-image`가 장당 최저가다
(`gemini-2.5-flash-image`는 1,290토큰 @ $30/1M = $0.039).

### Phase 1 — 데이터 계층 부팅 ✅ 완료 (2026-08-25)

unraid에 직접 배포하여 검증했다. 산출물은 [`infra/`](../infra/), 배포 절차는 [infra/README.md](../infra/README.md).

- [x] 1.1 `infra/docker-compose.yml` — `todays-detective-{mongo,minio,minio-init}`. 이미지 태그 고정: `mongo:8.0.29`(8.0 LTS 라인), `minio/minio:RELEASE.2025-09-07T16-13-09Z`, `minio/mc:RELEASE.2025-08-13T08-35-41Z`
- [x] 1.2 MinIO 버킷 초기화 — `infra/minio-init/init.sh` (멱등, 스택 기동마다 실행). 버킷 생성 + `portraits/` 프리픽스에만 익명 read
  > MinIO 커뮤니티 에디션은 2025년 이후 웹 콘솔 기능이 축소됐다. **`mc` CLI 기준으로 운영**하고 콘솔에 의존하지 않는 것이 안전하다.
  > 익명 read는 **`portraits/` 프리픽스에만** 부여한다. 버킷 전체 공개 금지
- [x] 1.3 Mongo 초기화 — `infra/mongo-init/01-app-user.sh` (`.js`가 아니라 `.sh`로 작성. 셸이라 env 접근이 확실하다)
  - 앱 전용 계정 `detective` (`readWrite@todays_detective`) 생성. 공식 이미지 entrypoint는 `admin` DB에 root만 만든다
  - `scenarios`, `feedbacks` 컬렉션 선생성 → 최초 조회가 에러 대신 빈 배열을 반환한다
  - 조회 패턴에 맞춘 인덱스 3개: `scenarios{created_at:-1}`, `scenarios{crime_type:1,created_at:-1}`, `feedbacks{created_at:-1}`
  - ⚠️ 이 스크립트는 **`/data/db`가 빈 첫 부팅에만** 실행된다. 수정 후 재적용하려면 데이터를 비우거나 `mongosh`로 직접 실행해야 한다
- [x] 1.4 검증 완료 — `infra/verify-{mongo,minio}.sh`. 결과는 §1-A

#### §1-A. Phase 1 검증 결과

| 항목 | 결과 |
|---|---|
| `todays-detective-mongo` | running (healthy) |
| `todays-detective-minio` | running (healthy) |
| `todays-detective-minio-init` | exited(0) — 정상 (1회성) |
| 앱 계정 | `detective` roles=`readWrite@todays_detective` |
| 컬렉션·인덱스 | `scenarios`(3), `feedbacks`(2) — 모두 `todays_detective`에 생성, `test`는 비어 있음 |
| 익명 GET (`172.17.0.1:9100`) | **HTTP 200** |
| LAN 접근 (`192.168.0.21:9100`) | **연결 불가** — §0-B 설계대로 동작 |
| 버킷 루트 익명 목록 | **HTTP 403** — 객체 목록 비공개 |
| 응답 헤더 | `Cache-Control: public, max-age=31536000, immutable`, `Content-Type: image/jpeg` 유지 |
| 공개 포트 | minio `172.17.0.1:9100->9000`만. mongo는 공개 없음 |
| `down` → `up` 재기동 | 계정·컬렉션·인덱스 전부 유지, `minio-init` 멱등 재실행 확인 |

**Compose Manager 연동** — `/boot`은 vfat이라 권한이 없어 `.env`를 둘 수 없다. 플러그인의 **indirect 모드**로
실제 compose와 `.env`는 appdata에 두고 `/boot`에는 메타데이터 4개만 올렸다 (immich가 쓰는 방식과 동일).
unraid **Docker → Compose** 탭에서 Start/Stop/Update가 가능하다. 상세는 [infra/README.md](../infra/README.md).

### Phase 2 — FastAPI 서비스 작성 (가장 큰 작업)

**단계별로 진행한다.** 각 단계 완료 후 확인을 받고 다음으로 넘어간다.

| 단계 | 내용 | 대응 항목 |
|---|---|---|
| ~~**2-A**~~ | ✅ 프로젝트 골격 — `requirements.txt`, `config.py`, `db.py`, `main.py`(`/healthz`), `Dockerfile` | 2.1, 2.7 |
| ~~**2-B**~~ | ✅ 외부 연동 — `storage.py`(MinIO), `gemini.py`(텍스트 + §0-F 이미지 재작성), `prompts.py` 이식 | 2.2 |
| ~~**2-C**~~ | ✅ 데이터 계약 — `sanitize.py`(스포일러 정화), `models.py`(Pydantic) | 2.3 |
| ~~**2-D**~~ | ✅ 게임 라우터 — `routers/game.py` 5개 엔드포인트 (통합 검증 완료) | 2.4 |
| ~~**2-E**~~ | ✅ CRUD 라우터 — `routers/scenarios.py`, `routers/feedbacks.py` | 2.5, 2.6 |
| ~~**2-F**~~ | ✅ 회귀 테스트 — pytest 158건 통과 | 2.8 |

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
- [x] 2.3 `sanitize.py` + `models.py` — 상수를 글자 그대로 이식하고 **Lambda 원문과 출력 동일성을 실측 검증**했다
  ```python
  SPOILER_TOP_FIELDS = ("solution", "timeline_truth", "truth")
  SPOILER_SUSPECT_FIELDS = ("isCulprit", "secret", "real_action", "motive", "trick")
  ```
  검증 방식: Lambda 원문 `_sanitize_case_data`를 그대로 복사해 기준(oracle)으로 두고
  같은 입력의 출력 JSON을 정렬 비교했다 (`server/verify_2c.py`). 33개 검사 전부 통과.

  **의도적 차이 1건** — suspects 배열에 dict이 아닌 값이 섞이면 Lambda는 `s.items()`에서
  터져 500을 낸다. 새 구현은 해당 항목을 건너뛴다. 정상 입력에서는 출력이 완전히 동일하다.

  **부가 안전장치** — 프롬프트 스키마에 없는 필드가 case_data나 suspect에 나타나면
  경고 로그를 남긴다. 정화 동작은 바뀌지 않는다. LLM이 새 스포일러 필드를 만들어냈을 때
  denylist가 조용히 놓치는 상황을 드러내기 위한 것이다.

  `models.py` 설계 방침: **`case_data`는 엄격한 Pydantic 모델로 만들지 않는다.**
  LLM 생성 JSON이라 필드가 유동적이어서, 스키마를 강제하면 정상 시나리오까지 422로 튕긴다.
  `dict[str, Any]`로 통과시키고 검증은 게임 진행에 필요한 최소 조건만 한다.
- [x] 2.4 `routers/game.py` — 이식 완료. 무료 검증 27건 + 실제 Gemini 통합 검증 통과 (§2-D)
  이식 대상이었던 항목:
  - **`start` (신규 생성, §3-1)**: `CASE_GENERATION_PROMPT` → JSON 파싱(` ```json ` 펜스 제거) → 초상화 3장 병렬 생성(**§0-F — `generateContent` + `imageConfig` 방식으로 재작성**) → Pillow 512px JPEG q80 축소 → MinIO 업로드 → DB 저장 → **정화본** 반환. 초상화 실패는 개별 흡수(아이콘 폴백). `$sample`/`excludeIds` 코드는 이식하지 않는다
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
#### §2-D. Phase 2-D 통합 검증 결과 (실제 Gemini 호출)

| 항목 | 결과 |
|---|---|
| 사건 생성 소요 시간 | **31.4초** (NPM 300초 타임아웃 안에 충분히 들어온다) |
| 생성된 사건 | "안개 낀 해안 저택의 비극" (살인), 용의자 3명 |
| 초상화 | **3/3 생성** → MinIO 업로드, 각 512×512, 익명 GET 200 |
| 스포일러 정화 | 응답 누출 **0건**. DB 원본에는 `solution`·`isCulprit`·`motive`·`trick` 보존 |
| 진범 | DB에 정확히 1명. 클라이언트 응답에는 없음 |
| 심문 | 정상 응답. 프롬프트의 "2문장 이내" 지침대로 동작 |
| 평가 | 오답 지목 → `isCorrect=False`, 등급 `F`, **폴백이 아닌 실제 파싱 성공** |
| 스포일러 규칙 | 실패한 추리의 `advice`에 진범 이름 **없음** (프롬프트 규칙 준수 확인) |
| 정화 조회 | `Cache-Control: no-store` 적용 확인 |

평가 파싱은 유료 호출 전에 무료 픅스처로 8가지 변형을 먼저 검증했다 — 대괄호 변형
(`[GRADE: 등급]`), 등급이 같은 줄에 오는 경우, 등급 뒤에 설명이 붙는 경우, `[ADVICE]` 누락,
형식 완전 이탈 시 `F` / "보고서 생성 실패" / "조언을 불러올 수 없습니다." 폴백.

**검증 스크립트 자체의 버그 1건** — `dict(r.headers)`로 변환하면 헤더의 대소문자 무관 조회가
사라져 `Cache-Control`이 없는 것처럼 보였다. 서버는 정상이었다. 스크립트를 수정했다.

생성된 시나리오 1건과 초상화 3장은 **삭제하지 않고 보존**한다 — Phase 3에서 "지난 사건 기록"
플로우를 검증할 첫 데이터다.

- [x] 2.5 `routers/scenarios.py` — projection·클램프·에러 메시지 유지 (§2-E)
- [x] 2.6 `routers/feedbacks.py` — snake→camel 역매핑 유지 (§2-E)

#### §2-E. Phase 2-E 검증 결과 (48건 전부 통과, Gemini 호출 0회)

엔드포인트 13개 등록 완료. 2-D에서 보존한 시나리오를 그대로 활용해 추가 비용 없이 검증했다.

**유지한 Lambda 동작**

| 항목 | 내용 |
|---|---|
| 후행 슬래시 | 프론트가 `/scenarios/?page=..` 형태로 호출한다. Lambda는 `path.rstrip("/")`로 받았다. 307 리다이렉트를 피하려고 `""`와 `"/"` 두 경로를 등록했다 |
| 목록 projection | `{"case_data": 0}` — 본문 제외 확인 |
| 클램프 | `page=0`·`limit=999`를 **거부하지 않고 클램프**한다 (Lambda 동작). 1↔50 범위 |
| 에러 메시지 차이 | CRUD는 `Invalid id` / `Not found`, 게임 라우터는 `Invalid scenario id` / `Scenario not found`. 원문 그대로 유지 |
| 입력 형식 차이 | `POST /feedbacks`는 **snake_case**(`scenario_id`, `game_result`) + **201**, `POST /api/game/feedback`은 camelCase + 200 |
| 역매핑 | 피드백 조회 시 `game_result` 10필드가 camelCase로 복원됨 확인 |
| 정렬·필터 | `created_at` 역순, `crime_type` 필터 동작 확인 |

**개선된 동작 1건** — `page=abc` 같은 비숫자 입력은 Lambda에서 `int()` 예외로 **500**이 났다.
FastAPI는 422를 반환한다.

**Phase 5.3 대상 재확인** — `GET /scenarios/{id}`가 `solution`·`isCulprit`을 포함한 원본을
그대로 반환하는 것을 실제 응답으로 확인했다. 같은 시나리오를 `/api/game/scenario/{id}`로
조회하면 `solution`이 없다. 인증을 붙일 지점이 명확하다.

라우터 3개에 `TODO(Phase 5.2)` 주석으로 인증이 필요한 지점을 표시했다
(`POST /scenarios`, `DELETE /scenarios/{id}`, `DELETE /feedbacks/{id}`).
- [ ] 2.7 `Dockerfile` — `python:3.12-slim`, non-root 유저, `uvicorn --host 0.0.0.0 --port 8000`
- [x] 2.8 **pytest 회귀 테스트 — 158건 전부 통과** (§2-F)

#### §2-F. Phase 2-F 결과

```
tests/test_evaluate_parsing.py   25건
tests/test_feedback_mapping.py   28건
tests/test_routes.py             47건
tests/test_sanitize.py           42건
tests/test_storage.py            16건
                                158건 통과 (2.4초)
```

**Dockerfile을 멀티스테이지로 전환했다.** 기본(마지막) 스테이지가 `runtime`이라 compose는
target 지정 없이 운영 이미지를 빌드하고, `--target test`로 pytest 스테이지를 따로 만든다.
운영 이미지에 pytest가 없음을 확인했다.

**테스트가 지키는 두 안전장치**

1. **Gemini 호출 0회** — `block_gemini`가 autouse로 `call_gemini`·`generate_portrait_image`·
   `get_client`를 예외 발생 함수로 교체한다. 실수로 실제 호출이 새면 즉시 실패하므로
   테스트가 비용을 발생시키지 않는다
2. **운영 데이터 무손상** — 앱 계정은 `todays_detective` DB에만 권한이 있어 별도 DB를 쓸 수
   없다. 같은 DB의 `scenarios_pytest`/`feedbacks_pytest` 컬렉션을 쓰고 매 테스트마다 비운다.
   실행 후 운영 컬렉션이 그대로임을 확인했다 (scenarios 1건 유지)

**작업 중 만난 함정 3건**

| 문제 | 원인 | 해결 |
|---|---|---|
| `ModuleNotFoundError: app` | pytest가 테스트 파일의 basedir(`/app/tests`)만 sys.path에 넣는다 | `pytest.ini`에 `pythonpath = .` |
| 별도 테스트 DB 접근 거부 | 앱 계정은 `todays_detective`에만 `readWrite` | 같은 DB의 전용 컬렉션으로 전환 |
| `Cannot use MongoClient after close` | `TestClient` 컨텍스트 종료 시 lifespan이 `db.close()`를 호출 → 이후 정리 코드가 닫힌 핸들 사용 | 정리 시점에 `db.get_db()`로 핸들 재취득 |

`starlette.testclient`가 `httpx` 대신 **`httpx2`**를 요구하므로 dev 의존성을 교체했다.

Phase 2-B~2-E에서 쓴 `verify_*.py` 스크립트는 pytest로 대체하고 제거했다.

### Phase 3 — Next.js 컨테이너화 ✅ 완료 (2026-08-25)

- [x] 3.1 `next.config.ts`
  - `output: 'standalone'` 추가
  - `images.remotePatterns` → `cdn.detective.example.com`
  - `/server/:path*` → `http://todays-detective-api:8000/:path*`
- [x] 3.2 **`app/api/game/` 전체 삭제** (route 5개 + `lib/{gemini,prompts,s3}.ts`)
  - ⚠️ **필수 순서**: Next.js는 같은 경로에 Route Handler가 있으면 rewrite를 무시한다. 과거 커밋 `0af9b78`("`/api/:path*` rewrite 제거 — Route Handler 우선 적용")이 정확히 이 함정에 걸린 기록이다. **핸들러를 지우기 전에는 rewrite가 동작하지 않는다.**
- [x] 3.3 [app/lib/api.ts](../app/lib/api.ts) — `API_BASE_URL`을 `'/server'` 상수로 교체
- [x] 3.3-b [app/types/game.ts](../app/types/game.ts) — **런타임과 어긋난 타입 정정**
  - `Suspect.secret`, `Suspect.isCulprit`, `CaseData.solution`, `CaseData.timeline_truth`가
    **non-optional로 선언**돼 있지만 서버 정화본에는 존재하지 않는다 (§2-C)
  - 지금은 resolution 이전에 아무도 읽지 않아 사고가 안 났을 뿐이다. optional(`?`)로 바꿔
    타입이 실제 응답을 반영하게 한다
- [x] 3.4 [useGeminiClient.ts](../app/hooks/useGeminiClient.ts) — `/api/game/*` → `/server/api/game/*` (3곳)
- [x] 3.5 **`NEXT_PUBLIC_API_URL` 전면 제거**
  - `NEXT_PUBLIC_*`는 **빌드 타임에 번들에 박힌다.** 런타임 주입이 안 되므로 컨테이너 이미지가 환경에 종속된다. 전부 same-origin `/server/*`로 바꾸면 이 문제와 CORS가 **동시에** 사라진다
- [x] 3.6 `package.json` — `sharp`, `@aws-sdk/client-s3`, `@vercel/analytics` 제거 + `app/layout.tsx`에서 `<Analytics />` 제거
- [x] 3.7 `Dockerfile` (multi-stage)
  ```
  deps  : npm ci
  build : npm run build           # output:'standalone'
  run   : node:22-alpine, non-root
          COPY .next/standalone ./ ; .next/static ; public
          CMD ["node", "server.js"]
  ```
- [x] 3.8 `.dockerignore` — `node_modules`, `.next`, `lambda/`, `plan/`, `.git`

#### §3-A. Phase 3 결과

`todays-detective-web`이 `172.17.0.1:3100`에 healthy 상태로 떠 있다.

**검증**

| 항목 | 결과 |
|---|---|
| `GET /` | 200, 인트로 화면 렌더링 |
| `GET /server/healthz` | 200 → `{"status":"ok",...}` — **rewrite 프록시 동작** |
| `GET /server/scenarios` | 200, 리다이렉트 없음 |
| 삭제한 `POST /api/game/*` 3개 | **404** (의도된 결과) |
| 남긴 `POST /api/admin/verify` | 401 (동작 유지) |
| `Cache-Control: no-store` | 프록시를 그대로 통과 |
| LAN(`192.168.0.21:3100`) | 연결 불가 — §0-B 설계대로 |
| 브라우저 E2E | 인트로 → 사건 기록실 → 목록 → 브리핑까지 정상 |

**`images.remotePatterns`를 두지 않기로 했다.** 초상화는 이미 512×512 q80(약 58KB) +
`immutable` 캐시다. Next 최적화기를 거치면 홈서버 CPU만 쓰고 얻는 게 없다. 원격 초상화
`<Image>`에 `unoptimized`를 지정했고, 덕분에 **공개 도메인을 빌드 타임에 박을 필요가 없어졌다**
(도메인이 바뀌어도 재빌드가 불필요). 브라우저에서 원격 3장은 raw URL, 로컬 배경 5장은
`/_next/image`를 지나는 것을 확인했다.

**후행 슬래시 문제** — 2-E에서 FastAPI에 `/scenarios`와 `/scenarios/`를 모두 등록해 307을
피했는데, **Next.js가 rewrite 적용 전에 후행 슬래시를 308로 정규화**한다. 프론트에서
슬래시를 떼는 것으로 해결했다 (`/scenarios?page=..`). FastAPI의 이중 등록은 API 직접 호출을
위해 유지한다.

**제거한 의존성** — `sharp`, `@aws-sdk/client-s3`, `@vercel/analytics`, **`@google/genai`**.
마지막 것은 `scripts/test-gemini.mjs`만 쓰고 있었고 그 스크립트는 이미 은퇴한
`gemini-3-flash-preview`를 참조했다. Gemini 검증은 FastAPI/pytest로 대체돼 스크립트와 함께
제거했다. 프론트엔드 dependencies는 이제 `next`, `react`, `react-dom`, `lucide-react` 4개다.

**⚠️ Phase 4 인수 사항** — DB의 기존 시나리오 1건은 초상화 URL이
`https://cdn.detective.example.com/...`로 박혀 있다. 실제 도메인을 정하면
`PUBLIC_ASSET_BASE_URL`을 바꾸고 그 3개 URL도 갱신해야 한다 (또는 해당 시나리오를 지우고
새로 생성). 신규 생성분은 자동으로 새 도메인을 쓴다.

### Phase 4 — unraid 배포 + NPM 설정 ✅ 완료 (2026-08-25)

- [x] 4.1 unraid **Docker Compose Manager** 플러그인에 스택 등록 (unraid는 swarm 미지원 — 단일 compose)
- [x] 4.2 네트워크 구성 — **단일 user-defined 네트워크 + docker0 포트 바인드** (§0-B)
  ```yaml
  networks:
    todays-detective-net:          # 스택 전체가 이 네트워크 하나만 사용
  ```
  - 4개 서비스 전부 `todays-detective-net`에 연결 (컨테이너명 DNS는 스택 내부에서만 필요)
  - NPM 도달용 포트만 docker0에 바인드:
    - `todays-detective-web`   → `172.17.0.1:3100:3000`
    - `todays-detective-minio` → `172.17.0.1:9100:9000`
  - `todays-detective-api`, `todays-detective-mongo` → **포트 공개 없음**
  - ⚠️ 네트워크에 `internal: true`를 **쓰지 말 것** — api가 Gemini API로 나가는 egress가 막힌다
- [x] 4.3 `.env`를 `/mnt/user/appdata/todays-detective/compose/.env`에 배치, 권한 `600`
  - `WEB_DOMAIN`, `CDN_DOMAIN`, `PUBLIC_ASSET_BASE_URL`, `ALLOWED_ORIGINS` 4곳의 `example.com`을 실제 도메인으로 교체
- [x] 4.3-b 기존 시나리오의 초상화 URL 갱신 (§3-A) — `cdn.detective.example.com` → 실제 도메인.
  대상이 1건 3개 URL뿐이므로 `mongosh` 한 줄로 처리하거나 해당 시나리오를 삭제하고 새로 생성한다
- [x] 4.4 `docker compose up -d` → `docker exec todays-detective-web wget -qO- http://todays-detective-api:8000/healthz`로 내부 연결 확인
- [x] 4.5 포트 공개는 §0-B의 docker0 바인드 2개로 한정. `0.0.0.0` 바인드는 쓰지 않는다
- [x] 4.6 전 서비스 `restart: unless-stopped`, 이미지 태그 **고정** (`latest` 금지 — 재부팅 시 예고 없는 메이저 업그레이드 방지)
- [x] 4.7 백업 구성
  - unraid **CA Appdata Backup** 플러그인에 `todays-detective` 포함
  - `mongodump` 일일 cron (컨테이너 파일 백업만으로는 Mongo 정합성이 보장되지 않는다)

#### §4-A. ⚠️ Next.js rewrite 프록시의 30초 타임아웃 (실제로 터진 문제)

계획은 이 위험을 **NPM 탓으로 지목했지만 틀렸다.** 실제 범인은 Next.js였다.

공개 도메인으로 첫 사건 생성을 시도했을 때 **정확히 30.09초에 HTTP 500**이 났다. 그런데
api 로그를 보니 사건 생성은 **성공**했다 (초상화 3/3, DB 저장 완료). 끊은 쪽은 web이었다:

```
Failed to proxy http://todays-detective-api:8000/api/game/start Error: socket hang up
  code: 'ECONNRESET'
```

원인은 Next의 rewrite 프록시 기본 타임아웃이다:

```js
// next/dist/server/lib/router-utils/proxy-request.js
proxyTimeout: proxyTimeout === null ? undefined : proxyTimeout || 30000
```

사건 생성은 실측 25~31초로 이 경계를 넘나든다. **비용은 지불되고 사용자는 500을 받는**
최악의 실패 모드다.

**해결**: `next.config.ts`에 `experimental.proxyTimeout: 300_000`. 적용 후 공개 도메인 경유
생성이 **HTTP 200 / 25.2초**로 통과했다. 런타임 반영은
`.next/required-server-files.json`의 `config.experimental.proxyTimeout`로 확인한다.

> 체인이 NPM → web(Next) → api 3단이므로 **타임아웃도 3곳을 봐야 한다.**
> Next는 위처럼 해결했고, NPM 쪽 `proxy_read_timeout`은 아래 설정 항목을 참고한다.

#### §4-B. Phase 4 검증 결과

| 항목 | 결과 |
|---|---|
| DNS | `detective`·`cdn`·`mintflavor.ddns.net` 모두 `183.102.97.41` = unraid 공인 IP |
| 라우터 포워딩 | 외부 80/443 → NPM(180/1443) 정상. Let's Encrypt 발급 완료 |
| `https://detective.../` | 200, `Server: openresty` + `X-Powered-By: Next.js` |
| `https://detective.../server/healthz` | 200 — **rewrite 프록시가 외부에서도 동작** |
| `https://cdn.../` (버킷 루트) | **403** — 객체 목록 비공개 |
| 초상화 공개 접근 | 200, 512×512, `Cache-Control: public, max-age=31536000, immutable` 유지 |
| 공개 경유 사건 생성 | **200 / 25.2초** (§4-A 수정 후) |
| 정화본 공개 조회 | 스포일러 누출 0건 |
| 컨테이너 | 4개 running(healthy), `restart: unless-stopped`, 이미지 태그 고정 |
| 공개 포트 | web·minio만 `172.17.0.1`에 바인드. api·mongo는 미공개 |
| Compose Manager | indirect 모드, `autostart=true`, 서비스 5개 인식 |
| mongodump 백업 | 스크립트 + User Scripts 등록(매일 04:30), **복원 리허설 통과** (`solution` 보존 확인) |

**초상화 브라우저 렌더링 — 사용자 확인 완료.** 자동 검증 시점에는 브라우저 패널이 표시되지
않아 뷰포트 높이가 0이었고, next/image의 `loading="lazy"`가 발동하지 않아 DOM `<img>`가
로드되지 않았다 (앱 문제가 아니라 검증 환경 제약). 서빙 자체는 curl 200 / 페이지 내
`fetch()` 200 image/jpeg / `new Image()` 512×512 로드로 확인했고, 실제 브라우저에서
정상 렌더링됨을 사용자가 확인했다. `unoptimized` + `remotePatterns` 미설정 조합이
의도대로 동작한다.

**백업 스크립트 권한 주의** — `/boot`은 vfat이라 `chmod 755`가 먹지 않는다 (`.env`와 동일).
User Scripts 플러그인은 `bash <script>`로 호출하므로 실행 비트가 없어도 동작한다.

#### NPM 설정 (완료 — 사용자가 직접 구성)

**프록시 호스트 2개만 만든다. `api`용 호스트는 만들지 않는다** (§3-3).

**① 웹 — `detective.mintflavor.ddns.net`**

| 탭 | 항목 | 값 |
|---|---|---|
| Details | Domain Names | `detective.mintflavor.ddns.net` |
| Details | Scheme | `http` |
| Details | Forward Hostname | `172.17.0.1` |
| Details | Forward Port | `3100` |
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

**② 이미지 — `cdn.mintflavor.ddns.net`**

| 탭 | 항목 | 값 |
|---|---|---|
| Details | Domain Names | `cdn.mintflavor.ddns.net` |
| Details | Scheme | `http` |
| Details | Forward Hostname | `172.17.0.1` |
| Details | Forward Port | `9100` |
| Details | Block Common Exploits | ✅ |
| SSL | SSL Certificate | Let's Encrypt |
| SSL | Force SSL / HTTP/2 | ✅ |

MinIO는 path-style이므로 최종 이미지 URL은 버킷명이 경로에 포함된다:
`https://cdn.mintflavor.ddns.net/todays-detective/portraits/<uuid>.jpg`
캐시 헤더는 업로드 시 객체에 이미 박히므로 NPM에서 추가 설정할 것이 없다.

**Forward Hostname이 컨테이너명이 아니라 `172.17.0.1`인 이유**: NPM이 기본 `bridge`에 있어 컨테이너명 DNS를 쓸 수 없다. 상세와 대안 검토는 §0-B.

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

> 실제 값은 `.env.unraid`(Phase 0.5 생성, gitignore 대상)에 있다. 배포 시 `/mnt/user/appdata/todays-detective/.env`로 복사한다.
| ~~`NEXT_PUBLIC_API_URL`~~ | | | — | **폐기** (same-origin `/server/*`) |
| ~~`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`~~ | | | — | **폐기** |

---

## 6. 검증 체크리스트

**인프라**
1. `docker compose ps` — 5개 중 4개 running, `todays-detective-minio-init`은 exited(0)
2. `todays-detective-{api,mongo}`가 host에 포트를 열지 않았음 (`docker ps` PORTS 비어 있음)
3. `web`/`minio`의 공개 포트가 `172.17.0.1`에만 바인드됨 — LAN(`192.168.0.21:3100`)에서는 연결 거부
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
| NPM이 기본 bridge에 있어 컨테이너명 미해석 | Forward Hostname 오설정 시 502 | §0-B — `172.17.0.1:3100/9100`으로 지정 |
| `NEXT_PUBLIC_*` 빌드 타임 박힘 | 잘못된 주소가 이미지에 고정 | Phase 3.5로 클라이언트에서 완전 제거 |
| Route Handler가 rewrite를 가림 | `/server/*` 프록시 무동작 | Phase 3.2 순서 준수 (`app/api/game/` 삭제 먼저) |
| array(HDD)에 Mongo 배치 (의도된 결정) | 쓰기 지연. 다만 이 워크로드는 부하가 낮아 실사용 지장은 낮다 | §0-C. 체감 저하 시 `/mnt/cache`로 이전 검토 |
| 단일 서버 = 단일 장애점 | Vercel/Atlas의 가용성 상실 | 감수 (개인 프로젝트). 백업·복원 리허설로 보완 |
| 가정용 회선 IP 변동 | 도메인이 끊김 | DDNS. 문제 지속 시 Cloudflare Tunnel 검토 |
| 데이터 폐기 결정 철회 | 기존 시나리오 복구 불가 | Phase 0.4 보험 사본 + **Phase 6까지 AWS 자원 유지** |

**롤백**: Phase 6 전까지 AWS 자원과 Vercel 배포를 **모두 유지**한다. 문제 발생 시 Vercel 쪽 `NEXT_PUBLIC_API_URL`을 API Gateway로 되돌리면 즉시 구 환경으로 복귀된다. 데이터가 분리돼 있으므로 병합 걱정도 없다.

---

## 8. 작업량 추정

| Phase | 내용 | 예상 |
|---|---|---|
| 0 | 준비 (도메인·네트워크·appdata·시크릿) | 1h |
| ~~1~~ | ~~데이터 계층 부팅 + 검증~~ | ✅ 완료 |
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
