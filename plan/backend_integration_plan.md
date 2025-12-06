# 백엔드 통합 및 시나리오 저장 시스템 구축 계획

## 1. 목표
**Python (FastAPI)**와 **MongoDB**를 사용하여 게임 시나리오의 영구 저장소를 구축합니다. 모든 백엔드 서비스(API 서버, DB)는 **Docker Container** 환경에서 실행됩니다. 이를 통해 플레이어는 생성된 추리 시나리오를 저장하고, 나중에 '사건 기록실' 컨셉의 UI를 통해 다시 불러와 플레이할 수 있습니다.

## 2. 기술 스택
- **Database:** MongoDB (Docker Container) - 유동적인 JSON `CaseData` 저장에 최적화.
- **Backend:** Python 3.11 + FastAPI (Docker Container) - 고성능 비동기 API 서버.
- **Frontend:** Next.js (기존) - Axios를 사용해 백엔드와 통신.
- **Infrastructure:** Docker & Docker Compose - 원클릭 실행 환경 구성.

## 3. 시스템 아키텍처
```mermaid
[User] <-> [Next.js Frontend (Host)]
                  |
                  v (API Calls)
          [Docker Network]
          |-----------------------------|
          | [Python FastAPI Container]  | <--> [MongoDB Container]
          | (Port: 8000)                |      (Port: 27017)
          |-----------------------------|
```

## 4. 구현 단계

### 1단계: 인프라 설정 (Docker)
1.  **프로젝트 구조:** 루트 디렉토리에 `backend` 폴더 생성.
2.  **Dockerfile:** FastAPI 서버를 위한 Docker 이미지 정의.
3.  **docker-compose.yml:** MongoDB와 FastAPI 컨테이너를 정의하고 네트워크 및 볼륨(데이터 보존용) 설정.

### 2단계: 백엔드 API 개발
1.  **FastAPI 앱:** `backend/main.py`에 기본 앱 생성.
2.  **데이터 모델:** Pydantic을 사용하여 `CaseData` 데이터 검증 모델 정의.
3.  **API 엔드포인트:**
    *   `POST /scenarios`: 생성된 시나리오 저장.
    *   `GET /scenarios`: 시나리오 목록 조회 (제목, 요약, 날짜) - 페이지네이션 (10개 단위).
    *   `GET /scenarios/{id}`: 특정 시나리오의 전체 데이터 조회.
4.  **DB 연동:** `motor` 라이브러리를 사용하여 MongoDB와 비동기 통신.

### 3단계: 프론트엔드 UI 확장
1.  **IntroScreen 수정:**
    *   기존 단일 시작 버튼을 두 개의 옵션으로 분리:
        *   "새로운 사건 의뢰 (New Case)"
        *   "지난 사건 기록 (Load Case)"
2.  **사건 기록실 (LoadScenarioScreen.tsx) 구현:**
    *   **디자인 컨셉:** 오래된 서류 보관소 (File Cabinet).
    *   **리스트 뷰:** 각 시나리오를 '사건 파일' 아이콘과 함께 리스트로 표시.
    *   **페이지네이션:** 하단에 이전/다음 페이지 버튼 배치.
    *   **상호작용:** 항목 클릭 시 상세 내용 미리보기 또는 바로 게임 시작.
3.  **저장 로직:**
    *   `useGeminiClient`에서 사건 생성 완료 시 자동으로 백엔드에 저장 요청 전송.

### 4단계: 연동 및 테스트
1.  **API 클라이언트:** `app/lib/api.ts` 작성 (백엔드 통신 전담).
2.  **통합 테스트:**
    *   `docker-compose up`으로 백엔드 실행.
    *   게임 실행 -> 시나리오 생성 -> DB 저장 확인.
    *   메인 화면 -> 불러오기 -> 리스트 출력 및 게임 로드 확인.

## 5. 데이터 구조 (MongoDB Document 예시)
```json
{
  "_id": "ObjectId(...)",
  "created_at": "2025-12-06T12:00:00",
  "title": "빗속의 방문자",
  "summary": "폭우가 쏟아지는 산장에서 발생한 의문의 살인 사건...",
  "crime_type": "살인",
  "case_data": { ...전체 CaseData 객체... }
}
```

## 6. UI/UX 가이드라인
- **색상 팔레트:** 기존의 느와르 테마 유지 (Dark Gray, Amber, Paper White).
- **분위기:** '디지털' 느낌보다는 '아날로그 수사 기록' 느낌 강조.
- **반응형:** 모바일에서도 리스트 터치가 용이하도록 충분한 간격 확보.