# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# Phase 2-D 통합 검증. ⚠️ 실제 Gemini를 호출한다 (과금).
#   사건 생성 1회(텍스트 + 이미지 3장) + 심문 1회 + 평가 1회 ≈ $0.12
#
# 생성된 시나리오는 삭제하지 않는다 — "지난 사건 기록"의 첫 데이터로 남겨 Phase 3에서 쓴다.

import json
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
fails = []


def check(label, ok, detail=""):
    print("  %s %s%s" % ("✓" if ok else "✗", label, (" — " + detail) if detail else ""))
    if not ok:
        fails.append(label)


def call(method, path, body=None, timeout=300):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"Content-Type": "application/json"} if data else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            # dict()로 변환하면 헤더의 대소문자 무관 조회가 사라진다. Message 객체를 그대로 반환한다.
            return r.status, json.loads(r.read().decode()), r.headers
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw), e.headers
        except Exception:
            return e.code, raw, e.headers


print("=" * 70)
print("1) POST /api/game/start — 실제 사건 생성 (과금)")
print("=" * 70)
t0 = time.time()
st, body, _ = call("POST", "/api/game/start")
elapsed = time.time() - t0
print("  소요 시간: %.1f초" % elapsed)
check("HTTP 200", st == 200, str(body)[:300])
if st != 200:
    raise SystemExit(1)

sid = body["scenarioId"]
case = body["caseData"]
print("  scenarioId :", sid)
print("  제목       :", case.get("title"))
print("  범죄 유형  :", case.get("crime_type"))
print("  요약       :", (case.get("summary") or "")[:80])

print()
print("  --- 스포일러 정화 (가장 중요) ---")
from app.sanitize import assert_no_spoilers  # noqa: E402

leaks = assert_no_spoilers(case)
check("응답에 스포일러 0건", not leaks, str(leaks))
for f in ("solution", "timeline_truth", "truth"):
    check("최상위 '%s' 없음" % f, f not in case)

print()
print("  --- 용의자 ---")
suspects = case.get("suspects") or []
check("용의자 3명", len(suspects) == 3, str(len(suspects)))
for s in suspects:
    has_img = bool(s.get("portraitImage"))
    print("   id=%s %s (%s, %s세) 초상화=%s" % (
        s.get("id"), s.get("name"), s.get("role"), s.get("age"), "O" if has_img else "X"))
    for f in ("isCulprit", "secret", "real_action", "motive", "trick"):
        if f in s:
            check("suspect %s에 '%s' 누출" % (s.get("id"), f), False)
    check("suspect %s alibi_claim 존재" % s.get("id"), bool(s.get("alibi_claim")))
n_img = sum(1 for s in suspects if s.get("portraitImage"))
check("초상화 3장 생성", n_img == 3, "%d장" % n_img)

print()
print("=" * 70)
print("2) DB 원본은 정화되지 않아야 한다 (평가에 정답이 필요)")
print("=" * 70)
from bson import ObjectId  # noqa: E402

from app import db as appdb  # noqa: E402

doc = appdb.get_scenarios().find_one({"_id": ObjectId(sid)})
raw_case = doc["case_data"]
check("DB에 solution 보존", bool(raw_case.get("solution")))
culprit = next((s for s in raw_case["suspects"] if s.get("isCulprit")), None)
check("DB에 isCulprit 보존", culprit is not None)
check("진범이 정확히 1명",
      sum(1 for s in raw_case["suspects"] if s.get("isCulprit")) == 1)
check("진범에 motive/trick 존재",
      bool(culprit.get("motive")) and bool(culprit.get("trick")))
check("title/summary/crime_type 컬럼 저장",
      bool(doc.get("title")) and bool(doc.get("crime_type")))
check("created_at 기록", doc.get("created_at") is not None)
print("  (진범: %s — 이 값은 클라이언트 응답에 없었다)" % culprit.get("name"))

print()
print("=" * 70)
print("3) 초상화 URL 실제 접근 (익명, MinIO)")
print("=" * 70)
from app.config import get_settings  # noqa: E402

