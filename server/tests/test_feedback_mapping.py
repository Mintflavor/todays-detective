# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 피드백 필드 매핑 회귀 테스트.
#
# 클라이언트는 camelCase, DB는 snake_case다. 한쪽이 어긋나면 관리자 화면에서
# 게임 결과가 전부 빈 값으로 보인다 (에러 없이 조용히).

import pytest
from pydantic import ValidationError

from app.models import (
    FEEDBACK_MAX_LENGTH,
    FeedbackGameResult,
    FeedbackRequest,
    game_result_from_db,
    game_result_to_db,
)

SNAKE_KEYS = [
    "scenario_title",
    "selected_suspect_id",
    "selected_suspect_name",
    "reasoning",
    "is_correct",
    "grade",
    "culprit_name",
    "report",
    "advice",
    "time_taken",
]
CAMEL_KEYS = [
    "scenarioTitle",
    "selectedSuspectId",
    "selectedSuspectName",
    "reasoning",
    "isCorrect",
    "grade",
    "culpritName",
    "report",
    "advice",
    "timeTaken",
]

FULL_CAMEL = {
    "scenarioTitle": "폭우 속의 밀실",
    "selectedSuspectId": 2,
    "selectedSuspectName": "김서준",
    "reasoning": "집사가 범인입니다",
    "isCorrect": True,
    "grade": "A",
    "culpritName": "김서준",
    "report": "훌륭한 수사였습니다.",
    "advice": "없음",
    "timeTaken": "07:31",
}


class TestToDb:
    def test_all_snake_keys_present(self):
        doc = game_result_to_db(FeedbackGameResult.model_validate(FULL_CAMEL))
        assert sorted(doc) == sorted(SNAKE_KEYS)

    def test_no_camel_keys_leak(self):
        doc = game_result_to_db(FeedbackGameResult.model_validate(FULL_CAMEL))
        assert not any(k in doc for k in ("scenarioTitle", "selectedSuspectId", "timeTaken"))

    @pytest.mark.parametrize(
        "camel,snake,value",
        [
            ("scenarioTitle", "scenario_title", "폭우 속의 밀실"),
            ("selectedSuspectId", "selected_suspect_id", 2),
            ("selectedSuspectName", "selected_suspect_name", "김서준"),
            ("isCorrect", "is_correct", True),
            ("culpritName", "culprit_name", "김서준"),
            ("timeTaken", "time_taken", "07:31"),
        ],
    )
    def test_value_preserved(self, camel, snake, value):
        doc = game_result_to_db(FeedbackGameResult.model_validate(FULL_CAMEL))
        assert doc[snake] == value

    def test_none_returns_none(self):
        assert game_result_to_db(None) is None

    def test_partial_input_fills_none(self):
        doc = game_result_to_db(FeedbackGameResult.model_validate({"grade": "B"}))
        assert doc["grade"] == "B"
        assert doc["scenario_title"] is None
        assert sorted(doc) == sorted(SNAKE_KEYS), "부분 입력에도 10필드가 유지돼야 한다"

    def test_false_is_not_dropped(self):
        """isCorrect=False가 None으로 뭉개지면 오답이 무판정으로 보인다."""
        doc = game_result_to_db(FeedbackGameResult.model_validate({"isCorrect": False}))
        assert doc["is_correct"] is False

    def test_zero_id_is_not_dropped(self):
        doc = game_result_to_db(FeedbackGameResult.model_validate({"selectedSuspectId": 0}))
        assert doc["selected_suspect_id"] == 0

    def test_unknown_field_ignored(self):
        """LLM/클라이언트가 모르는 필드를 보내도 422로 튕기지 않는다."""
        gr = FeedbackGameResult.model_validate({**FULL_CAMEL, "someNewField": "x"})
        assert "someNewField" not in game_result_to_db(gr)


class TestFromDb:
    def test_all_camel_keys_present(self):
        doc = game_result_to_db(FeedbackGameResult.model_validate(FULL_CAMEL))
        assert sorted(game_result_from_db(doc)) == sorted(CAMEL_KEYS)

    def test_round_trip_preserves_values(self):
        doc = game_result_to_db(FeedbackGameResult.model_validate(FULL_CAMEL))
        assert game_result_from_db(doc) == FULL_CAMEL

    def test_none_returns_none(self):
        assert game_result_from_db(None) is None

    def test_non_dict_returns_none(self):
        assert game_result_from_db("문자열") is None
        assert game_result_from_db(123) is None

    def test_legacy_doc_missing_fields(self):
        """구 데이터에 필드가 없어도 10키를 채워 반환해야 한다 (프론트가 옵셔널 체이닝 없이 읽는다)."""
        out = game_result_from_db({"grade": "C"})
        assert sorted(out) == sorted(CAMEL_KEYS)
        assert out["grade"] == "C"
        assert out["scenarioTitle"] is None

    def test_double_round_trip_stable(self):
        gr = FeedbackGameResult.model_validate(FULL_CAMEL)
        once = game_result_from_db(game_result_to_db(gr))
        twice = game_result_from_db(game_result_to_db(FeedbackGameResult.model_validate(once)))
        assert once == twice


class TestFeedbackRequestValidation:
    def test_trims_whitespace(self):
        assert FeedbackRequest.model_validate({"content": "  좋아요  "}).content == "좋아요"

    def test_max_length_constant(self):
        assert FEEDBACK_MAX_LENGTH == 300

    def test_exactly_max_length_allowed(self):
        content = "가" * FEEDBACK_MAX_LENGTH
        assert FeedbackRequest.model_validate({"content": content}).content == content

    @pytest.mark.parametrize("bad", ["", "   ", "\n\t "])
    def test_blank_rejected(self, bad):
        with pytest.raises(ValidationError):
            FeedbackRequest.model_validate({"content": bad})

    def test_over_max_length_rejected(self):
        with pytest.raises(ValidationError):
            FeedbackRequest.model_validate({"content": "가" * (FEEDBACK_MAX_LENGTH + 1)})

    def test_length_checked_after_trim(self):
        """공백 포함 301자지만 트림 후 300자면 통과해야 한다."""
        assert len(FeedbackRequest.model_validate({"content": " " + "가" * 300 + " "}).content) == 300

    def test_optional_fields_default_none(self):
        req = FeedbackRequest.model_validate({"content": "x"})
        assert req.scenarioId is None and req.grade is None and req.gameResult is None
