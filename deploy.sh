#!/usr/bin/env bash
# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

set -euo pipefail

TARGET="all"
HOSTNAME="unraid"
REMOTE_PATH="/mnt/user/appdata/todays-detective"
ROLLBACK=0
SKIP_CHECK=0
SKIP_VERIFY=0

print_help() {
    cat << EOF
Today's Detective - unraid 원클릭 배포 스크립트

사용법:
  ./deploy.sh [OPTIONS] [TARGET]

대상 (TARGET):
  all       (기본값) Web, Server, Infra 전체 배포 및 빌드/기동
  web       Web 프론트엔드만 전송 및 재빌드
  api       Server 백엔드만 전송 및 재빌드
  infra     docker-compose 및 init 스크립트만 동기화

옵션 (OPTIONS):
  -t, --target <all|web|api|infra>   배포 대상 지정
  -h, --host <hostname>             SSH 호스트명 (기본값: unraid)
  -p, --path <path>                 원격 앱데이터 경로 (기본값: /mnt/user/appdata/todays-detective)
  -r, --rollback                    직전 백업 버전(*.prev)으로 롤백 실행
      --skip-check                  사전 검사 건너뛰기
      --skip-verify                 배포 후 헬스체크 검증 건너뛰기
      --help                        도움말 출력
EOF
}

# 파라미터 파싱
while [[ $# -gt 0 ]]; do
    case "$1" in
        all|web|api|infra)
            TARGET="$1"
            shift
            ;;
        -t|--target)
            TARGET="$2"
            shift 2
            ;;
        -h|--host)
            HOSTNAME="$2"
            shift 2
            ;;
        -p|--path)
            REMOTE_PATH="$2"
            shift 2
            ;;
        -r|--rollback)
            ROLLBACK=1
            shift
            ;;
        --skip-check)
            SKIP_CHECK=1
            shift
            ;;
        --skip-verify)
            SKIP_VERIFY=1
            shift
            ;;
        --help)
            print_help
            exit 0
            ;;
        *)
            echo "알 수 없는 옵션: $1"
            print_help
            exit 1
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================================"
echo " Today's Detective - unraid 배포 스크립트"
echo " 호스트: $HOSTNAME | 대상: $TARGET | 롤백모드: $ROLLBACK"
echo "========================================================"

# ─────────────────────────────────────────────────────────────────
# 1. 롤백 모드
# ─────────────────────────────────────────────────────────────────
if [[ "$ROLLBACK" -eq 1 ]]; then
    echo -e "\n[STEP] 이전 버전(prev)으로 롤백을 진행합니다..."
    ssh "$HOSTNAME" "bash -s" << EOF
set -e
B="$REMOTE_PATH"
C="\$B/compose/docker-compose.yml"
O="/boot/config/plugins/compose.manager/projects/todays-detective/docker-compose.override.yml"

if [ ! -d "\$B/web.prev" ] || [ ! -d "\$B/server.prev" ]; then
    echo "ERROR: 백업 디렉터리(\$B/web.prev 또는 \$B/server.prev)를 찾을 수 없습니다."
    exit 1
fi

echo ">> 롤백 디렉터리 교체 중..."
rm -rf "\$B/web.failed" "\$B/server.failed"
[ -d "\$B/web" ] && mv "\$B/web" "\$B/web.failed"
[ -d "\$B/server" ] && mv "\$B/server" "\$B/server.failed"

mv "\$B/web.prev" "\$B/web"
mv "\$B/server.prev" "\$B/server"

[ -d "\$B/web.prev2" ] && mv "\$B/web.prev2" "\$B/web.prev"
[ -d "\$B/server.prev2" ] && mv "\$B/server.prev2" "\$B/server.prev"

echo ">> Docker Compose 재빌드 및 기동 중..."
COMPOSE_ARGS="-f \$C"
[ -f "\$O" ] && COMPOSE_ARGS="\$COMPOSE_ARGS -f \$O"

docker compose \$COMPOSE_ARGS -p todays-detective build todays-detective-api todays-detective-web
docker compose \$COMPOSE_ARGS -p todays-detective up -d
echo ">> 롤백 완료."
EOF
    echo -e "\n[SUCCESS] 롤백이 정상적으로 완료되었습니다."
    exit 0
fi

