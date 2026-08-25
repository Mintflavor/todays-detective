#!/bin/bash
# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# MongoDB 일일 덤프. unraid의 User Scripts 플러그인이나 cron에서 호출한다.
#
# 컨테이너 파일을 그대로 복사하는 백업(CA Appdata Backup)만으로는 Mongo 정합성이
# 보장되지 않는다. mongodump로 논리 백업을 따로 남긴다.
#
# 사용:
#   /mnt/user/appdata/todays-detective/backup-mongo.sh
#
# 보관 정책: 최근 14개만 남기고 오래된 것부터 삭제한다.
set -euo pipefail

BASE=/mnt/user/appdata/todays-detective
OUT_DIR="$BASE/backup"
KEEP=14
CONTAINER=todays-detective-mongo

# 컨테이너가 안 떠 있으면 조용히 성공 처리한다 (스택 정지 중 cron이 도는 경우).
if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "[backup] $CONTAINER 가 실행 중이 아닙니다. 건너뜁니다."
  exit 0
fi

STAMP=$(date +%Y%m%d-%H%M%S)
ARCHIVE="mongo-$STAMP.gz"

mkdir -p "$OUT_DIR"

# 자격증명은 컨테이너 환경변수에서 읽는다 — 이 스크립트에 비밀값을 두지 않는다.
# --archive 를 stdout으로 받아 호스트에 쓴다 (컨테이너 안에 임시 파일을 남기지 않는다).
echo "[backup] mongodump 시작: $ARCHIVE"
docker exec "$CONTAINER" sh -c '
  mongodump --quiet \
    --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --db todays_detective \
    --archive --gzip
' > "$OUT_DIR/$ARCHIVE"

SIZE=$(du -h "$OUT_DIR/$ARCHIVE" | cut -f1)
echo "[backup] 완료: $OUT_DIR/$ARCHIVE ($SIZE)"

# 빈 파일이면 실패로 본다 (덤프가 조용히 실패하는 경우 방지).
if [ ! -s "$OUT_DIR/$ARCHIVE" ]; then
  echo "[backup] 오류: 덤프 파일이 비어 있습니다." >&2
  rm -f "$OUT_DIR/$ARCHIVE"
  exit 1
fi

# 오래된 백업 정리
COUNT=$(ls -1 "$OUT_DIR"/mongo-*.gz 2>/dev/null | wc -l)
if [ "$COUNT" -gt "$KEEP" ]; then
  ls -1t "$OUT_DIR"/mongo-*.gz | tail -n +$((KEEP + 1)) | while read -r old; do
    echo "[backup] 오래된 백업 삭제: $(basename "$old")"
    rm -f "$old"
  done
fi

echo "[backup] 보관 중: $(ls -1 "$OUT_DIR"/mongo-*.gz | wc -l)개"
