# 인수인계 문서 — 오늘의 탐정

작성자 : 박현일
이 문서의 소유권은 작성자에게 있으며, 일부 또는 전체는 AI(Claude)를 활용하여 작성되었습니다.

최종 확인: **2026-09-05** (실측 기준. 아래 수치는 그날 서버에서 직접 확인한 값이다)

---

## 0. 이 문서의 범위

이 문서는 **어디에도 적혀 있지 않은 것**만 담는다. 코드를 만질 때 알아야 할 함정은
[CLAUDE.md](CLAUDE.md)에 12개 항목으로 정리돼 있고, 인프라 구성은
[infra/README.md](infra/README.md)에, 결정의 배경은 `plan/`에 있다. 중복해서 쓰지 않았다.

**읽는 순서**

1. 이 문서 §2 (지금 당장 처리해야 할 것) — 여기부터 읽을 것
2. [CLAUDE.md](CLAUDE.md) 전체 — 특히 「손대기 전에 알아야 할 것」 12개
3. [infra/README.md](infra/README.md) — 배포·검증 절차
4. [plan/unraid_migration_plan.md](plan/unraid_migration_plan.md) — 인프라를 만지기 전에

---

## 1. 5분 요약

Gemini가 매번 새 추리 사건을 생성하고, 플레이어가 20분 안에 용의자 3명을 심문해 범인을
지목하면 AI가 S~F 등급을 매기는 웹 게임.

**AWS(Lambda·API Gateway·S3·Atlas) + Vercel에서 자택 unraid 서버로 이전을 마쳤다.**
현재 운영 중인 것은 unraid 스택 하나뿐이다.

| | |
|---|---|
| 공개 주소 | https://detective.mintflavor.ddns.net |
| 이미지 CDN | https://cdn.mintflavor.ddns.net |
| 서버 | unraid, Docker Compose 스택 4개 컨테이너 |
| 프론트 | Next.js 16 App Router, standalone 빌드 |
| 백엔드 | FastAPI + uvicorn |
| 저장소 | MongoDB 8 (SCRAM), MinIO (S3 호환) |
| 리버스 프록시 | Nginx Proxy Manager (별도 컨테이너) |
| 테스트 | pytest 239건 + vitest 64건 |

**현재 상태 (2026-09-05 실측)**

```
todays-detective-web     healthy   3일 가동
todays-detective-api     healthy   3일 가동
todays-detective-mongo   healthy   3일 가동
todays-detective-minio   healthy   3일 가동

데이터   시나리오 10건 / 피드백 2건 / 초상화 30장
용량     Mongo 119M · MinIO 1.5M · appdata 합계 133M
서버     uptime 50일
```

지켜야 할 실데이터는 **작다**. 그래서 백업이 어렵지 않은데도 지금 안 되고 있다 (§2.2).

---

## 2. 지금 당장 처리해야 할 것

이 세 가지는 인수 직후에 처리하는 것을 권한다. 순서대로 위험하다.

### 2.1 🔴 MongoDB 앱 계정 비밀번호를 교체할 것

**2026-08-26, AI 보조 작업 중 `detective` 계정의 접속 문자열이 대화 기록에 평문으로
노출됐다.** `.env`의 `RATE_LIMIT_STORAGE_URI` 값에 비밀번호가 포함돼 있는데, 리밋 설정을
확인하려고 `RATE_LIMIT_*` 전체를 출력한 것이 원인이다.

**노출 범위는 제한적이다** — Mongo는 포트를 공개하지 않고 `todays-detective-net` 네트워크
안에서만 닿는다. 외부에서 이 자격증명으로 접속할 경로는 없다. 그래도 교체를 권한다.

