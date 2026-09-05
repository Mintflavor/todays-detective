# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("all", "web", "api", "infra")]
    [string]$Target = "all",

    [Parameter()]
    [string]$HostName = "unraid",

    [Parameter()]
    [string]$RemotePath = "/mnt/user/appdata/todays-detective",

    [Parameter()]
    [switch]$Rollback,

    [Parameter()]
    [switch]$SkipCheck,

    [Parameter()]
    [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n[STEP] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

$RepoRoot = $PSScriptRoot
Set-Location $RepoRoot

Write-Host "========================================================" -ForegroundColor Magenta
Write-Host " Today's Detective - unraid 배포 스크립트" -ForegroundColor Magenta
Write-Host " 호스트: $HostName | 대상: $Target | 모드: $(if ($Rollback) { '롤백 (Rollback)' } else { '일반 배포' })" -ForegroundColor Magenta
Write-Host "========================================================" -ForegroundColor Magenta

# ─────────────────────────────────────────────────────────────────
# 1. 롤백 모드 처리
# ─────────────────────────────────────────────────────────────────
if ($Rollback) {
    Write-Step "이전 버전(prev)으로 롤백을 진행합니다..."
    
    $rollbackCmd = @"
B="$RemotePath"
C="`$B/compose/docker-compose.yml"
O="/boot/config/plugins/compose.manager/projects/todays-detective/docker-compose.override.yml"

if [ ! -d "`$B/web.prev" ] || [ ! -d "`$B/server.prev" ]; then
    echo "ERROR: 백업 디렉터리(`$B/web.prev 또는 `$B/server.prev)를 찾을 수 없습니다."
    exit 1
fi

echo ">> 롤백 디렉터리 교체 중..."
rm -rf "`$B/web.failed" "`$B/server.failed"
[ -d "`$B/web" ] && mv "`$B/web" "`$B/web.failed"
[ -d "`$B/server" ] && mv "`$B/server" "`$B/server.failed"

mv "`$B/web.prev" "`$B/web"
mv "`$B/server.prev" "`$B/server"

# 2차 백업이 있으면 1차 백업으로 승격
[ -d "`$B/web.prev2" ] && mv "`$B/web.prev2" "`$B/web.prev"
[ -d "`$B/server.prev2" ] && mv "`$B/server.prev2" "`$B/server.prev"

echo ">> Docker Compose 재빌드 및 기동 중..."
COMPOSE_ARGS="-f `$C"
[ -f "`$O" ] && COMPOSE_ARGS="`$COMPOSE_ARGS -f `$O"

docker compose `$COMPOSE_ARGS -p todays-detective build todays-detective-api todays-detective-web
docker compose `$COMPOSE_ARGS -p todays-detective up -d

echo ">> 롤백 완료."
"@

    $encoded = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($rollbackCmd))
    ssh $HostName "echo $encoded | base64 -d | bash"

    if ($LASTEXITCODE -ne 0) {
        Write-Err "롤백 작업 중 오류가 발생했습니다."
        exit $LASTEXITCODE
    }
    Write-Success "롤백이 정상적으로 완료되었습니다."
    exit 0
}

# ─────────────────────────────────────────────────────────────────
# 2. 사전 검사 (Pre-flight Checks)
# ─────────────────────────────────────────────────────────────────
if (-not $SkipCheck) {
    Write-Step "사전 연결 및 환경 상태를 점검합니다..."

    # SSH 연결 점검
    try {
        $sshTest = ssh -o BatchMode=yes -o ConnectTimeout=5 $HostName "echo SSH_OK" 2>$null
        if ($sshTest -notmatch "SSH_OK") {
            Write-Err "SSH 연결 실패: $HostName 에 접속할 수 없습니다. ~/.ssh/config 또는 SSH 키 설정을 확인하세요."
            exit 1
        }
        Write-Success "SSH 연결 확인 완료 ($HostName)"
    } catch {
        Write-Err "SSH 테스트 실행 중 예외 발생: $_"
        exit 1
    }

    # 원격 appdata 경로 및 .env 파일 확인
    $remoteEnvCheck = ssh $HostName "[ -f $RemotePath/compose/.env ] && echo ENV_OK || echo ENV_MISSING"
    if ($remoteEnvCheck -notmatch "ENV_OK") {
        Write-Err "원격 .env 파일($RemotePath/compose/.env)이 없습니다! unraid 서버의 .env 구성을 먼저 확인하세요."
        exit 1
    }
    Write-Success "원격 .env 파일 존재 확인 완료"

    # 로컬 Git 변경사항 점검
    $gitStatus = git status --porcelain
    if ($gitStatus) {
        Write-Warn "주의: 커밋되지 않은 로컬 변경사항이 있습니다."
        Write-Warn "이 스크립트는 git HEAD 커밋을 기준으로 아카이빙하므로, 커밋되지 않은 변경사항은 배포에 포함되지 않습니다."
        Write-Host "$gitStatus" -ForegroundColor DarkGray
        $confirm = Read-Host "계속 진행하시겠습니까? (y/N)"
        if ($confirm -ne 'y' -and $confirm -ne 'Y') {
            Write-Host "배포를 취소했습니다." -ForegroundColor Yellow
            exit 0
        }
    }
}

