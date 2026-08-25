# unraid 스택 (infra/)

작성자 : 박현일
이 문서의 소유권은 작성자에게 있으며, 일부 또는 전체는 AI(Claude)를 활용하여 작성되었습니다.

Today's Detective를 unraid에서 구동하는 Docker Compose 스택. 전체 이전 계획은
[plan/unraid_migration_plan.md](../plan/unraid_migration_plan.md).

## 구성

| 파일 | 배치 위치 (unraid) |
|---|---|
| `docker-compose.yml` | `/mnt/user/appdata/todays-detective/compose/docker-compose.yml` |
| `mongo-init/01-app-user.sh` | `/mnt/user/appdata/todays-detective/mongo/init/` |
| `minio-init/init.sh` | `/mnt/user/appdata/todays-detective/minio-init/` |
| `verify-mongo.sh`, `verify-minio.sh` | 데이터 계층 검증용 (배포 대상 아님) |
| `../server/` (API 소스) | `/mnt/user/appdata/todays-detective/server/` |
| `.env` (레포에 없음) | `/mnt/user/appdata/todays-detective/compose/.env` — 권한 600 |

현재 포함된 서비스: `mongo`, `minio`, `minio-init`, `api`.
`web`은 Phase 3에서 추가한다.

API 소스는 [`server/`](../server/)에 있고 `/mnt/user/appdata/todays-detective/server/`로 배포한다
(compose의 `build.context`가 `../server`).

## `.env`를 /boot에 두지 않는 이유

`/boot`은 **vfat**이라 유닉스 권한이 없다 (`chmod 600`이 무의미). 그래서 실제 compose 파일과
`.env`는 appdata(xfs/btrfs)에 두고, Compose Manager의 **indirect 모드**로 그 디렉터리를 가리킨다.
`/boot`에는 메타데이터 4개만 올라간다.

## unraid 웹UI 연동 (Compose Manager)

```
/boot/config/plugins/compose.manager/projects/todays-detective/
├── name                        # "todays-detective"        (개행 없음)
├── indirect                    # "/mnt/user/appdata/todays-detective/compose"
├── autostart                   # "true"
└── docker-compose.override.yml # UI 라벨용, 플러그인이 관리
```

이렇게 두면 unraid **Docker → Compose** 탭에서 스택을 Start/Stop/Update할 수 있다.
플러그인은 아래와 동일한 명령을 실행한다 (수동 조작이 필요할 때 사용):

```bash
C=/mnt/user/appdata/todays-detective/compose/docker-compose.yml
O=/boot/config/plugins/compose.manager/projects/todays-detective/docker-compose.override.yml
docker compose -f $C -f $O -p todays-detective up -d
docker compose -f $C -f $O -p todays-detective down
```

> `-f` 두 개를 모두 넘겨야 플러그인이 인식하는 구성과 일치한다. override를 빼고 올리면
> UI에서 Start를 눌렀을 때 컨테이너가 불필요하게 재생성된다.

## 최초 배포 절차

```bash
# 1. 디렉터리 (mongo 데이터는 컨테이너의 mongodb 유저 999:999 소유여야 한다)
B=/mnt/user/appdata/todays-detective
mkdir -p $B/compose $B/minio-init $B/mongo/{data,config,init} $B/minio/data $B/backup
chown -R 999:999 $B/mongo/data $B/mongo/config

# 2. 파일 전송 (개발 PC에서)
scp infra/docker-compose.yml        unraid:$B/compose/docker-compose.yml
scp infra/mongo-init/01-app-user.sh unraid:$B/mongo/init/
scp infra/minio-init/init.sh        unraid:$B/minio-init/
scp .env.unraid                     unraid:$B/compose/.env
scp -r server/app server/Dockerfile server/requirements*.txt        server/pytest.ini server/tests unraid:$B/server/

# 3. 권한
ssh unraid "chmod 600 $B/compose/.env; chmod 755 $B/mongo/init/*.sh $B/minio-init/*.sh"

# 4. 기동
ssh unraid "cd $B/compose && docker compose config >/dev/null && docker compose up -d"
```

`docker compose config`가 경고 없이 통과하면 `.env` 치환이 정상이다.
(단 `config` 출력에는 비밀값이 그대로 나오므로 로그로 남기지 말 것)

## 초기화 스크립트의 동작 조건

- **`mongo-init/01-app-user.sh`** — `/data/db`가 **비어 있는 첫 부팅에만** 실행된다.
  이미 초기화된 볼륨에서는 mongo entrypoint가 아예 호출하지 않는다.
  스크립트를 고친 뒤 다시 적용하려면 데이터를 비우거나 `mongosh`로 직접 실행해야 한다.
  - 앱 전용 계정 `detective`(readWrite@todays_detective)를 만든다.
    공식 이미지는 `admin` DB에 root만 만들기 때문에 별도로 필요하다.
  - `scenarios`, `feedbacks` 컬렉션과 조회용 인덱스를 미리 만든다.
