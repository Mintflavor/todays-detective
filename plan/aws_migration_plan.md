# AWS S3 + MongoDB Atlas 마이그레이션 계획

> ⚠️ **과거 이력 문서 — 현행 아님.**
> AWS S3 + MongoDB Atlas로 이전할 때의 계획이다. **현재 구조가 아니다** — S3는 MinIO로, Atlas는 자체 호스팅 MongoDB로 다시 이전했다.
>
> 현재 구조는 [unraid_migration_plan.md](unraid_migration_plan.md)와
> 레포 루트의 [CLAUDE.md](../CLAUDE.md)를 본다.

## Context

현재 용의자 초상화 이미지가 Base64 문자열로 MongoDB의 `case_data.suspects[].portraitImage` 필드에 인라인 저장된다. 이로 인해 시나리오 1건당 MongoDB 문서 크기가 이미지 3장(각 약 50~100KB Base64) 때문에 불필요하게 커지고, 네트워크 응답도 느려진다.

마이그레이션 목표:
- **이미지**: MongoDB Base64 → AWS S3 (퍼블릭 URL로 교체)
- **MongoDB**: 로컬/Docker MongoDB → MongoDB Atlas (AWS 관리형)
- **기존 데이터**: 신규 생성분부터 적용 (기존 시나리오는 그대로 유지, 렌더링 시 하위 호환)

---

## 사전 확인 사항 (완료 상태)

| 항목 | 상태 |
|---|---|
| S3 버킷 `todays-detective` (ap-northeast-2) | 완료 |
| IAM 사용자 `todays-detective-uploader` + Access Key 발급 | 완료 |
| MongoDB Atlas 클러스터 + DB 사용자 `detective-app` | 완료 |
| `.env`에 AWS/MongoDB 변수 등록 (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`, `MONGODB_URL`) | 완료 |

---

## 변경 범위

### 이미지: MongoDB Base64 → S3 URL

**현재 흐름**
```
Gemini Imagen → base64 → sharp 리사이징 → base64 → MongoDB portraitImage 필드
```

**변경 후 흐름**
```
Gemini Imagen → base64 → sharp 리사이징 → S3 업로드 → S3 URL → MongoDB portraitImage 필드
```

변경 포인트:
- `suspect.portraitImage`에 저장되는 값: Base64 문자열 → S3 HTTPS URL
- `evaluation.culpritImage`는 `realCulprit?.portraitImage`에서 복사되는 값이므로 자동 전환
- 프론트엔드 렌더링: `data:image/jpeg;base64,...` → 일반 URL (조건부 분기로 기존 Base64 데이터 하위 호환 유지)

### MongoDB: 로컬 → Atlas

- `backend/database.py`의 `MONGODB_URL` 환경변수를 Atlas 연결 문자열로 교체
- 코드 변경 없음, 환경변수만 교체
- `docker-compose.yml`의 로컬 MongoDB 서비스 제거

---

## 수정 파일 목록

| 파일 | 변경 내용 |
|---|---|
| `package.json` | `@aws-sdk/client-s3` 패키지 추가 |
| `app/api/game/lib/s3.ts` (신규) | S3 업로드 유틸 함수 |
| `app/api/game/start/route.ts` | 이미지 저장 로직: base64 저장 → S3 업로드 후 URL 저장 |
| `app/components/BriefingScreen.tsx` | 이미지 렌더링: base64 Data URI → URL 조건부 처리 |
| `app/components/DeductionScreen.tsx` | 동일한 이미지 렌더링 변경 |
| `app/components/ResolutionScreen.tsx` | 동일한 이미지 렌더링 변경 (2곳: culpritImage + 브리핑 모달) |
| `next.config.ts` | S3 도메인을 `images.remotePatterns`에 추가 |
| `docker-compose.yml` | 로컬 MongoDB 서비스 제거, `MONGODB_URL`을 `.env`에서 주입 |

---

## 상세 구현 계획

### STEP 1 — `@aws-sdk/client-s3` 패키지 설치

```bash
npm install @aws-sdk/client-s3
```

### STEP 2 — S3 업로드 유틸 작성 (`app/api/game/lib/s3.ts`)

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const REGION = process.env.AWS_REGION!;
const BUCKET = process.env.S3_BUCKET_NAME!;

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function uploadPortraitToS3(buffer: Buffer): Promise<string> {
  const key = `portraits/${crypto.randomUUID()}.jpg`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}
```

### STEP 3 — `app/api/game/start/route.ts` 수정

```typescript
// 기존
suspect.portraitImage = resizedBuffer.toString('base64');

// 변경 후
suspect.portraitImage = await uploadPortraitToS3(resizedBuffer);
```

상단에 `import { uploadPortraitToS3 } from '../lib/s3';` 추가.

### STEP 4 — 프론트엔드 이미지 렌더링 변경

변경 방식 (기존 base64 데이터와의 하위 호환 유지):
```tsx
// 변경 전
src={`data:image/jpeg;base64,${s.portraitImage}`}

// 변경 후
src={s.portraitImage.startsWith('http') ? s.portraitImage : `data:image/jpeg;base64,${s.portraitImage}`}
```

변경 지점:
- `app/components/BriefingScreen.tsx` (용의자 목록)
- `app/components/DeductionScreen.tsx` (용의자 선택 그리드)
- `app/components/ResolutionScreen.tsx` (범인 폴라로이드 + 브리핑 모달 내부)

### STEP 5 — `next.config.ts`에 S3 도메인 허용

```typescript
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'todays-detective.s3.ap-northeast-2.amazonaws.com',
      },
    ],
  },
  async rewrites() { /* 기존 유지 */ },
};
```

### STEP 6 — `docker-compose.yml` Atlas 전환

로컬 MongoDB 컨테이너 제거, 백엔드 `MONGODB_URL`을 `.env`에서 주입.

---

## 검증 방법

### 1. 설치 및 기동
1. `npm install` → `@aws-sdk/client-s3` 설치 확인
2. `npm run dev` → Next.js 에러 없이 기동

### 2. 신규 시나리오 생성 E2E
3. 브라우저 → 인트로 → "오늘의 사건 맡기" → 브리핑 화면 진입
4. 브리핑 화면에서 용의자 3명 초상화 정상 렌더링 확인
5. DevTools → Network 탭: `https://todays-detective.s3.ap-northeast-2.amazonaws.com/portraits/*.jpg` 호출 확인
6. AWS S3 콘솔 `portraits/` 폴더에 `.jpg` 3개 업로드 확인
7. MongoDB Atlas 콘솔에서 `portraitImage` 필드가 `https://...` URL인지 확인 (Base64 대비 짧음)

### 3. 게임 플레이
8. 수사 → 추리 화면 → 용의자 그리드 이미지 정상 표시
9. 제출 → 결과 화면 → 범인 폴라로이드 이미지 정상 표시
10. 브리핑 모달에서도 용의자 이미지 정상 표시

### 4. 하위 호환성
11. 기존 Base64 시나리오 재생 시 이미지가 여전히 Data URI로 렌더링되는지 확인

### 5. 백엔드 + Atlas
12. FastAPI 기동 → `GET /scenarios/` → Atlas에서 시나리오 목록 반환 확인

### 6. 에러 케이스
13. S3 업로드 실패 시 (키 제거) → `try/catch`가 에러 흡수 후 아이콘 폴백 렌더링 확인
