## 🕵️‍♂️ 프로젝트: 시크릿 아카이브 (관리자 모드) 구현 계획

### 1. 개요 (Overview)
게임 내 숨겨진 커맨드를 통해 접근 가능한 **[관리자 보안 구역]**을 구현합니다. 이 기능은 개발자 또는 관리자가 생성된 시나리오 데이터를 관리(삭제)하기 위한 목적으로 사용됩니다. UI/UX는 게임의 세계관을 해치지 않도록 '기밀 문서 보관소' 컨셉을 유지합니다.

### 2. 백엔드 개발 (Backend)
**목표:** 시나리오 영구 삭제를 위한 API 엔드포인트 구축
*   **파일:** `backend/routes/scenarios.py`
*   **기능:**
    *   HTTP Method: `DELETE`
    *   Path: `/scenarios/{id}`
    *   로직: MongoDB `ObjectId`를 수신하여 해당 문서를 컬렉션에서 영구 삭제.
    *   예외 처리: 유효하지 않은 ID 포맷 또는 존재하지 않는 문서 요청 시 적절한 HTTP 에러 반환.

### 3. 프론트엔드 API (Frontend API)
**목표:** 백엔드와 통신하는 클라이언트 로직 추가
*   **파일:** `app/lib/api.ts`
*   **기능:**
    *   `deleteScenario(id: string)`: `fetch` API를 사용하여 삭제 요청 전송.
    *   네트워크 오류 및 서버 에러 핸들링.

### 4. UI/UX 디자인 (Admin UI)
**목표:** 느와르 테마가 적용된 관리자 전용 인터페이스 구현
*   **컴포넌트:** `app/components/AdminScreen.tsx`
*   **디자인 컨셉: "The Burn Bag (소각장)"**
    *   **분위기:** 어둡고 무거운 정보기관의 서류 보관실 느낌.
    *   **리스트 뷰:** 기존 `LoadScenarioScreen`의 레이아웃을 재사용하되, 더 사무적이고 딱딱한 폰트/색상 사용.
    *   **삭제 액션:**
        *   버튼 텍스트: "삭제" 대신 **"기록 말소(Expunge)"** 또는 **"소각(Burn)"**.
        *   인터랙션: 삭제 시 붉은색 취소선이 그어지거나 종이가 타는 듯한 시각적 피드백(가능한 경우) 또는 붉은색 경고 모달.
    *   **나가기:** "보안 구역 이탈" 버튼.

### 5. 히든 커맨드 로직 및 인증 (Secret Logic & Auth)
**목표:** 보안 커맨드 감지 및 2차 인증 시스템 구축
*   **훅(Hook):** `app/hooks/useSecretCommand.ts`
*   **알고리즘:**
    *   사용자의 키보드 입력을 실시간으로 감지.
    *   **[비공개 커맨드 패턴]** 일치 시 인증 모달 활성화.
*   **인증 절차 (New):**
    *   **환경 변수:** `ADMIN_PASSWORD` (서버 사이드 환경 변수)
    *   **API Route:** `app/api/admin/verify/route.ts` (POST, 비밀번호 검증)
    *   **UI:** `app/components/AdminAuthModal.tsx` (느와르 풍 비밀번호 입력창)
    *   사용자가 입력한 비밀번호를 API로 전송하여 검증 성공 시 관리자 모드 진입.

### 6. 통합 (Integration)
**목표:** 게임 루프에 관리자 모드 및 인증 절차 탑재
*   **파일:** `app/page.tsx`
*   **흐름:**
    1.  `phase === 'intro'` 상태일 때 커맨드 리스너 활성화.
    2.  커맨드 발동 시 `showAdminAuth` 상태를 `true`로 전환 (비밀번호 모달 표시).
    3.  비밀번호 인증 성공 시 `showAdminAuth` `false`, `isAdminMode` `true`로 전환.
    4.  `AdminScreen` 렌더링.
    5.  관리자 모드 종료 시 다시 `IntroScreen`으로 복귀.

---
### ⚠️ 주의사항
*   현재 백엔드 서버가 로컬이 아닌 외부 주소(`mintflavor.ddns.net`)를 바라보고 있습니다.
*   **중요:** 이 기능을 실제로 사용하려면 외부 서버의 백엔드 코드에도 `DELETE` 엔드포인트가 배포되어야 합니다. 로컬에서 코드만 수정해서는 외부 DB를 제어할 수 없습니다. (혹은 로컬 테스트 시 `next.config.ts`의 프록시를 잠시 로컬로 돌려야 합니다.)
