# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# Phase 2-C 검증. Gemini 호출 없음 — 전부 무료.
#
# 핵심: 새 sanitize.sanitize_case_data가 Lambda 원문 _sanitize_case_data와
#       **동일한 출력**을 내는지 직접 비교한다. 눈으로 읽어 확인하는 것으로는 부족하다.

import json

# ── Lambda 원문 구현을 그대로 복사해 기준(oracle)으로 삼는다 ──────────
_L_TOP = ("solution", "timeline_truth", "truth")
_L_SUSPECT = ("isCulprit", "secret", "real_action", "motive", "trick")


def lambda_sanitize(case_data):
    sanitized = {k: v for k, v in case_data.items() if k not in _L_TOP}
    suspects = sanitized.get("suspects") or []
    sanitized["suspects"] = [
        {k: v for k, v in s.items() if k not in _L_SUSPECT} for s in suspects
    ]
    return sanitized


from app import sanitize  # noqa: E402
from app.models import (  # noqa: E402
    FeedbackRequest,
    game_result_from_db,
    game_result_to_db,
)

FULL_CASE = {
    "title": "폭우 속의 밀실",
    "summary": "저택 서재에서 주인이 숨진 채 발견됐다.",
    "crime_type": "살인",
    "world_setting": {"location": "2층 저택의 서재", "weather": "폭우로 고립됨"},
    "victim_info": {
        "name": "박会장",
        "damage_details": "둔기에 의한 후두부 손상",
        "body_condition": "책상에 엎드린 상태",
        "incident_time": "22:10경",
    },
    "evidence_list": [{"name": "젖은 우산", "description": "현관에 놓인 마르지 않은 우산"}],
    "timeline_truth": ["21:00 - 만찬 종료", "22:10 - 서재 불이 꺼짐"],
    "suspects": [
        {
            "id": 1,
            "name": "이하늘",
            "role": "조카",
            "gender": "Female",
            "age": 29,
            "personality": "신경질적인",
            "image_prompt_keywords": "long hair, sharp eyes",
            "secret": "도박 빚이 있다",
            "isCulprit": False,
            "real_action": "22:00에 2층 침실에 있었다",
            "alibi_claim": "방에서 자고 있었다",
        },
        {
            "id": 2,
            "name": "김서준",
            "role": "집사",
            "gender": "Male",
            "age": 47,
            "personality": "침착한",
            "image_prompt_keywords": "slicked back hair",
            "secret": "유언장을 미리 봤다",
            "isCulprit": True,
            "motive": "해고 통보를 받았다",
            "trick": "우산으로 창을 밖에서 잠갔다",
            "real_action": "22:10에 서재로 들어갔다",
            "alibi_claim": "주방에서 은식기를 닦았다",
            "portraitImage": "https://cdn.example.com/todays-detective/portraits/x.jpg",
        },
    ],
    "solution": "집사 김서준이 해고에 분노해 범행했다.",
}

fails = []


def check(label, ok, detail=""):
    print("  %s %s%s" % ("✓" if ok else "✗", label, (" — " + detail) if detail else ""))
    if not ok:
        fails.append(label)


print("=" * 70)
print("1) Lambda 원문과 출력 동일성 (핵심)")
print("=" * 70)
mine = sanitize.sanitize_case_data(FULL_CASE)
oracle = lambda_sanitize(FULL_CASE)
same = json.dumps(mine, sort_keys=True, ensure_ascii=False) == json.dumps(
    oracle, sort_keys=True, ensure_ascii=False
)
check("정화 결과가 Lambda 원문과 완전히 동일", same)
if not same:
    print("    mine  :", json.dumps(mine, sort_keys=True, ensure_ascii=False)[:400])
    print("    oracle:", json.dumps(oracle, sort_keys=True, ensure_ascii=False)[:400])