# ─────────────────────────────────────────────────────────────────
# 2. 사전 검사 (Pre-flight Checks)
# ─────────────────────────────────────────────────────────────────
if [[ "$SKIP_CHECK" -eq 0 ]]; then
    echo -e "\n[STEP] 사전 연결 및 환경 상태를 점검합니다..."

    # SSH 연결 점검
    if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "$HOSTNAME" "echo SSH_OK" &>/dev/null; then
        echo "[ERROR] SSH 연결 실패: $HOSTNAME 에 접속할 수 없습니다. ~/.ssh/config 또는 SSH 키를 확인하세요."
        exit 1
    fi
    echo "[SUCCESS] SSH 연결 확인 완료 ($HOSTNAME)"

    # 원격 appdata 경로 및 .env 파일 확인
    REMOTE_ENV_CHECK=$(ssh "$HOSTNAME" "[ -f $REMOTE_PATH/compose/.env ] && echo ENV_OK || echo ENV_MISSING")
    if [[ "$REMOTE_ENV_CHECK" != *"ENV_OK"* ]]; then
        echo "[ERROR] 원격 .env 파일($REMOTE_PATH/compose/.env)이 없습니다! unraid 서버의 .env 구성을 먼저 확인하세요."
        exit 1
    fi
    echo "[SUCCESS] 원격 .env 파일 존재 확인 완료"

    # 로컬 Git 변경사항 점검
    GIT_STATUS=$(git status --porcelain || true)
    if [[ -n "$GIT_STATUS" ]]; then
        echo "[WARN] 주의: 커밋되지 않은 로컬 변경사항이 있습니다."
        echo "[WARN] 이 스크립트는 git HEAD 커밋을 기준으로 아카이빙하므로, 커밋되지 않은 변경사항은 배포에 포함되지 않습니다."
        echo "$GIT_STATUS"
        read -r -p "계속 진행하시겠습니까? (y/N): " CONFIRM
        if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
            echo "배포를 취소했습니다."
            exit 0
        fi
    fi
fi

# ─────────────────────────────────────────────────────────────────
# 3. 소스 아카이빙 및 파일 패키징
# ─────────────────────────────────────────────────────────────────
echo -e "\n[STEP] 배포 아카이브를 생성합니다..."

TEMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t 'todays-detective')
trap 'rm -rf "$TEMP_DIR"' EXIT

FILES_TO_SCP=()

# Web 패키징
if [[ "$TARGET" == "all" || "$TARGET" == "web" ]]; then
    echo "  - Web 프론트엔드 아카이브 생성 중 (git archive)..."
    git archive --format=tar -o "$TEMP_DIR/web.tar" HEAD \
        .dockerignore Dockerfile app public next.config.ts package.json \
        package-lock.json postcss.config.mjs tailwind.config.ts tsconfig.json eslint.config.mjs
    FILES_TO_SCP+=("$TEMP_DIR/web.tar")
fi

# Server 패키징
if [[ "$TARGET" == "all" || "$TARGET" == "api" ]]; then
    echo "  - Server 백엔드 아카이브 생성 중 (git archive)..."
    git archive --format=tar -o "$TEMP_DIR/server.tar" HEAD server
    FILES_TO_SCP+=("$TEMP_DIR/server.tar")
fi

# Infra 파일 준비
if [[ "$TARGET" == "all" || "$TARGET" == "infra" ]]; then
    echo "  - 인프라 설정 파일 준비 중..."
    cp "$SCRIPT_DIR/infra/docker-compose.yml" "$TEMP_DIR/docker-compose.yml"
    cp "$SCRIPT_DIR/infra/mongo-init/01-app-user.sh" "$TEMP_DIR/01-app-user.sh"
    cp "$SCRIPT_DIR/infra/minio-init/init.sh" "$TEMP_DIR/minio-init.sh"

    FILES_TO_SCP+=(
        "$TEMP_DIR/docker-compose.yml"
        "$TEMP_DIR/01-app-user.sh"
        "$TEMP_DIR/minio-init.sh"
    )
fi

# ─────────────────────────────────────────────────────────────────
# 4. 파일 전송 (SCP)
# ─────────────────────────────────────────────────────────────────
echo -e "\n[STEP] unraid 서버(/tmp/)로 파일을 전송합니다..."
scp "${FILES_TO_SCP[@]}" "$HOSTNAME:/tmp/"
echo "[SUCCESS] 파일 전송 완료"

# ─────────────────────────────────────────────────────────────────
# 5. 원격 배포, 디렉터리 스왑 및 Docker 기동
# ─────────────────────────────────────────────────────────────────
echo -e "\n[STEP] unraid 서버에서 소스 교체 및 컨테이너 빌드를 실행합니다..."

ssh "$HOSTNAME" "bash -s" << EOF
set -e
B="$REMOTE_PATH"
TARGET="$TARGET"
C="\$B/compose/docker-compose.yml"
O="/boot/config/plugins/compose.manager/projects/todays-detective/docker-compose.override.yml"

