#!/bin/sh
# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# Mongo 초기화 상태 검증. 컨테이너 내부에서 실행되며 비밀값을 출력하지 않는다.
set -eu

mongosh --quiet \
  -u "$MONGO_INITDB_ROOT_USERNAME" \
  -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --eval '
    const dbs = db.adminCommand({ listDatabases: 1 }).databases.map(d => d.name);
    print("데이터베이스 목록: " + dbs.join(", "));

    const td = db.getSiblingDB("todays_detective");
    print("");
    print("[todays_detective]");
    print("  컬렉션: " + (td.getCollectionNames().join(", ") || "(없음)"));
    const users = td.getUsers().users.map(u => u.user + " roles=" + JSON.stringify(u.roles.map(r => r.role + "@" + r.db)));
    print("  사용자: " + (users.join(" | ") || "(없음)"));
    ["scenarios", "feedbacks"].forEach(function (c) {
      if (td.getCollectionNames().includes(c)) {
        print("  " + c + " 인덱스: " + td.getCollection(c).getIndexes().map(i => i.name).join(", "));
      }
    });

    const t = db.getSiblingDB("test");
    print("");
    print("[test] (여기에 컬렉션이 있으면 초기화 스크립트가 잘못된 DB에 쓴 것)");
    print("  컬렉션: " + (t.getCollectionNames().join(", ") || "(없음)"));
  '
