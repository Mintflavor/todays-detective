# Python 백엔드 → AWS Lambda 네이티브 마이그레이션 플랜

> ⚠️ **과거 이력 문서 — 현행 아님.**
> AWS 이전 작업 로그.
>
> 현재 구조는 [unraid_migration_plan.md](unraid_migration_plan.md)와
> 레포 루트의 [CLAUDE.md](../CLAUDE.md)를 본다.

## Context

현재 FastAPI 백엔드(포트 8001)는 Docker 또는 로컬 uvicorn으로 상시 실행해야 한다.
Lambda 네이티브 리팩터를 통해 서버리스로 전환하면 서버를 항상 켜둘 필요 없이 요청이 있을 때만 실행되며,
EC2/ECS 비용 없이 MongoDB Atlas와 연동하는 서버리스 CRUD API를 구성할 수 있다.

**현재 백엔드가 제공하는 엔드포인트 (모두 유지 필요)**

| Method | Path | 호출 위치 |
|---|---|---|
| POST | /scenarios/ | `app/api/game/start/route.ts` |
| GET | /scenarios/ | `app/lib/api.ts` (LoadScenarioScreen, AdminScreen) |
| GET | /scenarios/{id} | `app/api/game/chat/route.ts`, `app/api/game/evaluate/route.ts`, `app/lib/api.ts` |
| DELETE | /scenarios/{id} | `app/lib/api.ts` (AdminScreen) |

---

## 변경 범위

### 제거
- `backend/` 폴더 전체 (FastAPI, uvicorn, Motor, Pydantic, Dockerfile)
- `docker-compose.yml` (전체 삭제 — backend 서비스만 있었으므로)

### 신규 생성
```
lambda/
├── requirements.txt          # pymongo, python-dotenv
└── handler.py                # Lambda 핸들러 + 4개 엔드포인트 라우팅
```

### 프론트엔드 변경
- `.env`: `NEXT_PUBLIC_API_URL` → API Gateway 엔드포인트 URL
- `next.config.ts`, `app/lib/api.ts`, `app/api/game/*.ts` — **변경 없음**

---

## 상세 구현 계획

### STEP 1 — `lambda/requirements.txt`

FastAPI, uvicorn, Motor, Pydantic 모두 제거. 패키지 용량 ~31MB → ~5MB 수준으로 감소.

```
pymongo==4.8.0
python-dotenv==1.0.1
```

### STEP 2 — `lambda/handler.py` 작성

FastAPI 없이 API Gateway event를 직접 파싱하는 순수 Python 핸들러.

```python
import json, os
from datetime import datetime, timezone
from pymongo import MongoClient
from bson import ObjectId

_client = None  # 컨테이너 재사용 시 재연결 방지

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Content-Type": "application/json",
}

def get_collection():
    global _client
    if _client is None:
        _client = MongoClient(
            os.environ["MONGODB_URL"],
            serverSelectionTimeoutMS=5000
        )
    return _client["todays_detective"]["scenario_collection"]

def response(status, body):
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps(body, default=str)}

def handler(event, context):
    # API Gateway HTTP API (v2) vs REST API (v1) 통합 대응
    method = (event.get("httpMethod")
              or event.get("requestContext", {}).get("http", {}).get("method", ""))
    path   = event.get("path") or event.get("rawPath", "")
    body   = json.loads(event.get("body") or "{}")
    params = event.get("queryStringParameters") or {}

    # OPTIONS preflight
    if method == "OPTIONS":
        return response(200, {})

    col = get_collection()

    # POST /scenarios/
    if method == "POST" and path.rstrip("/") == "/scenarios":
        doc = {
            "title":      body.get("title", ""),
            "summary":    body.get("summary", ""),
            "crime_type": body.get("crime_type", "Unknown"),
            "case_data":  body.get("case_data", {}),
            "created_at": datetime.now(timezone.utc),
        }
        result = col.insert_one(doc)
        return response(201, {"_id": str(result.inserted_id)})

    # GET /scenarios/  (페이지네이션 + crime_type 필터)
    elif method == "GET" and path.rstrip("/") == "/scenarios":
        page  = max(int(params.get("page", 1)), 1)
        limit = min(max(int(params.get("limit", 10)), 1), 50)
        filt  = {}
        if params.get("crime_type"):
            filt["crime_type"] = params["crime_type"]
        skip = (page - 1) * limit
        docs = list(col.find(filt, {"case_data": 0})
                       .sort("created_at", -1).skip(skip).limit(limit))
        for d in docs:
            d["_id"] = str(d["_id"])
        return response(200, docs)

    # GET /scenarios/{id}
    elif method == "GET" and path.startswith("/scenarios/"):
        sid = path.split("/")[-1]
        try:
            doc = col.find_one({"_id": ObjectId(sid)})
        except Exception:
            return response(400, {"detail": "Invalid id"})
        if not doc:
            return response(404, {"detail": "Not found"})
        doc["_id"] = str(doc["_id"])
        return response(200, doc)

    # DELETE /scenarios/{id}
    elif method == "DELETE" and path.startswith("/scenarios/"):
        sid = path.split("/")[-1]
        try:
            result = col.delete_one({"_id": ObjectId(sid)})
        except Exception:
            return response(400, {"detail": "Invalid id"})
        if result.deleted_count == 0:
            return response(404, {"detail": "Not found"})
        return response(200, {"deleted": sid})

    return response(404, {"detail": "Not found"})
```

