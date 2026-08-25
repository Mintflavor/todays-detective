# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 평가 응답 파싱 회귀 테스트.
#
# 이 파일이 깨지면 모든 추리가 "F / 보고서 생성 실패"로 나온다.
# 예외가 발생하지 않아 조용히 통과하므로 테스트로만 잡을 수 있다.

import pytest

from app.routers.game import (
    _ADVICE_RE,
    _FALLBACK_ADVICE,
    _FALLBACK_GRADE,
    _FALLBACK_REPORT,
    _GRADE_RE,
    _REPORT_RE,
)


def parse(text: str) -> tuple[str, str, str]:
    """routers/game.py의 evaluate가 하는 파싱과 동일한 순서·동일한 폴백."""
    g, r, a = _GRADE_RE.search(text), _REPORT_RE.search(text), _ADVICE_RE.search(text)
    grade = (g.group(1).strip() if g else _FALLBACK_GRADE).split("\n", 1)[0].strip()
    return (
        grade,
        r.group(1).strip() if r else _FALLBACK_REPORT,
        a.group(1).strip() if a else _FALLBACK_ADVICE,
    )


class TestNormalResponse:
    def test_grade(self, evaluation_text):
        assert parse(evaluation_text)[0] == "A"

    def test_report_body(self, evaluation_text):
        report = parse(evaluation_text)[1]
        assert report.startswith("탐정님의 추리는 정확했습니다")
        assert "동기에 대한 언급이 부족했습니다" in report

    def test_report_excludes_advice_section(self, evaluation_text):
        """[REPORT]가 [ADVICE]까지 삼키면 결과 화면에 조언이 중복 노출된다."""
        assert "[ADVICE]" not in parse(evaluation_text)[1]
        assert "아쉬운 점" not in parse(evaluation_text)[1]

    def test_advice(self, evaluation_text):
        assert parse(evaluation_text)[2].startswith("아쉬운 점:")

    def test_judgment_section_ignored(self, evaluation_text):
        """[JUDGMENT]는 쓰지 않는다 (isCorrect는 이름 비교로 판정)."""
        assert "성공" not in parse(evaluation_text)[1]


class TestGradeVariants:
    @pytest.mark.parametrize("grade", ["S", "A", "B", "C", "F"])
    def test_all_grades(self, grade):
        assert parse("[GRADE]\n%s\n\n[REPORT]\n본문" % grade)[0] == grade

    def test_grade_on_same_line(self):
        assert parse("[GRADE] B\n\n[REPORT]\n본문")[0] == "B"

    def test_grade_with_bracket_suffix(self):
        """LLM이 [GRADE: 등급] 처럼 대괄호 안에 부가 문자를 넣는 경우."""
        assert parse("[GRADE: 등급]\nS\n\n[REPORT]\n본문")[0] == "S"

    def test_grade_takes_first_line_only(self):
        """등급 뒤에 설명이 붙어도 첫 줄만 취해야 한다."""
        assert parse("[GRADE]\nC\n이유는 논리 비약이 심함\n\n[REPORT]\n본문")[0] == "C"

    def test_grade_extra_whitespace(self):
        assert parse("[GRADE]   \n   A   \n\n[REPORT]\n본문")[0] == "A"


class TestSectionVariants:
    def test_all_sections_with_bracket_suffixes(self):
        text = "[GRADE: 등급]\nS\n\n[REPORT - 보고서]\n본문입니다.\n\n[ADVICE(조언)]\n없음\n"
        grade, report, advice = parse(text)
        assert (grade, report, advice) == ("S", "본문입니다.", "없음")

    def test_advice_multiline(self):
        text = (
            "[GRADE]\nB\n\n[REPORT]\n보고서\n\n"
            "[ADVICE]\n아쉬운 점: 첫째를 물어봤어야 했다.\n아쉬운 점: 둘째를 확인해야 했다.\n"
        )
        advice = parse(text)[2]
        assert "첫째" in advice and "둘째" in advice

    def test_advice_none_literal(self):
        """완벽한 추리 시 프롬프트가 '없음'을 출력하게 되어 있다."""
        assert parse("[GRADE]\nS\n\n[REPORT]\n완벽했습니다.\n\n[ADVICE]\n없음")[2] == "없음"

    def test_report_multiline_preserved(self):
        text = "[GRADE]\nA\n\n[REPORT]\n첫째 줄.\n둘째 줄.\n셋째 줄.\n\n[ADVICE]\n없음"
        assert parse(text)[1] == "첫째 줄.\n둘째 줄.\n셋째 줄."


class TestFallbacks:
    """폴백 문구는 프론트가 그대로 표시한다. 문자열이 바뀌면 안 된다."""

    def test_fallback_constants(self):
        assert _FALLBACK_GRADE == "F"
        assert _FALLBACK_REPORT == "보고서 생성 실패"
        assert _FALLBACK_ADVICE == "조언을 불러올 수 없습니다."

    def test_completely_malformed(self):
        assert parse("죄송합니다, 평가할 수 없습니다.") == (
            _FALLBACK_GRADE,
            _FALLBACK_REPORT,
            _FALLBACK_ADVICE,
        )

    def test_empty_response(self):
        assert parse("") == (_FALLBACK_GRADE, _FALLBACK_REPORT, _FALLBACK_ADVICE)

    def test_missing_advice_only(self):
        grade, report, advice = parse("[GRADE]\nF\n\n[REPORT]\n실패했습니다.")
        assert grade == "F"
        assert report == "실패했습니다."
        assert advice == _FALLBACK_ADVICE

    def test_missing_grade_only(self):
        grade, report, _ = parse("[REPORT]\n본문\n\n[ADVICE]\n없음")
        assert grade == _FALLBACK_GRADE
        assert report == "본문"

    def test_missing_report_only(self):
        grade, report, advice = parse("[GRADE]\nA\n\n[ADVICE]\n없음")
        assert grade == "A"
        assert report == _FALLBACK_REPORT
        assert advice == "없음"


class TestSpoilerRule:
    """프롬프트 규칙: 추리 실패 시 advice에 범인 이름을 넣지 않는다.

    LLM 준수 여부는 여기서 강제할 수 없지만, 파싱이 advice를 온전히 뽑아
    검사 가능한 상태로 만드는지는 보장한다.
    """

    def test_advice_extracted_for_inspection(self):
        text = "[GRADE]\nF\n\n[REPORT]\n실패\n\n[ADVICE]\n아쉬운 점: 우산을 확인해야 했다."
        advice = parse(text)[2]
        assert advice and "김서준" not in advice
