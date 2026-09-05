# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 스포일러 정화 회귀 테스트.
#
# 이 파일이 깨지면 게임이 정답을 노출한다. 가장 우선순위가 높은 테스트다.

import json

import pytest

from app.sanitize import (
    SPOILER_SUSPECT_FIELDS,
    SPOILER_TOP_FIELDS,
    assert_no_spoilers,
    find_culprit,
    sanitize_case_data,
)

# ── Lambda 원문 구현. 기준(oracle)이며 절대 수정하지 않는다 ──────────
_LAMBDA_TOP = ("solution", "timeline_truth", "truth", "hidden_evidence_list")
_LAMBDA_SUSPECT = ("isCulprit", "secret", "real_action", "motive", "trick")


def lambda_sanitize(case_data):
    """lambda/handler.py의 _sanitize_case_data 원문."""
    sanitized = {k: v for k, v in case_data.items() if k not in _LAMBDA_TOP}
    suspects = sanitized.get("suspects") or []
    sanitized["suspects"] = [
        {k: v for k, v in s.items() if k not in _LAMBDA_SUSPECT} for s in suspects
    ]
    return sanitized


def _canon(obj):
    return json.dumps(obj, sort_keys=True, ensure_ascii=False)


class TestConstants:
    """상수가 Lambda 원문과 다르면 무엇이 유출될지 알 수 없다."""

    def test_top_fields_match_lambda(self):
        assert SPOILER_TOP_FIELDS == _LAMBDA_TOP

    def test_suspect_fields_match_lambda(self):
        assert SPOILER_SUSPECT_FIELDS == _LAMBDA_SUSPECT


class TestOracleParity:
    """Lambda 원문과 출력이 동일한지 — 눈으로 읽는 검토를 대체한다."""

    def test_full_case_identical(self, full_case):
        assert _canon(sanitize_case_data(full_case)) == _canon(lambda_sanitize(full_case))

    def test_minimal_case_identical(self):
        case = {"title": "x", "suspects": [{"id": 1, "secret": "s"}]}
        assert _canon(sanitize_case_data(case)) == _canon(lambda_sanitize(case))

    def test_no_suspects_identical(self):
        case = {"title": "x", "solution": "정답"}
        assert _canon(sanitize_case_data(case)) == _canon(lambda_sanitize(case))

    def test_extra_unknown_field_passes_through_identically(self):
        """스키마에 없는 필드는 경고만 하고 그대로 통과시킨다 (Lambda와 동일)."""
        case = {"title": "x", "unexpected_field": "값", "suspects": []}
        mine = sanitize_case_data(case)
        assert _canon(mine) == _canon(lambda_sanitize(case))
        assert mine["unexpected_field"] == "값"


class TestSpoilerRemoval:
    @pytest.mark.parametrize("field", SPOILER_TOP_FIELDS)
    def test_top_field_removed(self, full_case, field):
        full_case[field] = "스포일러"
        assert field not in sanitize_case_data(full_case)

    @pytest.mark.parametrize("field", SPOILER_SUSPECT_FIELDS)
    def test_suspect_field_removed(self, full_case, field):
        result = sanitize_case_data(full_case)
        assert all(field not in s for s in result["suspects"])

    def test_assert_no_spoilers_clean(self, full_case):
        assert assert_no_spoilers(sanitize_case_data(full_case)) == []

    def test_assert_no_spoilers_detects_leak(self, full_case):
        leaked = sanitize_case_data(full_case)
        leaked["solution"] = "새어나감"
        leaked["suspects"][0]["isCulprit"] = True
        leaks = assert_no_spoilers(leaked)
        assert "solution" in leaks
        assert "suspects[0].isCulprit" in leaks

    def test_culprit_not_identifiable_from_sanitized(self, full_case):
        """정화본만으로는 누가 범인인지 알 수 없어야 한다."""
        result = sanitize_case_data(full_case)
        assert find_culprit(result) is None
        # 필드 개수 차이로도 범인이 드러나지 않아야 한다
        # (범인만 motive/trick을 가지므로 제거 후 키 집합이 같아야 한다)
        key_sets = [frozenset(s.keys()) for s in result["suspects"]]
        assert len(set(key_sets)) == 1, "용의자별 키 집합이 달라 범인이 추측 가능하다"


class TestPlayerFieldsPreserved:
    """정화가 과하면 게임이 진행되지 않는다."""

    @pytest.mark.parametrize(
        "field",
        ["title", "summary", "crime_type", "world_setting", "victim_info",
         "evidence_list", "suspects"],
    )
    def test_top_field_kept(self, full_case, field):
        assert field in sanitize_case_data(full_case)

    @pytest.mark.parametrize(
        "field",
        ["id", "name", "role", "gender", "age", "personality", "alibi_claim"],
    )
    def test_suspect_field_kept(self, full_case, field):
        assert all(field in s for s in sanitize_case_data(full_case)["suspects"])

    def test_portrait_image_kept(self, full_case):
        for s in full_case["suspects"]:
            s["portraitImage"] = "https://cdn.example.com/x.jpg"
        assert all(
            s["portraitImage"] for s in sanitize_case_data(full_case)["suspects"]
        )

    def test_suspect_count_preserved(self, full_case):
        assert len(sanitize_case_data(full_case)["suspects"]) == 3


class TestImmutability:
    def test_original_untouched(self, full_case):
        sanitize_case_data(full_case)
        assert full_case["solution"] == "집사 김서준이 해고에 분노해 범행했다."
        assert full_case["suspects"][1]["isCulprit"] is True
        assert full_case["suspects"][1]["motive"] == "해고 통보를 받았다"

    def test_nested_dict_not_shared_for_suspects(self, full_case):
        """suspect dict은 새로 만들어져야 한다 (원본 오염 방지)."""
        result = sanitize_case_data(full_case)
        result["suspects"][0]["name"] = "변경됨"
        assert full_case["suspects"][0]["name"] == "이하늘"


class TestEdgeCases:
    def test_missing_suspects_key(self):
        assert sanitize_case_data({"title": "x"})["suspects"] == []

    def test_suspects_none(self):
        assert sanitize_case_data({"suspects": None})["suspects"] == []

    def test_suspects_empty(self):
        assert sanitize_case_data({"suspects": []})["suspects"] == []

    def test_non_dict_suspect_skipped(self):
        """Lambda는 여기서 s.items()로 터져 500을 냈다. 새 구현은 건너뛴다."""
        result = sanitize_case_data({"suspects": ["문자열", None, {"id": 1, "secret": "s"}]})
        assert result["suspects"] == [{"id": 1}]

    def test_empty_case_data(self):
        assert sanitize_case_data({}) == {"suspects": []}

    def test_find_culprit_none_when_absent(self, full_case):
        for s in full_case["suspects"]:
            s["isCulprit"] = False
        assert find_culprit(full_case) is None

    def test_find_culprit_ignores_non_dict(self):
        assert find_culprit({"suspects": ["x", {"isCulprit": True, "name": "범인"}]})["name"] == "범인"
