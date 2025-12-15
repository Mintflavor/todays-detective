# Today's Detective API 명세서

이 문서는 **Today's Detective** 프로젝트의 API 명세서입니다.
프론트엔드(Next.js)에서 사용하는 **Client API**와 백엔드(FastAPI)에서 제공하는 **Server API**로 구성됩니다.

---

## 1. Next.js API (Client -> Next.js Server)

클라이언트가 직접 호출하는 Next.js Route Handlers입니다. (`app/api/`)

### 1.1 게임 시작 (Case Generation)
새로운 추리 게임 시나리오를 생성하고 시작합니다.

- **URL:** `/api/game/start`
- **Method:** `POST`
- **Description:** LLM을 이용해 새로운 사건(시나리오)을 생성하고, 캐릭터 이미지를 생성한 후 백엔드에 저장합니다. 클라이언트에는 스포일러가 제거된 데이터를 반환합니다.
- **Request Body:** 없음
- **Response:**
  ```json
  {
    "scenarioId": "string (ObjectId)",
    "caseData": {
      "title": "string",
      "summary": "string",
      "crime_type": "string",
      "full_story": "string",
      "world_setting": "string",
      "suspects": [
        {
          "id": 1,
          "name": "string",
          "age": "string",
          "job": "string",
          "description": "string",
          "personality": "string",
          "portraitImage": "string (Base64)"
          // ... 스포일러 필드(isCulprit, secret 등)는 제외됨
        }
      ],
      "timeline": [ "string" ]
    }
  }
  ```

### 1.2 용의자 심문 (Chat)
특정 용의자와 대화를 나눕니다.

- **URL:** `/api/game/chat`
- **Method:** `POST`
- **Request Body:**
  ```json
  {
    "scenarioId": "string",
    "suspectId": 1,
    "message": "string (사용자 질문)",
    "history": "string (이전 대화 요약 또는 전문)"
  }
  ```
- **Response:**
  ```json
  {
    "reply": "string (용의자의 답변)"
  }
  ```

### 1.3 추리 제출 및 평가 (Evaluate)
범인을 지목하고 추리 내용을 제출하여 게임을 종료하고 결과를 확인합니다.

- **URL:** `/api/game/evaluate`
- **Method:** `POST`
- **Request Body:**
  ```json
  {
    "scenarioId": "string",
    "deductionData": {
      "culpritName": "string",
      "reasoning": "string",
      "isOverTime": boolean
    }
  }
  ```
- **Response:**
  ```json
  {
    "isCorrect": boolean,
    "grade": "string (S, A, B, C, F)",
    "report": "string (탐정 보고서)",
    "advice": "string (조언)",
    "truth": "string (사건의 진상)",
    "culpritName": "string (진범 이름)"
  }
  ```

### 1.4 관리자 인증
관리자 페이지 접근을 위한 비밀번호 확인입니다.

- **URL:** `/api/admin/verify`
- **Method:** `POST`
- **Request Body:**
  ```json
  {
    "password": "string"
  }
  ```
- **Response:**
  ```json
  {
    "success": boolean,
    "message": "string (실패 시)"
  }
  ```

---

## 2. Python Backend API (Next.js Server -> Python Backend)

Next.js 서버가 내부적으로 데이터를 처리하거나 저장하기 위해 호출하는 Backend API입니다.

### 2.1 헬스 체크
서버 상태를 확인합니다.

- **URL:** `/health`
- **Method:** `GET`
- **Response:**
  ```json
  {
    "status": "ok"
  }
  ```

### 2.2 시나리오 생성 (저장)
생성된 게임 시나리오 데이터를 DB에 저장합니다.

- **URL:** `/scenarios/`
- **Method:** `POST`
- **Request Body:**
  ```json
  {
    "title": "string",
    "summary": "string",
    "crime_type": "string",
    "case_data": { ... } // 전체 사건 데이터
  }
  ```
- **Response:**
  ```json
  {
    "_id": "string",
    "title": "string",
    "created_at": "datetime"
    // ...
  }
  ```

### 2.3 시나리오 목록 조회
저장된 시나리오 목록을 페이징하여 조회합니다.

- **URL:** `/scenarios/`
- **Method:** `GET`
- **Query Parameters:**
  - `page`: int (default: 1)
  - `limit`: int (default: 10)
  - `crime_type`: str (optional)
- **Response:** `List[ScenarioResponse]`

### 2.4 시나리오 상세 조회
특정 시나리오의 전체 데이터(정답 포함)를 조회합니다.

- **URL:** `/scenarios/{id}`
- **Method:** `GET`
- **Response:** `ScenarioDetail` (전체 `case_data` 포함)

### 2.5 시나리오 삭제
특정 시나리오를 삭제합니다.

- **URL:** `/scenarios/{id}`
- **Method:** `DELETE`
- **Response:**
  ```json
  {
    "message": "Scenario deleted successfully"
  }
  ```
