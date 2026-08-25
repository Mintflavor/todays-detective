#!/bin/bash
# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# todays_detective DB에 앱 전용 계정을 만든다.
# mongo 공식 이미지의 entrypoint는 admin DB에 root 계정만 만들기 때문에,
# 최소 권한(readWrite on todays_detective) 계정은 여기서 따로 생성한다.
#
# 이 스크립트는 /docker-entrypoint-initdb.d 에 마운트되며
# 데이터 볼륨이 비어 있는 첫 부팅에서만 실행된다.
set -euo pipefail

if [ -z "${MONGO_APP_USERNAME:-}" ] || [ -z "${MONGO_APP_PASSWORD:-}" ]; then
  echo "[init] MONGO_APP_USERNAME / MONGO_APP_PASSWORD 가 비어 있어 앱 계정 생성을 건너뜁니다." >&2
  exit 1
fi

echo "[init] todays_detective DB에 앱 계정 '${MONGO_APP_USERNAME}' 생성 중..."

mongosh --quiet \
  --username "${MONGO_INITDB_ROOT_USERNAME}" \
  --password "${MONGO_INITDB_ROOT_PASSWORD}" \
  --authenticationDatabase admin \
  <<EOF
const db = db.getSiblingDB("todays_detective");

// 재실행 시 중복 생성으로 실패하지 않도록 존재 여부를 먼저 확인한다.
const existing = db.getUser("${MONGO_APP_USERNAME}");
if (existing) {
  print("[init] 계정이 이미 존재합니다 — 건너뜁니다.");
} else {
  db.createUser({
    user: "${MONGO_APP_USERNAME}",
    pwd:  "${MONGO_APP_PASSWORD}",
    roles: [{ role: "readWrite", db: "todays_detective" }]
  });
  print("[init] 계정 생성 완료.");
}

// 컬렉션을 미리 만들어 두면 최초 조회가 빈 배열을 반환한다(에러 대신).
["scenarios", "feedbacks"].forEach(function (name) {
  if (!db.getCollectionNames().includes(name)) {
    db.createCollection(name);
    print("[init] 컬렉션 생성: " + name);
  }
});

// 목록 조회는 created_at 역순 정렬 + crime_type 필터를 쓴다.
db.scenarios.createIndex({ created_at: -1 });
db.scenarios.createIndex({ crime_type: 1, created_at: -1 });
db.feedbacks.createIndex({ created_at: -1 });
print("[init] 인덱스 생성 완료.");
EOF

echo "[init] 완료."
