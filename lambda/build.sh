#!/usr/bin/env bash
# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# Lambda 배포 zip 빌드 스크립트.
# - arm64 + python3.12 runtime에 맞춰 Docker로 wheel을 설치한다 (Pillow 등 native 의존성 대응)
# - package/ 를 재생성하고 소스 .py를 같이 담아 function.zip 을 만든다.
set -euo pipefail

cd "$(dirname "$0")"

echo "[1/4] Cleaning previous build..."
rm -rf package function.zip
mkdir -p package

echo "[2/4] Installing dependencies into package/ with Docker (linux/arm64)..."
docker run --rm \
  --platform linux/arm64 \
  -v "$PWD":/var/task \
  -w /var/task \
  public.ecr.aws/sam/build-python3.12:latest-arm64 \
  pip install --no-cache-dir -r requirements.txt -t package/

echo "[3/4] Copying source files into package/..."
cp handler.py gemini_client.py prompts.py s3_upload.py package/

echo "[4/4] Creating function.zip..."
(cd package && zip -qr ../function.zip .)

echo "Done. $(ls -lh function.zip | awk '{print $5}')"