### STEP 3 — AWS 콘솔 사전 작업 (코드 배포 전)

1. **IAM 역할 생성**
   - 이름: `todays-detective-lambda-role`
   - 정책: `AWSLambdaBasicExecutionRole` (CloudWatch Logs 쓰기)

2. **Lambda 함수 생성**
   - 런타임: Python 3.12
   - 핸들러: `handler.handler`
   - 메모리: 256MB / 타임아웃: 30초
   - 환경변수: `MONGODB_URL` = Atlas 연결 문자열

3. **API Gateway HTTP API 생성**
   - Type: HTTP API (REST API보다 ~60% 저렴)
   - Integration: Lambda 함수 `todays-detective-api`
   - Route: `$default` (모든 메서드 + 경로 → Lambda)
   - CORS: Allow origins `*`, methods `*`, headers `content-type`
   - Stage: `prod` → 엔드포인트 URL 획득

### STEP 4 — 코드 패키징 및 Lambda 배포

```bash
cd lambda
pip install -r requirements.txt -t package/
cp handler.py package/
cd package && zip -r ../function.zip . && cd ..

# 최초 배포
aws lambda update-function-code \
  --function-name todays-detective-api \
  --zip-file fileb://function.zip
```

### STEP 5 — 프론트엔드 환경변수 업데이트

`.env` 한 줄만 변경 (나머지 코드 변경 없음):
```
NEXT_PUBLIC_API_URL=https://<api-id>.execute-api.ap-northeast-2.amazonaws.com
```

### STEP 6 — backend/ 폴더 및 docker-compose.yml 삭제

```bash
rm -rf backend/
rm docker-compose.yml
```

---

## 파일 수정 목록

| 파일 | 변경 내용 |
|---|---|
| `lambda/handler.py` (**신규**) | Lambda 핸들러 + 4개 엔드포인트 구현 |
| `lambda/requirements.txt` (**신규**) | pymongo, python-dotenv |
| `.env` | `NEXT_PUBLIC_API_URL` → API Gateway URL |
| `backend/` | **삭제** |
| `docker-compose.yml` | **삭제** |

---

## 사전 필요 작업 (AWS 콘솔 — 코드 작업 전 필요)

| 항목 | 내용 |
|---|---|
| IAM Role | `todays-detective-lambda-role` + `AWSLambdaBasicExecutionRole` |
| Lambda 함수 | `todays-detective-api`, Python 3.12, 256MB, 30초 |
| API Gateway | HTTP API, `$default` route → Lambda, CORS `*` |
| Atlas IP | `0.0.0.0/0` 허용 (이미 완료 상태) |

---

## 검증 계획

### 1 — Lambda 콘솔 테스트
AWS Lambda 콘솔 → Test 탭에서 아래 이벤트로 각 엔드포인트 직접 검증:

```json
// GET /scenarios/
{"httpMethod": "GET", "path": "/scenarios/", "queryStringParameters": {}}

// POST /scenarios/
{"httpMethod": "POST", "path": "/scenarios/", "body": "{\"title\":\"test\",\"summary\":\"s\",\"crime_type\":\"절도\",\"case_data\":{}}"}

// GET /scenarios/{id}  (위 POST 응답의 _id 사용)
{"httpMethod": "GET", "path": "/scenarios/<id>", "queryStringParameters": null}

// DELETE /scenarios/{id}
{"httpMethod": "DELETE", "path": "/scenarios/<id>", "queryStringParameters": null}
```

### 2 — curl E2E (API Gateway → Lambda → Atlas)
```bash
BASE=https://<api-id>.execute-api.ap-northeast-2.amazonaws.com

# 생성
curl -X POST $BASE/scenarios/ -H "Content-Type: application/json" \
  -d '{"title":"t","summary":"s","crime_type":"절도","case_data":{}}'
# → {"_id": "..."}

# 목록 조회
curl $BASE/scenarios/

# 상세 조회
curl $BASE/scenarios/<id>

# 삭제
curl -X DELETE $BASE/scenarios/<id>
```

### 3 — 게임 전체 플로우
- `NEXT_PUBLIC_API_URL`을 API Gateway URL로 설정 후 `npm run dev`
- 브라우저에서 "오늘의 사건 맡기" → 브리핑 → 수사 → 추리 → 결과 전체 통과 확인

---

## 리스크 및 주의사항

- **콜드 스타트**: 최초 실행 시 200~500ms 지연. 시나리오 생성(30초 이상)에 비해 무시 가능한 수준.
- **MongoDB 연결 끊김**: 컨테이너 장시간 미사용 후 Atlas TCP 연결이 끊길 수 있음. `serverSelectionTimeoutMS=5000` 설정으로 빠른 재연결 시도.
- **API Gateway payload 버전**: HTTP API는 payload format v2.0(`requestContext.http.method`), REST API는 v1.0(`httpMethod`). handler에서 두 버전 모두 대응하는 분기 포함.
- **backend/ 삭제**: `docker-compose up` 불가. 로컬 개발 시 `python -c "from lambda.handler import handler; print(handler({...}, {}))"` 또는 AWS SAM 활용.