- **`minio-init/init.sh`** — 스택을 올릴 때마다 실행되며 **멱등하다**.
  버킷을 만들고 `portraits/` 프리픽스에만 익명 read를 부여한다 (버킷 루트는 비공개).

## 네트워크

단일 user-defined 네트워크 `todays-detective-net`. 포트 공개는 NPM 도달용 최소한만:

| 서비스 | 바인드 |
|---|---|
| `todays-detective-minio` | `172.17.0.1:9100` → 9000 |
| `todays-detective-web` (Phase 3) | `172.17.0.1:3100` → 3000 |
| `todays-detective-api`, `-mongo` | 공개 없음 |

`172.17.0.1`(docker0)에만 바인드하므로 기본 bridge에 있는 NPM은 도달하지만 LAN에서는 닿지 않는다.
NPM이 기본 bridge에 있어 컨테이너명 DNS를 못 쓰는 사정은 계획 §0-B 참조.

네트워크에 `internal: true`를 주면 안 된다 — Phase 2의 `api`가 Gemini API로 나가는 egress가 막힌다.

## 검증

```bash
# Mongo 계정/컬렉션/인덱스
scp infra/verify-mongo.sh unraid:/tmp/ && ssh unraid \
  "docker cp /tmp/verify-mongo.sh todays-detective-mongo:/tmp/ && \
   docker exec todays-detective-mongo sh /tmp/verify-mongo.sh"

# MinIO 익명 read가 열려 있고 LAN에서는 닫혀 있는지
ssh unraid 'curl -s -o /dev/null -w "%{http_code}\n" http://172.17.0.1:9100/todays-detective/'
#  → 403 (버킷 루트 목록은 비공개가 정상)
```

Phase 1에서 확인된 결과: 익명 GET 200 / LAN 접근 실패 / 버킷 루트 403 /
`Cache-Control: public, max-age=31536000, immutable` 유지.

## API 회귀 테스트 (server/tests)

`Dockerfile`은 멀티스테이지다. 기본(마지막) 스테이지가 `runtime`이라 compose는 target 지정
없이 운영 이미지를 빌드하고, 테스트는 별도 스테이지에서 돌린다.

```bash
B=/mnt/user/appdata/todays-detective
cd $B/server
docker build --target test -t todays-detective-api-test .
docker run --rm --network todays-detective-net --env-file $B/compose/.env \
  todays-detective-api-test pytest
```

`--network`와 `--env-file`이 필요한 이유는 라우터 테스트가 실제 Mongo에 붙기 때문이다.

### 테스트가 지키는 두 가지 안전장치

1. **Gemini를 호출하지 않는다.** `conftest.py`의 `block_gemini`가 autouse로
   `call_gemini`·`generate_portrait_image`·`get_client`를 예외 발생 함수로 바꿔둔다.
   호출이 필요한 테스트는 각자 mock을 심는다. 실수로 실제 호출이 새면 즉시 실패하므로
   **테스트가 비용을 발생시키지 않는다.**
2. **운영 데이터를 건드리지 않는다.** 앱 계정(`detective`)은 `todays_detective` DB에만
   권한이 있어 별도 DB를 쓸 수 없다. 그래서 같은 DB의 전용 컬렉션
   `scenarios_pytest` / `feedbacks_pytest`를 쓰고 매 테스트마다 비운다.

> 픅스처 정리 시점에 DB 핸들을 새로 얻는다. `TestClient` 컨텍스트가 닫힐 때 lifespan이
> `db.close()`를 호출하므로, setup 때 잡아둔 핸들을 재사용하면
> `Cannot use MongoClient after close`가 난다.

### 커버리지

| 파일 | 대상 |
|---|---|
| `test_sanitize.py` | 스포일러 정화. **Lambda 원문을 oracle로 두고 출력 동일성 비교** |
| `test_evaluate_parsing.py` | 평가 정규식 3개와 폴백 문구. 대괄호 변형·같은 줄 등급·형식 이탈 |
| `test_feedback_mapping.py` | camelCase ↔ snake_case 10필드 왕복, 300자 경계 |
| `test_routes.py` | 엔드포인트 13개. 에러 메시지, 후행 슬래시, 클램프, 프롬프트 조립 |
| `test_storage.py` | 초상화 리사이즈. 정사각형 균등 축소 + 비정사각형 center-crop 폴백 |
