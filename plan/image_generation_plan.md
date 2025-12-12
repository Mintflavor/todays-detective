# 🎨 프로젝트: 용의자 초상화 생성 및 표시 시스템 구현 계획 (Revised)

## 1. 개요 (Overview)
'오늘의 탐정' 게임의 몰입도를 높이기 위해, 사건 생성 시 **Google Imagen 4 Fast (imagen-4.0-fast-generate-001)** 모델을 활용하여 용의자 3명의 초상화를 생성합니다. "한국 만화(웹툰) 스타일"의 흑백 일러스트로 생성된 이미지는 게임 내에서 256px 크기로 표시되며, 사건 데이터와 함께 서버에 저장됩니다. 기존 데이터와의 호환성을 위해 이미지가 없는 경우 기본 아이콘을 사용합니다.

## 2. 목표 (Goals)
1.  **빠른 고품질 AI 이미지 생성:** `imagen-4.0-fast-generate-001` 모델을 사용하여 대기 시간을 최소화하면서 고품질 흑백 만화 스타일 초상화를 생성합니다. (해상도: 1024x1024px)
2.  **정교한 페르소나 반영:** 용의자의 성별, 나이, 직업, 성격을 반영한 프롬프트를 자동 생성하여 캐릭터의 개성을 살립니다.
3.  **하위 호환성 (Backward Compatibility):** 초상화 데이터가 없는 기존 시나리오에서는 기존의 `<User />` 아이콘을 그대로 표시합니다.
4.  **최적화된 표시:** 생성은 1K 해상도로 하되, 웹 페이지에서는 512x512px로 축소 표시하여 UI 통일성을 유지합니다.

## 3. 기술 스택 및 모델 (Tech Stack & Models)
*   **Prompt Generation:** Google Gemini (Text Model)
*   **Image Generation:** **imagen-4.0-fast-generate-001** (via Google AI Studio API)
    *   *Reference:* [Imagen 4 Documentation](https://ai.google.dev/gemini-api/docs/imagen#imagen-4)
*   **Storage:** MongoDB (Base64 문자열 저장)
*   **Frontend:** Next.js (`<Image />` 컴포넌트 활용)

## 4. 상세 구현 단계 (Implementation Steps)

### 1단계: 백엔드/데이터 구조 업데이트
*   **파일:** `app/types/game.ts`
*   **내용:** `Suspect` 인터페이스에 `gender`, `age`, `portraitImage` 필드 추가.
    *   *주의:* 기존 데이터와의 호환성을 위해 모든 새 필드는 **Optional (`?`)** 로 선언합니다.
    ```typescript
    export interface Suspect {
      id: number;
      name: string;
      role: string;
      gender?: 'Male' | 'Female' | 'Unknown'; // Optional, Fallback to 'Unknown'
      age?: number; // Optional, Fallback logic needed in UI
      // ... 기존 필드
      portraitImage?: string; // Base64 string (Optional)
    }
    ```

### 2단계: 프롬프트 엔지니어링 (Gemini Text Model)
*   **파일:** `app/api/game/lib/prompts.ts`
*   **내용:** 이미지 생성용 프롬프트 생성 로직 추가.
*   **스타일 가이드 (Common Prompt):**
    > "Grayscale Korean manhwa style illustration, clean digital linework, webtoon aesthetic, monochromatic shading with screentones, expressive character design, front-facing gaze, white background, high quality character portrait, **solo portrait, only one person, single character**."
*   **개별 프롬프트 조합:**
    *   `[Common Prompt]`, `[Age] year old [Gender] [Role]`, `[Personality] expression`, `[Appearance details]`

### 3단계: 이미지 생성 API 연동 (Imagen 4 Fast)
*   **파일:** `app/api/game/start/route.ts`
*   **사전 준비:** `npm install sharp` (이미지 리사이징 라이브러리)
*   **로직:**
    1.  Gemini Text 모델로 시나리오(`CaseData`) 생성 (성별 포함).
    2.  각 용의자에 대한 영문 프롬프트 구성.
    3.  `imagen-4.0-fast-generate-001` 모델 호출 (병렬 처리 권장, 1024x1024 생성).
    4.  **이미지 리사이징 (Optimization):**
        *   생성된 고해상도 이미지를 `sharp` 라이브러리를 사용하여 **512x512px**로 축소.
        *   포맷을 `WebP` 또는 `JPEG` (Quality 80)로 변환하여 용량 최적화.
    5.  리사이징된 이미지 데이터(Base64)를 `CaseData`에 저장.
    6.  DB 저장 및 클라이언트 응답.

### 4단계: UI 컴포넌트 수정
*   **대상:** `BriefingScreen`, `InvestigationScreen`, `DeductionScreen`, `ResolutionScreen`.
*   **로직:**
    ```tsx
    {suspect.portraitImage ? (
      <Image 
        src={`data:image/jpeg;base64,${suspect.portraitImage}`} 
        width={512} 
        height={512} 
        alt={suspect.name} 
        className="rounded-full object-cover" // 스타일링
      />
    ) : (
      <User size={size} /> // 기존 아이콘 (Fallback)
    )}
    ```

## 5. 예상되는 도전 과제 및 해결 방안
1.  **API 응답 속도:** 이미지 3장 생성 시 지연 발생 가능.
    *   *해결:* `Promise.all`로 병렬 요청 처리. 로딩 텍스트에 "용의자 몽타주 스케치 중..." 추가. `imagen-4.0-fast-generate-001`은 속도가 빠르므로 지연이 크게 개선될 것으로 예상됨.
2.  **프롬프트 정확도:** 한글 이름/설정을 영문 프롬프트로 변환 필요.
    *   *해결:* Gemini에게 시나리오 생성 시 용의자의 외모 묘사(영문)를 함께 생성해달라고 요청하거나, 별도 번역 단계를 거침. (비용 절감을 위해 시나리오 생성 시 `image_prompt_keywords` 필드를 같이 받는 것이 효율적)

## 6. 일정 (Timeline)
*   **Day 1:** 데이터 구조 변경 및 시나리오 생성 프롬프트 수정(성별/외모 키워드 추가).
*   **Day 2:** `imagen-4.0-fast-generate-001` API 연동 및 이미지 생성 로직 구현.
*   **Day 3:** UI 적용 및 하위 호환성 테스트.
