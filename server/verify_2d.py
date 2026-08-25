# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# Phase 2-D 무료 검증. Gemini를 호출하지 않는다.
#   - 라우트 등록 확인
#   - 평가 응답 파싱 (실제 Gemini 출력 형태를 픅스처로 사용)
#   - 에러 경로 (잘못된 id, 없는 시나리오, 없는 용의자, 검증 실패)
#   - 심문 프롬프트 조립 형태

import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
fails = []


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
        with urllib.request.urlopen(req, timeout=20) as r:
            # dict()로 변환하면 헤더의 대소문자 무관 조회가 사라진다. Message 객체를 그대로 반환한다.
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
for p, m in sorted(paths.items()):
    print("   ", p, m)
for want, meth in [
    ("/api/game/start", "POST"), ("/api/game/chat", "POST"),
    ("/api/game/evaluate", "POST"), ("/api/game/feedback", "POST"),
    ("/api/game/scenario/{scenario_id}", "GET"),
]:
    check("%s %s 등록" % (meth, want), want in paths and meth in paths[want])

print()
print("=" * 70)
print("2) 평가 응답 파싱 (실제 Gemini 출력 형태 픅스처, 무료)")
print("=" * 70)
from app.routers.game import (  # noqa: E402
    _ADVICE_RE, _FALLBACK_ADVICE, _FALLBACK_GRADE, _FALLBACK_REPORT,
    _GRADE_RE, _REPORT_RE,
)

def parse(text):
    g, r, a = _GRADE_RE.search(text), _REPORT_RE.search(text), _ADVICE_RE.search(text)
    grade = (g.group(1).strip() if g else _FALLBACK_GRADE).split("\n", 1)[0].strip()
    return (grade,
            r.group(1).strip() if r else _FALLBACK_REPORT,
            a.group(1).strip() if a else _FALLBACK_ADVICE)

NORMAL = """[JUDGMENT]
성공

[GRADE]
A

[REPORT]
탐정님의 추리는 정확했습니다. 집사의 알리바이 모순을 젖은 우산으로 입증한 점이 결정적이었습니다.
다만 범행 동기에 대한 언급이 다소 부족했습니다.

[ADVICE]
아쉬운 점: 유언장의 존재를 물어봤어야 했다, 창문 잠금 상태를 확인해야 했다.
"""
grade, report, advice = parse(NORMAL)
check("정상 응답 등급", grade == "A", repr(grade))
check("보고서 본문 추출", report.startswith("탐정님의 추리는") and "동기에 대한 언급" in report)
check("보고서에 [ADVICE] 미포함", "[ADVICE]" not in report)
check("조언 추출", advice.startswith("아쉬운 점:"), repr(advice[:30]))

# 대괄호 안에 부가 문자가 붙는 변형 — 정규식의 [^\]]* 가 이를 흡수한다
VARIANT = "[GRADE: 등급]\nS\n\n[REPORT - 보고서]\n본문입니다.\n\n[ADVICE(조언)]\n없음\n"
g2, r2, a2 = parse(VARIANT)
check("대괄호 변형 등급", g2 == "S", repr(g2))
check("대괄호 변형 보고서", r2 == "본문입니다.", repr(r2))
check("대괄호 변형 조언", a2 == "없음", repr(a2))

# 등급이 같은 줄에 오는 경우
check("등급 같은 줄", parse("[GRADE] B\n\n[REPORT]\nx\n")[0] == "B")
# 등급 뒤에 설명이 붙는 경우 — 첫 줄만 취해야 한다
check("등급 첫 줄만 취함", parse("[GRADE]\nC\n이유는 논리 비약\n\n[REPORT]\nx")[0] == "C")
# ADVICE 없음
check("ADVICE 누락 시 폴백", parse("[GRADE]\nF\n\n[REPORT]\n실패")[2] == _FALLBACK_ADVICE)
# 완전히 형식을 벗어난 응답
g3, r3, a3 = parse("죄송합니다, 평가할 수 없습니다.")
check("형식 이탈 시 F 폴백", g3 == _FALLBACK_GRADE, repr(g3))
check("형식 이탈 시 보고서 폴백", r3 == _FALLBACK_REPORT, repr(r3))
check("형식 이탈 시 조언 폴백", a3 == _FALLBACK_ADVICE)

print()
print("=" * 70)
print("3) 에러 경로 (DB 접근만, Gemini 호출 없음)")
print("=" * 70)
st, bd, _ = call("POST", "/api/game/chat",
                 {"scenarioId": "not-an-objectid", "suspectId": 1, "message": "안녕"})
check("잘못된 id → 400 Invalid scenario id",
      st == 400 and bd.get("detail") == "Invalid scenario id", "%s %s" % (st, bd))

st, bd, _ = call("POST", "/api/game/chat",
                 {"scenarioId": "0" * 24, "suspectId": 1, "message": "안녕"})
check("없는 시나리오 → 404 Scenario not found",
      st == 404 and bd.get("detail") == "Scenario not found", "%s %s" % (st, bd))

st, bd, _ = call("GET", "/api/game/scenario/not-an-objectid")
check("정화 조회 잘못된 id → 400", st == 400 and bd.get("detail") == "Invalid scenario id",
      "%s %s" % (st, bd))
st, bd, _ = call("GET", "/api/game/scenario/" + "0" * 24)
check("정화 조회 없는 시나리오 → 404", st == 404, "%s %s" % (st, bd))

st, bd, _ = call("POST", "/api/game/chat", {"scenarioId": "0" * 24, "suspectId": 1, "message": "  "})
check("빈 메시지 → 422", st == 422, str(st))
st, bd, _ = call("POST", "/api/game/evaluate",
                 {"scenarioId": "0" * 24, "deductionData": {"culpritName": "x", "reasoning": ""}})
check("빈 추리 → 422", st == 422, str(st))
st, bd, _ = call("POST", "/api/game/feedback", {"content": "가" * 301})
check("301자 피드백 → 422", st == 422, str(st))

print()
print("=" * 70)
print("4) 피드백 저장 (Gemini 호출 없음, DB 쓰기)")
print("=" * 70)
st, bd, _ = call("POST", "/api/game/feedback", {
    "content": "2-D 검증용 피드백", "scenarioId": "abc", "grade": "A",
    "gameResult": {"scenarioTitle": "검증", "selectedSuspectId": 2,
                   "selectedSuspectName": "김서준", "isCorrect": True,
                   "grade": "A", "timeTaken": "07:31"},
})
check("피드백 저장 200 + ok", st == 200 and bd.get("ok") is True, "%s %s" % (st, bd))
fb_id = bd.get("_id")
check("_id 반환", bool(fb_id), str(fb_id))

if fb_id:
    from app import db as appdb  # noqa: E402
    from bson import ObjectId  # noqa: E402
    doc = appdb.get_feedbacks().find_one({"_id": ObjectId(fb_id)})
    check("DB에 snake_case로 저장", doc["game_result"]["selected_suspect_id"] == 2,
          str(doc["game_result"]))
    check("created_at 기록", doc.get("created_at") is not None)
    appdb.get_feedbacks().delete_one({"_id": ObjectId(fb_id)})
    print("   (검증용 피드백 삭제 완료)")

print()
print("=" * 70)
print("실패 %d건 %s" % (len(fails), fails if fails else ""))
print("=" * 70)
raise SystemExit(1 if fails else 0)
