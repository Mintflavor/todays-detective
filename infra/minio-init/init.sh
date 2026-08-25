#!/bin/sh
# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# MinIO 버킷 초기화. 스택이 올라올 때마다 실행되며 멱등하다.
# - 버킷 생성
# - portraits/ 프리픽스에만 익명 read 부여 (버킷 전체 공개 금지)
set -eu

ENDPOINT="http://todays-detective-minio:9000"
BUCKET="${MINIO_BUCKET:-todays-detective}"

echo "[minio-init] MinIO 기동 대기..."
i=0
until mc alias set local "$ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "[minio-init] 60초 내에 MinIO에 접속하지 못했습니다." >&2
    exit 1
  fi
  sleep 2
done
echo "[minio-init] 접속 성공."

# -p: 이미 있으면 에러를 내지 않는다.
mc mb -p "local/${BUCKET}"
echo "[minio-init] 버킷 확인/생성: ${BUCKET}"

# 초상화만 공개한다. 버킷 루트에는 정책을 주지 않으므로 객체 목록이 노출되지 않는다.
mc anonymous set download "local/${BUCKET}/portraits"
echo "[minio-init] portraits/ 익명 read 부여 완료."

echo "[minio-init] --- 현재 정책 ---"
mc anonymous list "local/${BUCKET}"

echo "[minio-init] 완료."
