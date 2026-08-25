# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# Phase 2-E 검증. Gemini 호출 없음 — 전부 무료.
# 2-D에서 생성해 보존한 시나리오 1건을 그대로 활용한다.

import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
fails = []
created = {"scenarios": [], "feedbacks": []}


def check(label, ok, detail=""):
    print("  %s %s%s" % ("✓" if ok else "✗", label, (" — " + detail) if detail else ""))
    if not ok:
        fails.append(label)


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"Content-Type": "application/json"} if data else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status, json.loads(r.read().decode()), r.headers
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw), e.headers
        except Exception:
            return e.code, raw, e.headers


print("=" * 70)
print("1) 라우트 등록")
print("=" * 70)
_, spec, _ = call("GET", "/openapi.json")
paths = {p: sorted(m.upper() for m in v) for p, v in spec["paths"].items()}
for p in sorted(paths):
    print("   ", p, paths[p])
for want, meth in [
    ("/scenarios", "POST"), ("/scenarios", "GET"),
    ("/scenarios/{scenario_id}", "GET"), ("/scenarios/{scenario_id}", "DELETE"),
    ("/feedbacks", "POST"), ("/feedbacks", "GET"),
    ("/feedbacks/{feedback_id}", "DELETE"),
]:
    check("%s %s" % (meth, want), want in paths and meth in paths[want])

print()
print("=" * 70)
print("2) 후행 슬래시 — 프론트가 /scenarios/ 형태로 호출한다 (리다이렉트 없이 200)")
print("=" * 70)
for path in ("/scenarios", "/scenarios/", "/feedbacks", "/feedbacks/"):
    st, bd, _ = call("GET", path)
    check("GET %s → 200" % path, st == 200, str(st))
st, bd, _ = call("GET", "/scenarios/?page=1&limit=10&crime_type=%EC%82%B4%EC%9D%B8")
check("쿼리스트링 포함 후행 슬래시 (crime_type=살인)", st == 200, str(st))
check("살인 시나리오 1건 조회", len(bd) == 1, "%d건" % len(bd))

print()
print("=" * 70)
print("3) 목록 응답 형태 — case_data 제외 + _id 문자열")
print("=" * 70)
st, items, _ = call("GET", "/scenarios")
check("HTTP 200", st == 200)
check("1건 존재 (2-D 생성분)", len(items) == 1, "%d건" % len(items))
if items:
    it = items[0]
    print("   ", json.dumps(it, ensure_ascii=False)[:200])
    check("case_data 미포함 (projection)", "case_data" not in it)
    check("_id가 문자열", isinstance(it.get("_id"), str))
    check("title/summary/crime_type/created_at 포함",
          all(k in it for k in ("title", "summary", "crime_type", "created_at")))
    sid = it["_id"]

print()
print("=" * 70)
print("4) 클램프 동작 — Lambda는 거부하지 않고 클램프했다")
print("=" * 70)
st, bd, _ = call("GET", "/scenarios?page=0&limit=999")
check("page=0, limit=999 → 200 (거부 아님)", st == 200, str(st))
check("limit이 50으로 클램프 (결과 <= 50)", len(bd) <= 50, "%d건" % len(bd))
st, bd, _ = call("GET", "/scenarios?page=-5&limit=0")
check("page=-5, limit=0 → 200", st == 200, str(st))
st, bd, _ = call("GET", "/scenarios?page=abc")
check("page=abc → 422 (Lambda는 500이었다)", st == 422, str(st))

print()
print("=" * 70)
print("5) GET /scenarios/{id} — ⚠️ 스포일러 원본 (관리자용)")
print("=" * 70)
st, full, _ = call("GET", "/scenarios/" + sid)
check("HTTP 200", st == 200)
check("case_data 포함", "case_data" in full)
cd = full.get("case_data", {})
check("solution 포함 (원본이므로 정상)", "solution" in cd)
check("isCulprit 포함 (원본이므로 정상)",
      any(s.get("isCulprit") is not None for s in cd.get("suspects", [])))
print("   → Phase 5.3에서 이 경로를 인증 뒤로 옮겨야 한다")
check("정화 경로와 대비: /api/game/scenario/{id}에는 solution 없음",
      "solution" not in call("GET", "/api/game/scenario/" + sid)[1])

st, bd, _ = call("GET", "/scenarios/not-an-oid")
check("잘못된 id → 400 'Invalid id' (게임 라우터는 'Invalid scenario id')",
      st == 400 and bd.get("detail") == "Invalid id", "%s %s" % (st, bd))
st, bd, _ = call("GET", "/scenarios/" + "0" * 24)
check("없는 id → 404 'Not found'", st == 404 and bd.get("detail") == "Not found",
      "%s %s" % (st, bd))