s0 = get_settings()
url = suspects[0]["portraitImage"]
print("  반환 URL :", url)
check("PUBLIC_ASSET_BASE_URL 접두어", url.startswith(s0.public_asset_base_url))
# 공개 도메인은 아직 없으므로 컨테이너에서 MinIO로 직접 확인한다.
key = url.split(s0.public_asset_base_url + "/", 1)[1]
internal = "%s/%s/%s" % (s0.s3_endpoint_url, s0.s3_bucket_name, key)
req = urllib.request.Request(internal)  # 인증 헤더 없음 = 익명
with urllib.request.urlopen(req, timeout=15) as r:
    blob = r.read()
    print("  익명 GET : HTTP %s, %d bytes, %s" % (r.status, len(blob), r.headers.get("Content-Type")))
    check("익명 접근 200", r.status == 200)
    check("Cache-Control 유지", "immutable" in (r.headers.get("Cache-Control") or ""))
import io  # noqa: E402

from PIL import Image  # noqa: E402

im = Image.open(io.BytesIO(blob))
check("512x512 정사각형", im.size == (512, 512), str(im.size))

print()
print("=" * 70)
print("4) POST /api/game/chat — 실제 심문 (과금)")
print("=" * 70)
target = suspects[0]
st, body, _ = call("POST", "/api/game/chat", {
    "scenarioId": sid, "suspectId": target["id"],
    "message": "사건 당시 어디에 있었습니까?", "history": "",
})
check("HTTP 200", st == 200, str(body)[:200])
if st == 200:
    reply = body["reply"]
    print("  %s: %s" % (target["name"], reply.strip()[:160]))
    check("응답이 비어있지 않음", bool(reply.strip()))

st, body, _ = call("POST", "/api/game/chat", {
    "scenarioId": sid, "suspectId": 999, "message": "누구세요",
})
check("없는 용의자 → 404 Suspect not found",
      st == 404 and body.get("detail") == "Suspect not found", "%s %s" % (st, body))

print()
print("=" * 70)
print("5) POST /api/game/evaluate — 실제 평가 (과금)")
print("=" * 70)
wrong = next(s for s in raw_case["suspects"] if not s.get("isCulprit"))
st, body, _ = call("POST", "/api/game/evaluate", {
    "scenarioId": sid,
    "deductionData": {"culpritName": wrong["name"],
                      "reasoning": "알리바이가 어색하고 태도가 수상했습니다.",
                      "isOverTime": False},
})
check("HTTP 200", st == 200, str(body)[:200])
if st == 200:
    print("  등급     :", body["grade"])
    print("  정답 여부:", body["isCorrect"], "(오답을 지목했으므로 False여야 한다)")
    print("  범인     :", body["culpritName"])
    print("  보고서   :", body["report"][:120])
    print("  조언     :", body["advice"][:120])
    check("오답이므로 isCorrect=False", body["isCorrect"] is False)
    check("진범 이름 반환", body["culpritName"] == culprit["name"])
    check("등급 파싱 성공 (폴백 아님)", body["grade"] in ("S", "A", "B", "C", "F"), body["grade"])
    check("보고서 파싱 성공 (폴백 아님)", body["report"] != "보고서 생성 실패")
    check("조언 파싱 성공 (폴백 아님)", body["advice"] != "조언을 불러올 수 없습니다.")
    check("truth에 정답 포함 (결과 화면용)", bool(body["truth"]) and body["truth"] != "No solution provided in case data.")
    # 스포일러 방지 규칙: 실패한 추리의 advice에 범인 이름이 없어야 한다
    if culprit["name"] in body["advice"]:
        check("실패 시 advice에 범인 이름 없음", False, "advice에 '%s' 포함" % culprit["name"])
    else:
        check("실패 시 advice에 범인 이름 없음", True)

print()
print("=" * 70)
print("6) GET /api/game/scenario/{id} — 저장된 사건 불러오기 (무료)")
print("=" * 70)
st, body, hdrs = call("GET", "/api/game/scenario/" + sid)
check("HTTP 200", st == 200, str(st))
check("Cache-Control: no-store", hdrs.get("Cache-Control") == "no-store", str(hdrs.get("Cache-Control")))
check("정화본 — 스포일러 0건", not assert_no_spoilers(body), str(assert_no_spoilers(body)))
check("초상화 URL 보존", all(s.get("portraitImage") for s in body["suspects"]))
check("제목 일치", body.get("title") == case.get("title"))

print()
print("=" * 70)
print("실패 %d건 %s" % (len(fails), fails if fails else ""))
print("생성된 시나리오 %s 는 보존한다 (Phase 3 '지난 사건 기록' 첫 데이터)" % sid)
print("=" * 70)
raise SystemExit(1 if fails else 0)