print()
print("=" * 70)
print("2) 스포일러 제거 확인")
print("=" * 70)
leaks = sanitize.assert_no_spoilers(mine)
check("스포일러 잔존 0건", not leaks, str(leaks))
for f in ("solution", "timeline_truth", "truth"):
    check("최상위 '%s' 제거됨" % f, f not in mine)
s2 = mine["suspects"][1]
for f in ("isCulprit", "secret", "real_action", "motive", "trick"):
    check("suspect '%s' 제거됨" % f, f not in s2)

print()
print("=" * 70)
print("3) 프론트가 필요한 필드는 살아남아야 한다")
print("=" * 70)
for f in ("title", "summary", "crime_type", "world_setting", "victim_info", "evidence_list", "suspects"):
    check("최상위 '%s' 유지" % f, f in mine)
for f in ("id", "name", "role", "gender", "age", "personality", "alibi_claim", "portraitImage"):
    check("suspect '%s' 유지" % f, f in s2)

print()
print("=" * 70)
print("4) 원본 불변성 + 진범 조회")
print("=" * 70)
check("원본 case_data가 변경되지 않음", "solution" in FULL_CASE and "isCulprit" in FULL_CASE["suspects"][1])
culprit = sanitize.find_culprit(FULL_CASE)
check("find_culprit이 진범을 찾음", culprit is not None and culprit["name"] == "김서준",
      culprit["name"] if culprit else "None")
check("정화본에서는 진범을 찾을 수 없음", sanitize.find_culprit(mine) is None)

print()
print("=" * 70)
print("5) 경계 조건")
print("=" * 70)
check("suspects 없음", sanitize.sanitize_case_data({"title": "x"})["suspects"] == [])
check("suspects가 None", sanitize.sanitize_case_data({"suspects": None})["suspects"] == [])
check("suspects에 dict 아닌 값 섞임",
      sanitize.sanitize_case_data({"suspects": ["문자열", {"id": 1, "secret": "s"}]})["suspects"]
      == [{"id": 1}])

print()
print("=" * 70)
print("6) 피드백 필드 매핑 왕복")
print("=" * 70)
req = FeedbackRequest.model_validate({
    "content": "  재밌었어요  ",
    "scenarioId": "abc123",
    "grade": "A",
    "gameResult": {
        "scenarioTitle": "폭우 속의 밀실", "selectedSuspectId": 2,
        "selectedSuspectName": "김서준", "reasoning": "집사가 범인",
        "isCorrect": True, "grade": "A", "culpritName": "김서준",
        "report": "보고서", "advice": "없음", "timeTaken": "07:31",
    },
})
check("content 앞뒤 공백 제거", req.content == "재밌었어요", repr(req.content))
db_doc = game_result_to_db(req.gameResult)
check("DB 저장은 snake_case 10필드",
      sorted(db_doc.keys()) == sorted(["scenario_title", "selected_suspect_id",
                                       "selected_suspect_name", "reasoning", "is_correct",
                                       "grade", "culprit_name", "report", "advice", "time_taken"]),
      str(sorted(db_doc.keys())))
check("selected_suspect_id 값 유지", db_doc["selected_suspect_id"] == 2)
back = game_result_from_db(db_doc)
check("왕복 후 camelCase 복원", back["selectedSuspectName"] == "김서준" and back["timeTaken"] == "07:31")
check("game_result_from_db(None) → None", game_result_from_db(None) is None)
check("game_result_to_db(None) → None", game_result_to_db(None) is None)

for bad, why in [("", "빈 문자열"), ("   ", "공백만"), ("가" * 301, "301자")]:
    try:
        FeedbackRequest.model_validate({"content": bad})
        check("%s 거부" % why, False, "통과되어 버렸다")
    except Exception:
        check("%s 거부" % why, True)
check("300자는 허용", FeedbackRequest.model_validate({"content": "가" * 300}).content == "가" * 300)

print()
print("=" * 70)
print("실패 %d건 %s" % (len(fails), fails if fails else ""))
print("=" * 70)
raise SystemExit(1 if fails else 0)