# 인프라 파일 반영
if [ "\$TARGET" = "all" ] || [ "\$TARGET" = "infra" ]; then
    echo ">> 인프라 파일 갱신 중..."
    mkdir -p "\$B/compose" "\$B/mongo/init" "\$B/minio-init"
    [ -f /tmp/docker-compose.yml ] && cp -f /tmp/docker-compose.yml "\$B/compose/docker-compose.yml"
    [ -f /tmp/01-app-user.sh ] && cp -f /tmp/01-app-user.sh "\$B/mongo/init/01-app-user.sh"
    [ -f /tmp/minio-init.sh ] && cp -f /tmp/minio-init.sh "\$B/minio-init/init.sh"
    chmod 755 "\$B/mongo/init/"*.sh "\$B/minio-init/"*.sh 2>/dev/null || true
    [ -f "\$B/compose/.env" ] && chmod 600 "\$B/compose/.env"
    rm -f /tmp/docker-compose.yml /tmp/01-app-user.sh /tmp/minio-init.sh
fi

# Web 교체 (롤백 2세대 보관)
if [ "\$TARGET" = "all" ] || [ "\$TARGET" = "web" ]; then
    echo ">> Web 소스 교체 중..."
    rm -rf "\$B/web.new" && mkdir -p "\$B/web.new"
    tar -xf /tmp/web.tar -C "\$B/web.new"
    rm -f /tmp/web.tar

    rm -rf "\$B/web.prev2"
    [ -d "\$B/web.prev" ] && mv "\$B/web.prev" "\$B/web.prev2"
    [ -d "\$B/web" ] && mv "\$B/web" "\$B/web.prev"
    mv "\$B/web.new" "\$B/web"
fi

# Server 교체 (롤백 2세대 보관)
if [ "\$TARGET" = "all" ] || [ "\$TARGET" = "api" ]; then
    echo ">> Server 소스 교체 중..."
    rm -rf "\$B/server.new" && mkdir -p "\$B/server.new"
    tar -xf /tmp/server.tar -C "\$B/server.new" --strip-components=1
    rm -f /tmp/server.tar

    rm -rf "\$B/server.prev2"
    [ -d "\$B/server.prev" ] && mv "\$B/server.prev" "\$B/server.prev2"
    [ -d "\$B/server" ] && mv "\$B/server" "\$B/server.prev"
    mv "\$B/server.new" "\$B/server"
fi

# Docker Compose 빌드 및 기동
COMPOSE_ARGS="-f \$C"
if [ -f "\$O" ]; then
    COMPOSE_ARGS="\$COMPOSE_ARGS -f \$O"
fi

BUILD_SERVICES=""
if [ "\$TARGET" = "all" ]; then
    BUILD_SERVICES="todays-detective-api todays-detective-web"
elif [ "\$TARGET" = "web" ]; then
    BUILD_SERVICES="todays-detective-web"
elif [ "\$TARGET" = "api" ]; then
    BUILD_SERVICES="todays-detective-api"
fi

if [ -n "\$BUILD_SERVICES" ]; then
    echo ">> 컨테이너 빌드 중 (\$BUILD_SERVICES)..."
    docker compose \$COMPOSE_ARGS -p todays-detective build \$BUILD_SERVICES
fi

echo ">> 서비스 기동 중..."
docker compose \$COMPOSE_ARGS -p todays-detective up -d
EOF

echo "[SUCCESS] 원격 빌드 및 기동 완료"

# ─────────────────────────────────────────────────────────────────
# 6. 배포 후 헬스체크 및 검증
# ─────────────────────────────────────────────────────────────────
if [[ "$SKIP_VERIFY" -eq 0 ]]; then
    echo -e "\n[STEP] 배포 상태 및 헬스체크를 진행합니다..."
    sleep 3

    ssh "$HOSTNAME" "bash -s" << 'EOF'
echo "--- [컨테이너 상태] ---"
docker ps --filter "name=todays-detective" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "--- [HTTP 응답 검증] ---"
WEB_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://172.17.0.1:3100/ || echo "000")
API_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://172.17.0.1:3100/server/healthz || echo "000")

echo "Web Root (172.17.0.1:3100/): HTTP $WEB_CODE"
echo "API Health (172.17.0.1:3100/server/healthz): HTTP $API_CODE"

if [ "$WEB_CODE" = "200" ] && [ "$API_CODE" = "200" ]; then
    echo "VERIFY_ALL_OK"
else
    echo "VERIFY_WARNING"
fi
EOF
fi

echo -e "\n========================================================"
echo " [배포 완료] Today's Detective 배포가 성공적으로 끝났습니다."
echo " 문제 발생 시: ./deploy.sh --rollback 명령으로 이전 버전 복원 가능"
echo "========================================================"

