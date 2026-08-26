# 오늘의 탐정 (Today's Detective)

Gemini가 생성한 사건을 20분 안에 추리하는 웹 게임. 용의자 3명을 심문해 범인을 지목하면
AI가 등급(S~F)과 수사 보고서를 돌려준다.

**https://detective.mintflavor.ddns.net**

작성자 : 박현일
이 프로젝트의 소유권은 작성자에게 있으며, 코드의 일부 또는 전체는 AI(Claude, Gemini)를
활용하여 작성되었습니다.

---

## 스택

| 계층 | 기술 |
|---|---|
| 프론트엔드 | Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · TypeScript |
| 백엔드 | FastAPI · uvicorn · Python 3.12 |
| 데이터 | MongoDB 8 |
| 오브젝트 스토리지 | MinIO (S3 호환) |
| AI | Gemini 3.6 Flash (사건 생성·평가) · 3.5 Flash-Lite (심문) · 3.1 Flash-Lite Image (초상화) |
| 배포 | Docker Compose on unraid · Nginx Proxy Manager |

AWS(Lambda·API Gateway·S3·MongoDB Atlas) + Vercel에서 자체 호스팅으로 이전했다.
이전 과정의 설계 판단과 실제로 부딪힌 함정은
[plan/unraid_migration_plan.md](plan/unraid_migration_plan.md)에 기록돼 있다.

## 게임 흐름

```
intro → 브리핑 → 튜토리얼 → 수사(20분, 용의자별 20회) → 추리 → 결과
                                    ↑
                        "지난 사건 기록"으로 이전 사건 재생 가능
```

새 사건 생성은 Gemini 텍스트 1회 + 초상화 3장을 소비하므로 비싸다.
기록 재생은 15배 저렴하며, 생성에는 레이트 리밋이 걸려 있다.

## 개발

```bash
npm install
npm run dev          # http://localhost:3000
```

프론트엔드는 same-origin `/server/*`로만 백엔드를 호출한다. 로컬에서 백엔드를 붙이려면
`API_INTERNAL_URL`을 실행 중인 FastAPI 주소로 지정한다.

백엔드와 테스트 실행, 컨테이너 배포는 [infra/README.md](infra/README.md) 참조.
아키텍처와 주의사항은 [CLAUDE.md](CLAUDE.md)에 정리돼 있다.

## 라이선스

[MIT](LICENSE)
