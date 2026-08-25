# 🔒 프로젝트: 스포일러 방지 서버 사이드 아키텍처 전환 계획 (Project Anti-Spoiler) [완료]

> ⚠️ **과거 이력 문서 — 현행 아님.**
> 초기 보안 설계 메모다. 실제 적용된 인증 구조는 계획 문서의 §5-B를 참조한다.
>
> 현재 구조는 [unraid_migration_plan.md](unraid_migration_plan.md)와
> 레포 루트의 [CLAUDE.md](../CLAUDE.md)를 본다.

## 1. 개요 (Overview)
클라이언트가 사건의 정답(범인, 트릭)을 직접 수신하지 않도록 아키텍처를 개편하여 보안성을 강화했습니다.

**상태:** ✅ 아키텍처 전환 완료 (2025-12-10)

## 2. 목표 (Goals)
1.  **데이터 은닉:** 클라이언트는 `scenarioId`와 공개된 개요만 수신하며, 정답 데이터는 서버(DB)에만 존재.
2.  **게임 로직 이관:** 심문 및 평가 로직을 Next.js API Routes에서 처리.
3.  **투명한 경험 유지:** 사용자 경험 변경 없음.

## 3. 구현된 아키텍처 (Architecture)

### 데이터 흐름
*   **Client:** 생성 요청 -> **Next.js API** -> Gemini -> **Python Backend(DB 저장)** -> Client (`scenarioId`, `intro` 데이터만 수신).
*   **Interrogation:** Client (`scenarioId`, `question`) -> **Next.js API** (DB 조회: 정답 포함) -> Gemini (System Prompt: 정답 기반) -> Client (답변).
*   **Evaluation:** Client (`scenarioId`, `deduction`) -> **Next.js API** (DB 조회: 정답 비교) -> Gemini (채점) -> Client (결과).

## 4. 상세 구현 결과 (Implementation Results)

### Next.js API Routes (Server-Side Logic)
*   `app/api/game/start/route.ts`: 사건 생성, 백엔드 저장, 민감 데이터 제거 후 반환. ✅
*   `app/api/game/chat/route.ts`: DB에서 전체 데이터를 조회하여 용의자 페르소나 및 알리바이 프롬프트 조립. ✅
*   `app/api/game/evaluate/route.ts`: DB에서 정답을 조회하여 사용자 추리 채점. ✅

### Client Hook Update
*   `app/hooks/useGeminiClient.ts`: 새로운 보안 API 엔드포인트(`/api/game/*`)를 호출하도록 전면 수정. ✅

### Environment Configuration
*   `NEXT_PUBLIC_API_URL`을 통해 백엔드(Python)와의 통신 주소 관리. ✅

## 5. 결론
본 계획에 따른 모든 보안 아키텍처 변경 사항이 적용되었으며, 이제 클라이언트 브라우저에서 개발자 도구를 열어도 범인이나 트릭을 미리 알 수 없습니다.