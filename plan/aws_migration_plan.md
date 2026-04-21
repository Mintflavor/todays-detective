# AWS S3 + MongoDB Atlas 마이그레이션 계획

## Context

현재 용의자 초상화 이미지가 Base64 문자열로 MongoDB의 `case_data.suspects[].portraitImage` 필드에 인라인 저장된다. 이로 인해 시나리오 1건당 MongoDB 문서 크기가 이미지 3장(각 약 50~100KB Base64) 때문에 불필요하게 커지고, 네트워크 응답도 느려진다.

마이그레이션 목표:
- **이미지**: MongoDB Base64 → AWS S3 (퍼블릭 URL로 교체)
- **MongoDB**: 로컬/Docker MongoDB → MongoDB Atlas (AWS 관리형)
- **기존 데이터**: 신규 생성분부터 적용 (기존 시나리오는 그대로 유지)

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
- 프론트엔드 렌더링: `data:image/jpeg;base64,...` → 일반 URL (조건부 분기 처리)

### MongoDB: 로컬 → Atlas

- `backend/database.py`의 `MONGODB_URL` 환경변수를 Atlas 연결 문자열로 교체
- 코드 변경 없음, 환경변수만 교체

---

## 수정 파일 목록

| 파일 | 변경 내용 |
|---|---|
| `package.json` | `@aws-sdk/client-s3` 패키지 추가 |
| `app/api/game/start/route.ts` | 이미지 저장 로직: base64 저장 → S3 업로드 후 URL 저장 |
| `app/components/BriefingScreen.tsx` | 이미지 렌더링: base64 Data URI → 일반 URL 조건부 처리 |
| `app/components/DeductionScreen.tsx` | 동일한 이미지 렌더링 변경 |
| `app/components/ResolutionScreen.tsx` | 동일한 이미지 렌더링 변경 |
| `next.config.ts` | S3 도메인을 `remotePatterns`에 추가 |
| `.env` | AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET_NAME 추가 |
| `docker-compose.yml` | MONGODB_URL=Atlas 연결 문자열 교체 |

---

## 상세 구현 계획

### STEP 1 — @aws-sdk/client-s3 패키지 설치

```bash
npm install @aws-sdk/client-s3
```

### STEP 2 — Next.js에서 S3 업로드 (`app/api/game/start/route.ts`)

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid'; // 이미 설치 여부 확인 필요, 없으면 crypto.randomUUID() 사용

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET_NAME!;

// 기존: suspect.portraitImage = resizedBuffer.toString('base64');
// 변경 후:
const key = `portraits/${crypto.randomUUID()}.jpg`;
await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: resizedBuffer,
    ContentType: 'image/jpeg',
}));
suspect.portraitImage = `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
```

`crypto.randomUUID()`는 Node.js 14.17+에서 기본 제공 — 추가 패키지 불필요.

### STEP 3 — 프론트엔드 이미지 렌더링 변경

현재 3곳에서 `data:image/jpeg;base64,...` 형식으로 렌더링 중:
- `app/components/BriefingScreen.tsx`
- `app/components/DeductionScreen.tsx`
- `app/components/ResolutionScreen.tsx`

변경 방식 (기존 base64 데이터와의 하위 호환 유지):
```tsx
// 변경 전
src={`data:image/jpeg;base64,${s.portraitImage}`}

// 변경 후
src={s.portraitImage.startsWith('http') ? s.portraitImage : `data:image/jpeg;base64,${s.portraitImage}`}
```

### STEP 4 — next.config.ts에 S3 도메인 허용

```typescript
// next.config.ts
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.s3.amazonaws.com' }
    ]
  }
};
```

### STEP 5 — MongoDB Atlas 전환 (환경변수 교체만)

`backend/database.py`는 이미 `os.getenv("MONGODB_URL", "mongodb://localhost:27017")`를 사용하므로 코드 변경 없음.

`docker-compose.yml` 또는 배포 환경의 환경변수 교체:
```
MONGODB_URL=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/todays_detective?retryWrites=true&w=majority
```

---

## AWS 콘솔 사전 작업 (코드 작업 전 완료 필요)

### S3 버킷 설정

1. **버킷 생성**: `todays-detective-portraits` (리전: ap-northeast-2)
2. **퍼블릭 액세스 차단 해제**: "Block all public access" 비활성화
3. **버킷 정책** 추가:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::todays-detective-portraits/*"
  }]
}
```
4. **IAM 사용자** 생성: `todays-detective-uploader`
   - 권한: 해당 버킷에 `s3:PutObject`만 허용하는 최소 권한 정책
   - Access Key 발급 → `.env`에 등록

### MongoDB Atlas 설정

1. MongoDB Atlas → 새 프로젝트 → M0 Free Cluster 생성 (AWS / ap-northeast-2)
2. Database Access: DB 사용자 생성 (username/password)
3. Network Access: IP Whitelist (`0.0.0.0/0` 또는 서버 고정 IP)
4. Connect → Drivers → Python → 연결 문자열 복사

---

## 환경변수 추가 목록

`.env` (Next.js + FastAPI 공용):
```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-northeast-2
S3_BUCKET_NAME=todays-detective-portraits
MONGODB_URL=mongodb+srv://...
```

---

## 검증 방법

1. `npm run dev` 및 FastAPI `uvicorn` 실행
2. 게임 시작 → 시나리오 생성
3. AWS S3 콘솔 `portraits/` 폴더에서 `.jpg` 파일 3개 업로드 확인
4. MongoDB Atlas 콘솔에서 `portraitImage` 필드 값이 `https://...s3.amazonaws.com/...` URL인지 확인
5. 브리핑, 추리, 결과 화면에서 이미지 정상 렌더링 확인
6. 기존 Base64 시나리오와 신규 URL 시나리오 모두 이미지가 표시되는지 확인