```bash
ssh unraid

# 1) 새 비밀번호 생성 (화면에만 보이게)
NEWPW=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32); echo "$NEWPW"

# 2) Mongo에서 변경
docker exec -it todays-detective-mongo mongosh --quiet \
  -u detective -p --authenticationDatabase todays_detective todays_detective
#    프롬프트에서 기존 비밀번호 입력 후:
#    db.changeUserPassword("detective", "<새 비밀번호>")

# 3) .env의 **세 곳**을 새 값으로 (권한 600 유지)
#      MONGO_APP_PASSWORD       ← 초기화 스크립트가 계정을 만들 때 쓰는 원본
#      MONGODB_URL              ← 앱 접속 문자열 (비밀번호 포함)
#      RATE_LIMIT_STORAGE_URI   ← 리밋 카운터 접속 문자열 (비밀번호 포함)
#
#    ⚠️ 앞의 둘만 바꾸면 지금은 동작하지만, 나중에 mongo 볼륨을 새로 만들 때
#       01-app-user.sh가 MONGO_APP_PASSWORD로 계정을 만들어 옛 비밀번호가 되살아난다.
E=/mnt/user/appdata/todays-detective/compose/.env
cp -p $E $E.bak-$(date +%Y%m%d-%H%M%S)
# 편집 후:
docker compose -f /mnt/user/appdata/todays-detective/compose/docker-compose.yml \
  -f /boot/config/plugins/compose.manager/projects/todays-detective/docker-compose.override.yml \
  -p todays-detective up -d
```

> **`.env`를 다룰 때의 원칙**: 값을 화면에 출력하지 말 것. 확인이 필요하면 키 이름만
> 보거나(`grep -o '^KEY='`) 마스킹할 것. `RATE_LIMIT_STORAGE_URI`와 `MONGODB_URL`은
> 이름만 봐서는 비밀값처럼 안 보이지만 **접속 문자열 전체가 들어 있다.**

### 2.2 🔴 일일 백업이 한 번도 자동 실행된 적이 없다

unraid `user.scripts`에 `todays-detective-mongo-backup`이 등록돼 있고 스크립트도
정상인데, **`schedule`과 `cronSchedule` 파일의 값이 뒤바뀌어 있어 cron에 등록되지
않았다.**

```
현재:  schedule = "30 4 * * *"     cronSchedule = "custom"
정상:  schedule = "custom"          cronSchedule = "30 4 * * *"
```

`/etc/cron.d/root`에 항목이 없는 것으로 확인했다. 남아 있는 백업은 2026-08-25에 수동
실행한 2건(각 3.6K)뿐이고, 그 뒤 11일간 백업이 없다.

```bash
ssh unraid
S=/boot/config/plugins/user.scripts/scripts/todays-detective-mongo-backup
printf 'custom' > $S/schedule
printf '30 4 * * *' > $S/cronSchedule
# unraid 웹UI → Settings → User Scripts 에서 스케줄이 반영됐는지 확인하고
# "Run Script"로 한 번 수동 실행해 볼 것
```

**그리고 백업 범위가 Mongo뿐이다.** 다음 둘은 **아무것도 백업하지 않는다**:

| 대상 | 위험 |
|---|---|
| MinIO 초상화 (`minio/data`, 30장 1.5M) | 잃으면 기존 시나리오의 용의자 얼굴이 전부 깨진다. 재생성 불가 (생성 시 프롬프트가 저장되지 않는다) |
| `compose/.env` | **잃으면 Mongo 덤프를 복원할 자격증명 자체가 없다.** 백업이 있어도 못 쓴다 |

`.env`는 `.gitignore`에 있어 레포에도 없다. 별도 보관처(암호 관리자 등)에 사본을
두는 것을 강력히 권한다. unraid의 **CA Appdata Backup** 플러그인에
`todays-detective`를 추가하면 셋 다 한 번에 해결된다 — 원래 계획이었으나 미뤄져 있다.

### 2.3 🟡 배포된 코드가 `master`에 없다

**`master`는 운영 코드가 아니다.** 73커밋 뒤처져 있고, PR #1 병합 이후로 갱신되지 않았다.

```
master        origin/master 기준 73커밋 뒤   ← 배포된 적 없음
preview       origin/preview 기준 13커밋 뒤
fix/ux-flow   ← 현재 unraid에 배포된 코드
```