print()
print("=" * 70)
print("6) POST /scenarios — 201 + snake_case 입력")
print("=" * 70)
st, bd, _ = call("POST", "/scenarios", {
    "title": "2-E 검증용", "summary": "삭제 대상", "crime_type": "절도",
    "case_data": {"suspects": [{"id": 1, "name": "테스트"}], "solution": "정답"},
})
check("HTTP 201", st == 201, str(st))
tmp_sid = bd.get("_id")
check("_id 반환", bool(tmp_sid), str(bd))
if tmp_sid:
    created["scenarios"].append(tmp_sid)
    st, one, _ = call("GET", "/scenarios/" + tmp_sid)
    check("저장 내용 확인", one["title"] == "2-E 검증용" and one["crime_type"] == "절도")
    check("created_at 자동 기록", bool(one.get("created_at")))
    st, lst, _ = call("GET", "/scenarios?crime_type=%EC%A0%88%EB%8F%84")
    check("crime_type 필터 동작", len(lst) == 1 and lst[0]["_id"] == tmp_sid, "%d건" % len(lst))
    st, lst, _ = call("GET", "/scenarios")
    check("정렬: created_at 역순 (신규가 먼저)", lst[0]["_id"] == tmp_sid, lst[0]["title"])

print()
print("=" * 70)
print("7) POST /feedbacks — snake_case 입력 (게임 경로의 camelCase와 다르다)")
print("=" * 70)
st, bd, _ = call("POST", "/feedbacks", {
    "content": "2-E 검증 피드백", "scenario_id": sid, "grade": "B",
    "game_result": {"scenario_title": "안개 낀 해안 저택의 비극",
                    "selected_suspect_id": 3, "selected_suspect_name": "강성호",
                    "is_correct": False, "grade": "B", "time_taken": "09:12"},
})
check("HTTP 201 (게임 경로는 200)", st == 201, str(st))
fid = bd.get("_id")
check("_id 반환", bool(fid))
if fid:
    created["feedbacks"].append(fid)

st, lst, _ = call("GET", "/feedbacks")
check("목록 조회 200", st == 200)
check("1건 이상", len(lst) >= 1, "%d건" % len(lst))
if lst:
    fb = lst[0]
    print("   ", json.dumps(fb, ensure_ascii=False)[:260])
    check("_id 문자열", isinstance(fb.get("_id"), str))
    gr = fb.get("game_result") or {}
    check("game_result가 camelCase로 역매핑",
          "selectedSuspectId" in gr and "selected_suspect_id" not in gr, str(sorted(gr))[:120])
    check("역매핑 값 보존", gr.get("selectedSuspectName") == "강성호" and gr.get("timeTaken") == "09:12")
    check("camelCase 10필드 전부 존재", len(gr) == 10, "%d개" % len(gr))

for bad, why in [({"content": ""}, "빈 content"), ({"content": "가" * 301}, "301자")]:
    st, bd, _ = call("POST", "/feedbacks", bad)
    check("%s → 422" % why, st == 422, str(st))

print()
print("=" * 70)
print("8) DELETE — 에러 메시지와 응답 형태")
print("=" * 70)
st, bd, _ = call("DELETE", "/scenarios/not-an-oid")
check("잘못된 id → 400 'Invalid id'", st == 400 and bd.get("detail") == "Invalid id", str(bd))
st, bd, _ = call("DELETE", "/scenarios/" + "0" * 24)
check("없는 id → 404 'Not found'", st == 404 and bd.get("detail") == "Not found", str(bd))
st, bd, _ = call("DELETE", "/feedbacks/not-an-oid")
check("피드백 잘못된 id → 400", st == 400 and bd.get("detail") == "Invalid id", str(bd))

if created["scenarios"]:
    t = created["scenarios"][0]
    st, bd, _ = call("DELETE", "/scenarios/" + t)
    check("시나리오 삭제 200 + {deleted}", st == 200 and bd.get("deleted") == t, str(bd))
    st, _, _ = call("GET", "/scenarios/" + t)
    check("삭제 후 404", st == 404, str(st))
if created["feedbacks"]:
    t = created["feedbacks"][0]
    st, bd, _ = call("DELETE", "/feedbacks/" + t)
    check("피드백 삭제 200 + {deleted}", st == 200 and bd.get("deleted") == t, str(bd))

print()
print("=" * 70)
print("9) 최종 상태 — 2-D 생성분만 남아야 한다")
print("=" * 70)
st, lst, _ = call("GET", "/scenarios")
check("시나리오 1건 (2-D 생성분)", len(lst) == 1, "%d건" % len(lst))
st, lst, _ = call("GET", "/feedbacks")
check("피드백 0건", len(lst) == 0, "%d건" % len(lst))

print()
print("=" * 70)
print("실패 %d건 %s" % (len(fails), fails if fails else ""))
print("=" * 70)
raise SystemExit(1 if fails else 0)
