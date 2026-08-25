#!/bin/sh
# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# MinIO 검증용 테스트 객체를 portraits/ 에 올린다. minio 컨테이너 내부에서 실행한다.
# 이미지에 mc가 포함되어 있지만 내장 `local` 별칭에는 자격증명이 없으므로
# (mc ready 같은 무인증 명령만 가능) 여기서 root 자격증명으로 별칭을 새로 설정한다.
set -eu

BUCKET="todays-detective"
KEY="portraits/_verify.jpg"

mc alias set verify http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null

# 최소 유효 JPEG 헤더/푸터만 담은 더미 파일
printf '\377\330\377\341\000\020Exif\000\000\377\331' > /tmp/_verify.jpg

mc cp --attr "Cache-Control=public, max-age=31536000, immutable" \
      /tmp/_verify.jpg "verify/${BUCKET}/${KEY}"

echo "--- 업로드 결과 ---"
mc ls "verify/${BUCKET}/portraits/"
echo "--- 객체 메타 ---"
mc stat "verify/${BUCKET}/${KEY}" | grep -iE "name|size|type|cache"