레포를 처음 여는 사람은 `master`를 보고 전혀 다른 코드를 읽게 된다. 인수 후 정리 방향을
정할 것 — `preview`를 `master`에 병합해 기본 브랜치를 실제 코드와 맞추는 편이 낫다.

**[PR #13](https://github.com/Mintflavor/todays-detective/pull/13)이 열려 있다**
(`fix/ux-flow` → `preview`). 이 문서 작성 시점 기준 미병합이며, 그 내용은 이미 unraid에
배포돼 동작 중이다.

---

## 3. 인수받아야 할 접근 권한

코드만으로는 운영할 수 없다. 다음을 넘겨받아야 한다.

| 항목 | 어디에 | 비고 |
|---|---|---|
| unraid SSH 키 | 개발 PC `~/.ssh` | `ssh unraid`로 바로 붙게 설정돼 있다 |
| unraid 웹UI 로그인 | — | Docker → Compose 탭에서 스택 제어 |
| `compose/.env` 전체 | 서버 `600` | **레포에 없다.** 아래 값들이 전부 여기 있다 |
| Gemini API 키 | `.env` | **개발용 키**. 요금제·소유 계정 확인 필요 |
| GitHub 레포 | Mintflavor/todays-detective | 푸시 권한 |
| DDNS / 도메인 | mintflavor.ddns.net | 갱신 주체 확인 필요 |
| Nginx Proxy Manager | 별도 컨테이너 | `detective`·`cdn` 두 호스트 설정 |
| 관리자 화면 비밀번호 | `.env` `ADMIN_PASSWORD` | 인트로 화면 비밀 커맨드로 진입 |
| AWS 콘솔 | — | 잔존 리소스 정리용 (§6) |
| Vercel | — | 잔존 프로젝트 정리용 (§6) |

**web 컨테이너에는 환경변수가 하나도 없다** — 비밀값은 api 컨테이너에만 들어간다.
각 키의 의미는 [CLAUDE.md 「환경변수」](CLAUDE.md#환경변수) 참조.

`.env`가 담고 있는 키 (2026-09-05 기준 22개, 값은 서버에만 있다):

```
WEB_DOMAIN  CDN_DOMAIN  PUBLIC_ASSET_BASE_URL  ALLOWED_ORIGINS
MONGO_INITDB_ROOT_USERNAME  MONGO_INITDB_ROOT_PASSWORD
MONGO_APP_USERNAME  MONGO_APP_PASSWORD  MONGODB_URL
MINIO_ROOT_USER  MINIO_ROOT_PASSWORD
GEMINI_API_KEY  GEMINI_MODEL  GEMINI_CHAT_MODEL  IMAGE_MODEL
API_KEY_ADMIN  ADMIN_PASSWORD
RATE_LIMIT_ENABLED  RATE_LIMIT_STORAGE_URI
RATE_LIMIT_START_GLOBAL  RATE_LIMIT_CHAT  RATE_LIMIT_EVALUATE
```

> 이름만 봐서는 비밀값 같지 않지만 **접속 문자열 전체가 들어 있는 키**가 둘 있다:
> `MONGODB_URL`, `RATE_LIMIT_STORAGE_URI`. §2.1의 사고가 정확히 이것 때문이었다.

---

## 4. 일상 운영

### 4.1 배포

git이 아니라 **소스 복사** 방식이다. compose의 build context가 `../server`와 `../web`이라,
개발 PC에서 tar로 보내고 컨테이너를 다시 빌드한다.

```bash
# 개발 PC에서
B=/mnt/user/appdata/todays-detective
S=/tmp   # 임시 디렉터리

git archive --format=tar -o $S/web.tar HEAD \
  .dockerignore Dockerfile app public next.config.ts package.json \
  package-lock.json postcss.config.mjs tailwind.config.ts tsconfig.json eslint.config.mjs
git archive --format=tar -o $S/server.tar HEAD server
scp $S/web.tar $S/server.tar unraid:/tmp/

ssh unraid
B=/mnt/user/appdata/todays-detective
rm -rf $B/web.new $B/server.new && mkdir -p $B/web.new $B/server.new
tar -xf /tmp/web.tar    -C $B/web.new
tar -xf /tmp/server.tar -C $B/server.new --strip-components=1

# 롤백본을 남기고 교체
rm -rf $B/web.prev2 $B/server.prev2
mv $B/web.prev $B/web.prev2 ; mv $B/server.prev $B/server.prev2
mv $B/web $B/web.prev       ; mv $B/web.new $B/web
mv $B/server $B/server.prev ; mv $B/server.new $B/server

C=$B/compose/docker-compose.yml
O=/boot/config/plugins/compose.manager/projects/todays-detective/docker-compose.override.yml
docker compose -f $C -f $O -p todays-detective build todays-detective-api todays-detective-web
docker compose -f $C -f $O -p todays-detective up -d
```

> ⚠️ **`-f`를 두 개 다 넘길 것.** compose 파일만 넘기면 Compose Manager가 인식하는 구성과
> 어긋나, 웹UI에서 Start를 눌렀을 때 컨테이너가 불필요하게 재생성된다.

> ⚠️ **프론트만 바뀐 것처럼 보여도 서버 소스를 확인할 것.** 브랜치에 백엔드 커밋이 섞여
> 있으면 web만 배포해서는 반영되지 않는다. 실제로 프롬프트 풀 확대가 이 방식으로 한 번
> 누락될 뻔했다.

**롤백** — 직전 소스가 `web.prev` / `server.prev`에 있다 (2세대까지: `.prev2`).
디렉터리를 되돌리고 다시 빌드하면 된다.

### 4.2 검증 (전부 무료 — Gemini를 호출하지 않는다)

```bash
# 서버 회귀 테스트 (239건). 운영 이미지에는 pytest가 없어 test 스테이지를 쓴다
B=/mnt/user/appdata/todays-detective
cd $B/server
docker build --target test -t todays-detective-api-test .
docker run --rm --network todays-detective-net --env-file $B/compose/.env \
  todays-detective-api-test pytest

# 프론트 (64건)
npm test

# 배포 확인
curl -s -o /dev/null -w '%{http_code}\n' http://172.17.0.1:3100/
curl -s -o /dev/null -w '%{http_code}\n' http://172.17.0.1:3100/server/healthz   # rewrite 프록시
```

`conftest.py`가 **Gemini 호출과 레이트 리밋을 모두 차단**한다. 테스트는 비용을 발생시키지
않고 운영 카운터도 건드리지 않는다.

**배포본이 실제로 바뀌었는지 확인하는 법** — 번들을 직접 grep하면 된다. 화면을 열어보지
않고도 확인된다.

```bash
W=http://172.17.0.1:3100
CSS=$(curl -s $W/ | grep -o '/_next/static/chunks/[^"]*\.css' | head -1)
curl -s "$W$CSS" | grep -c 'td-paper'
for f in $(curl -s $W/ | grep -o '/_next/static/chunks/[^"]*\.js' | sort -u); do
  curl -s "$W$f" | grep -q '찾는 문구' && echo "$f"
done
```

### 4.3 로그·상태

```bash
docker ps --format '{{.Names}}\t{{.Status}}' | grep todays
docker logs --tail 100 todays-detective-api
docker logs --tail 100 todays-detective-web
```

api 로그에는 부팅 시 적용된 레이트 리밋이 한 줄로 찍힌다.

### 4.4 복원

```bash
# Mongo 논리 백업 복원
B=/mnt/user/appdata/todays-detective
docker exec -i todays-detective-mongo sh -c '
  mongorestore --quiet --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin \
    --archive --gzip --drop
' < $B/backup/mongo-<날짜>.gz
```

> `mongo-init/01-app-user.sh`는 **`/data/db`가 비어 있는 첫 부팅에만** 실행된다. 볼륨을
> 새로 만들어 복원하는 경우가 아니면 앱 계정을 `mongosh`로 직접 만들어야 한다.

---

## 5. 비용

Gemini가 유일한 변동비다. **개발용 키**를 쓰고 있어 현재는 월 한도를 고정하지 않는다.

| 항목 | 단가 | 비고 |
|---|---|---|
| 새 사건 생성 | **159원** | 이 중 93%가 초상화 3장 |
| 기록 재생 | 11.7원 | 15배 저렴 |
| 심문 1회 | 0.68원 | 한 판 최대 60회 |
| 평가 1회 | 4.91원 |  |

한 판(신규) 최대 약 205원. 현재 한도의 기준은 **하루 세 판을 여유롭게**다.

```
RATE_LIMIT_START_GLOBAL   5/hour;8/day;150/month
RATE_LIMIT_CHAT           300/hour
RATE_LIMIT_EVALUATE       20/hour
```

**조일 곳은 언제나 `RATE_LIMIT_START_GLOBAL`의 월 한도다** (초상화가 비용의 93%).
심문에는 월/일 한도를 걸지 않는다 — 수사 중에 429가 나면 그 판이 통째로 버려진다.

⚠️ **모든 제한은 per-IP가 아니라 전역이다.** Next의 rewrite 프록시가 `X-Forwarded-For`를
전달하지 않아 리밋 키가 web 컨테이너 주소로 잡힌다 (실측 확인). 즉 **한 사람이 한도를 다
쓰면 다른 접속자가 막힌다.** 계산과 배경은 [server/app/ratelimit.py](server/app/ratelimit.py)
상단 주석에 있다. 리밋을 바꿀 때 `tests/test_ratelimit.py`의 예산 가드를 **지우지 말고
전제를 갱신할 것.**

---

## 6. 미완 작업 / 결정 대기

### 6.1 AWS·Vercel 잔존 리소스 정리 (콘솔 작업, 비가역)

이전은 끝났지만 구 리소스가 아직 살아 있다. 요금이 계속 나갈 수 있다.

- [ ] Lambda `todays-detective-api` + API Gateway 삭제
- [ ] S3 버킷 `todays-detective` 삭제
- [ ] MongoDB Atlas 클러스터 삭제
- [ ] IAM 사용자 `todays-detective-uploader` + Access Key 삭제
- [ ] Vercel 프로젝트 정리 (또는 배포 중단)

> 삭제 전에 새 스택을 며칠 더 돌려볼 것. Vercel의 `NEXT_PUBLIC_API_URL`을 API Gateway로
> 되돌리는 롤백 경로가 이것들을 지우는 순간 사라진다.

unraid의 `user.scripts`에 AWS 시대의 `aws_s3_todays-detective_backup`(rclone으로 S3를
동기화)이 남아 있다. S3를 지우면 이 스크립트도 같이 정리할 것.

### 6.2 레포 정리

- [ ] `master`를 실제 운영 코드와 맞추기 (§2.3)
- [ ] `server/app/__pycache__/*.pyc` **2개가 git에 추적되고 있다.** 이미지에는
      `server/.dockerignore`가 걸러 주므로 배포 영향은 없지만, 커밋마다 바이너리 diff가 생긴다
- [ ] 레포 루트 `.env` 처리 — AWS 시대의 죽은 키들과 **무관한 `GITHUB_MCP_PAT`이 함께
      들어 있다.** 이 PAT이 아직 살아 있는지 확인하고, 살아 있다면 파기하거나 옮길 것.
      `.gitignore`에 있어 커밋되지는 않았다

### 6.3 검토가 필요한 설계 판단

**AI 응답 생성 중에는 타이머가 멈춘다.** `isActive`가
`phase === 'investigation' && !isTyping`이고, `isTyping`은 플레이어가 아니라 **AI가 답변을
만드는 중**이라는 뜻이다. 한 판 최대 60회 심문에 회당 3초만 잡아도 **3분이 공짜**다.
의도라면 그대로 두고, 아니면 `!isTyping`을 떼면 된다.

**힌트 기능이 제안 단계에 있다.** 평가 화면에는 `advice`(수사 보완점)가 있는데 정작 수사
중에는 아무 도움이 없다. 2026-09-05 논의에서 3단계 안이 나왔고, 아직 구현하지 않았다:

| 단계 | 내용 | 추가 비용 | 정답 유출 위험 |
|---|---|---|---|
| 0 | **증거 제시** — 서류철에서 증거를 골라 들이민다. 같은 심문 호출로 처리 | 0원 | 없음 |
| 1 | **모순 표시** — 답변이 사실과 어긋나면 조서에 붉은 한 줄 | 턴당 2배 | 낮음 (`isCulprit`을 안 줘도 된다) |
| 2 | **본부 조언** — 진상을 넣고 "다음에 물을 질문"을 받는다 | 요청당 1회 | **높음** |

> 조서는 `role: 'system'` 메시지를 가운데 붉은 괘선 한 줄로 이미 렌더링한다.
> 1단계는 **UI를 새로 만들 필요가 없다.**
>
> ⚠️ 2단계를 만들 때는 프롬프트로 부탁하는 것으로 부족하다. `_normalize_culprit`이
> LLM 출력을 방어하듯 **결정론적 필터**가 필요하다 — 힌트 문자열에 범인 이름이나
> 스포일러 필드가 섞이면 버리고 다시 받을 것. 그리고 생성된 힌트를 시나리오 문서에
> **저장하지 말 것** (기록 재생에서 새어 나간다).

---

## 7. 이 프로젝트에서 반복해서 데인 지점

전체 목록은 [CLAUDE.md 「손대기 전에 알아야 할 것」](CLAUDE.md) 12개 항목에 있다.
여기서는 **왜 그 목록이 그렇게 긴지**만 적는다.

이 코드의 사고는 대부분 **예외를 던지지 않는다.**

- 스포일러 정화가 깨지면 → 정답이 클라이언트로 새지만 화면은 정상이다
- 평가 파싱이 깨지면 → 모든 추리가 조용히 `F`가 된다
- 프롬프트 예시에 값을 박으면 → 모든 사건이 그 값으로 나온다 (실제로 범인이 4/4 전부 id 2였다)
- 타이머 effect 의존성이 틀리면 → 타이핑하는 동안 시간이 멈춘다
- 시간 제한을 한 곳만 고치면 → AI가 옛 기준으로 채점해 등급만 낮아진다
- Chrome 자동 다크 모드 → 밝은 화면의 색이 통째로 반전되고 글자까지 흐려진다
  (`color-scheme: dark` 선언으로 막고 있다. **지우면 재발한다**)

그래서 이 프로젝트의 테스트는 커버리지가 아니라 **"조용히 깨지는 것"을 잡는 데** 초점이
맞춰져 있다. 새 기능을 넣을 때도 같은 질문을 먼저 할 것 — *이게 깨지면 시끄럽게 깨지는가,
조용히 깨지는가?* 조용히 깨진다면 단정을 하나 남겨야 한다.

테스트를 만들었으면 **일부러 깨뜨려서 실제로 잡히는지 확인할 것.** 실제로 배경 탭
타이머 테스트가 거짓 통과한 적이 있다 — 가짜 타이머가 밀린 tick을 전부 실행해서 옛
구현도 통과했다.

---

## 8. 연락·이력

- 레포: https://github.com/Mintflavor/todays-detective
- 설계·이전 이력: `plan/` (특히 `unraid_migration_plan.md` 1073줄,
  `ux_improvement_plan.md` 715줄 — 실패한 시도와 그 이유까지 남아 있다)
- 삭제된 `lambda/handler.py`의 원문은 git 이력에 있다:
  ```bash
  git show $(git rev-list -1 HEAD -- lambda/handler.py):lambda/handler.py
  ```
  이식된 로직(스포일러 정화, 평가 파싱, 피드백 매핑)을 바꿀 일이 생기면 원문과 대조할 것.
