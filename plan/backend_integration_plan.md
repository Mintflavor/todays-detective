# 백엔드 통합 및 시나리오 저장 시스템 구축 계획 [완료]

## 1. 목표
**Python (FastAPI)**와 **MongoDB**를 사용하여 게임 시나리오의 영구 저장소를 구축합니다. 모든 백엔드 서비스(API 서버, DB)는 **Docker Container** 환경에서 실행됩니다. 이를 통해 플레이어는 생성된 추리 시나리오를 저장하고, 나중에 '사건 기록실' 컨셉의 UI를 통해 다시 불러와 플레이할 수 있습니다.

**상태:** ✅ 전체 구현 완료

## 2. 기술 스택
- **Database:** MongoDB (Docker Container)
- **Backend:** Python 3.11 + FastAPI (Docker Container)
- **Frontend:** Next.js (기존)
- **Infrastructure:** Docker & Docker Compose

## 3. 시스템 아키텍처
```mermaid
[User] <-> [Next.js Frontend (Host)]
                  |
                  v (API Calls via Proxy/Env)
          [Docker Network]
          |-----------------------------|
          | [Python FastAPI Container]  | <--> [MongoDB Container]
          | (Port: 8000)                |      (Port: 27017)
          |-----------------------------|
```

## 4. 구현 단계

### 1단계: 인프라 설정 (Docker)
*   `backend/Dockerfile`, `docker-compose.yml` 작성 및 실행 확인 완료.
*   **상태:** ✅ 완료

### 2단계: 백엔드 API 개발
*   `backend/main.py`, `backend/routes/scenarios.py` 구현 완료.
*   주요 API: 생성(`POST`), 목록 조회(`GET`), 상세 조회(`GET`), 삭제(`DELETE`).
*   **상태:** ✅ 완료

### 3단계: 프론트엔드 UI 확장
*   `IntroScreen`: "새로운 사건 의뢰" / "지난 사건 기록" 분기 처리 완료.
*   `LoadScenarioScreen`: 사건 리스트 및 불러오기 UI 구현 완료.
*   **상태:** ✅ 완료

### 4단계: 연동 및 테스트
*   `app/lib/api.ts`를 통한 통신 구현 완료.
*   `NEXT_PUBLIC_API_URL` 환경 변수 적용으로 로컬/외부 서버 유연하게 대응.
*   **상태:** ✅ 완료

## 5. 데이터 구조 (MongoDB Document 예시)
```json
{
  "_id": "ObjectId(...)",
  "created_at": "...",
  "title": "...",
  "summary": "...",
  "crime_type": "...",
  "case_data": { ... }
}
```