# ─────────────────────────────────────────────────────────────────
# 3. 소스 아카이빙 및 파일 패키징
# ─────────────────────────────────────────────────────────────────
Write-Step "배포 아카이브를 생성합니다..."

$tempDir = Join-Path $env:TEMP ("todays-detective-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
    $filesToScp = @()

    # Web 패키징
    if ($Target -eq "all" -or $Target -eq "web") {
        Write-Host "  - Web 프론트엔드 아카이브 생성 중 (git archive)..."
        $webTar = Join-Path $tempDir "web.tar"
        git archive --format=tar -o $webTar HEAD `
            .dockerignore Dockerfile app public next.config.ts package.json `
            package-lock.json postcss.config.mjs tailwind.config.ts tsconfig.json eslint.config.mjs
        $filesToScp += $webTar
    }

    # Server 패키징
    if ($Target -eq "all" -or $Target -eq "api") {
        Write-Host "  - Server 백엔드 아카이브 생성 중 (git archive)..."
        $serverTar = Join-Path $tempDir "server.tar"
        git archive --format=tar -o $serverTar HEAD server
        $filesToScp += $serverTar
    }

    # Infra 파일 전송 준비
    if ($Target -eq "all" -or $Target -eq "infra") {
        Write-Host "  - 인프라 설정 파일 준비 중..."
        $infraCompose = Join-Path $RepoRoot "infra\docker-compose.yml"
        $infraMongoInit = Join-Path $RepoRoot "infra\mongo-init\01-app-user.sh"
        $infraMinioInit = Join-Path $RepoRoot "infra\minio-init\init.sh"

        $tempCompose = Join-Path $tempDir "docker-compose.yml"
        $tempMongoInit = Join-Path $tempDir "01-app-user.sh"
        $tempMinioInit = Join-Path $tempDir "minio-init.sh"

        Copy-Item $infraCompose $tempCompose
        Copy-Item $infraMongoInit $tempMongoInit
        Copy-Item $infraMinioInit $tempMinioInit

        $filesToScp += $tempCompose
        $filesToScp += $tempMongoInit
        $filesToScp += $tempMinioInit
    }

    # ─────────────────────────────────────────────────────────────────
    # 4. 파일 전송 (SCP)
    # ─────────────────────────────────────────────────────────────────
    Write-Step "unraid 서버(/tmp/)로 파일을 전송합니다..."
    scp @filesToScp "${HostName}:/tmp/"
    if ($LASTEXITCODE -ne 0) {
        Write-Err "파일 전송(SCP) 실패"
        exit $LASTEXITCODE
    }
    Write-Success "파일 전송 완료"

} finally {
    Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

# ─────────────────────────────────────────────────────────────────
# 5. 원격 배포, 디렉터리 스왑 및 Docker 기동
# ─────────────────────────────────────────────────────────────────
Write-Step "unraid 서버에서 소스 교체 및 컨테이너 빌드를 실행합니다..."

$remoteDeployScript = @"
set -e
B="$RemotePath"
TARGET="$Target"
C="`$B/compose/docker-compose.yml"
O="/boot/config/plugins/compose.manager/projects/todays-detective/docker-compose.override.yml"

# 인프라 파일 반영
if [ "`$TARGET" = "all" ] || [ "`$TARGET" = "infra" ]; then
    echo ">> 인프라 파일 갱신 중..."
    mkdir -p "`$B/compose" "`$B/mongo/init" "`$B/minio-init"
    [ -f /tmp/docker-compose.yml ] && cp -f /tmp/docker-compose.yml "`$B/compose/docker-compose.yml"
    [ -f /tmp/01-app-user.sh ] && cp -f /tmp/01-app-user.sh "`$B/mongo/init/01-app-user.sh"
    [ -f /tmp/minio-init.sh ] && cp -f /tmp/minio-init.sh "`$B/minio-init/init.sh"
    chmod 755 "`$B/mongo/init/"*.sh "`$B/minio-init/"*.sh 2>/dev/null || true
    [ -f "`$B/compose/.env" ] && chmod 600 "`$B/compose/.env"
    rm -f /tmp/docker-compose.yml /tmp/01-app-user.sh /tmp/minio-init.sh
fi

# Web 교체 (롤백 2세대 보관)
if [ "`$TARGET" = "all" ] || [ "`$TARGET" = "web" ]; then
    echo ">> Web 소스 교체 중..."
    rm -rf "`$B/web.new" && mkdir -p "`$B/web.new"
    tar -xf /tmp/web.tar -C "`$B/web.new"
    rm -f /tmp/web.tar

    rm -rf "`$B/web.prev2"
    [ -d "`$B/web.prev" ] && mv "`$B/web.prev" "`$B/web.prev2"
    [ -d "`$B/web" ] && mv "`$B/web" "`$B/web.prev"
    mv "`$B/web.new" "`$B/web"
fi

# Server 교체 (롤백 2세대 보관)
if [ "`$TARGET" = "all" ] || [ "`$TARGET" = "api" ]; then
    echo ">> Server 소스 교체 중..."
    rm -rf "`$B/server.new" && mkdir -p "`$B/server.new"
    tar -xf /tmp/server.tar -C "`$B/server.new" --strip-components=1
    rm -f /tmp/server.tar

    rm -rf "`$B/server.prev2"
    [ -d "`$B/server.prev" ] && mv "`$B/server.prev" "`$B/server.prev2"
    [ -d "`$B/server" ] && mv "`$B/server" "`$B/server.prev"
    mv "`$B/server.new" "`$B/server"
fi

# Docker Compose 빌드 및 기동
COMPOSE_ARGS="-f `$C"
if [ -f "`$O" ]; then
    COMPOSE_ARGS="`$COMPOSE_ARGS -f `$O"
fi

BUILD_SERVICES=""
if [ "`$TARGET" = "all" ]; then
    BUILD_SERVICES="todays-detective-api todays-detective-web"
elif [ "`$TARGET" = "web" ]; then
    BUILD_SERVICES="todays-detective-web"
elif [ "`$TARGET" = "api" ]; then
    BUILD_SERVICES="todays-detective-api"
fi

if [ -n "`$BUILD_SERVICES" ]; then
    echo ">> 컨테이너 빌드 중 (`$BUILD_SERVICES)..."
    docker compose `$COMPOSE_ARGS -p todays-detective build `$BUILD_SERVICES
fi

echo ">> 서비스 기동 중..."
docker compose `$COMPOSE_ARGS -p todays-detective up -d
"@

$encodedScript = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteDeployScript))
ssh $HostName "echo $encodedScript | base64 -d | bash"

if ($LASTEXITCODE -ne 0) {
    Write-Err "원격 배포 중 오류가 발생했습니다."
    exit $LASTEXITCODE
}
Write-Success "원격 빌드 및 기동 완료"

# ─────────────────────────────────────────────────────────────────
# 6. 배포 후 헬스체크 및 검증
# ─────────────────────────────────────────────────────────────────
if (-not $SkipVerify) {
    Write-Step "배포 상태 및 헬스체크를 진행합니다..."
    
    Start-Sleep -Seconds 3

    $verifyScript = @'
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
'@

    $encodedVerify = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($verifyScript))
    $verifyOutput = ssh $HostName "echo $encodedVerify | base64 -d | bash"

    Write-Host $verifyOutput

    if ($verifyOutput -match "VERIFY_ALL_OK") {
        Write-Success "모든 서비스가 정상 응답(200 OK)하고 있습니다."
    } else {
        Write-Warn "일부 서비스의 응답 코드가 200이 아닙니다. 컨테이너 상태와 로그를 확인하세요."
    }
}

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host " [배포 완료] Today's Detective 배포가 성공적으로 끝났습니다." -ForegroundColor Green
Write-Host " 문제 발생 시: .\deploy.ps1 -Rollback 명령으로 이전 버전 복원 가능" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green

