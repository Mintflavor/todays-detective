# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 사건 생성 프롬프트의 다양성 회귀 테스트.
#
# 배경: 운영 데이터 4건이 모두 아래처럼 쏠려 있었다.
#   crime_type = 살인 4/4        (프롬프트에 "각 유형 20%"라고 써 있었는데도)
#   무대 = 안개/비 저택·산장 4/4
#   증거 개수 = 3개 4/4          ("최대 3개"의 상한에 항상 붙었다)
#   범인 = id 2  4/4             (스키마 예시가 id 2에 isCulprit: true를 박아뒀다)
#
# 범인이 항상 같은 위치라는 것은 **기록 재생 시 수사 없이 정답을 아는 것**과 같다.
# 그래서 무작위성을 LLM에 맡기지 않고 서버에서 뽑아 주입한다.
#
# 이 테스트는 Gemini를 호출하지 않는다 (프롬프트 문자열만 검증하므로 비용 0원).

import random
import re
from collections import Counter

import pytest

from app.prompts import (
    CASE_SCHEMA_BODY,
    CONDITIONS,
    CRIME_TYPES,
    STAGES,
    TIME_FRAMES,
    build_case_prompt,
)

SAMPLES = 300


def _field(prompt: str, prefix: str) -> str:
    for line in prompt.split("\n"):
        if line.startswith(prefix):
            return line[len(prefix):].strip()
    raise AssertionError("프롬프트에 %r 항목이 없다" % prefix)


@pytest.fixture
def prompts():
    r = random.Random(20260826)
    return [build_case_prompt(r) for _ in range(SAMPLES)]


class TestStructure:
    def test_contains_schema_body(self):
        """헤더만 format하고 스키마는 정적으로 붙인다. 붙이는 것을 잊으면 JSON이 깨진다."""
        p = build_case_prompt(random.Random(1))
        assert "[JSON 스키마]" in p
        assert "언어: 한국어(Korean)" in p
        assert '"solution"' in p

    def test_no_unformatted_placeholders(self):
        """format 누락 시 `{crime_type}` 같은 문자열이 그대로 프롬프트에 들어간다."""
        p = build_case_prompt(random.Random(2))
        for name in ("crime_type", "stage", "condition", "time_frame", "culprit_id", "evidence_count"):
            assert "{%s}" % name not in p, "%s 자리표시자가 치환되지 않았다" % name

    def test_deterministic_with_seed(self):
        assert build_case_prompt(random.Random(5)) == build_case_prompt(random.Random(5))

    def test_forbids_the_overused_cliche(self):
        """저택·산장 클리셰를 명시적으로 금지해야 실제로 벗어난다."""
        p = build_case_prompt(random.Random(3))
        assert "금지된 클리셰" in p
        assert "고립된 저택" in p


class TestSchemaExampleIsUnbiased:
    """스키마 예시는 그대로 결과에 복사된다. 예시에 답이 있으면 답이 고정된다."""

    def _body(self) -> str:
        return CASE_SCHEMA_BODY

    def test_no_slot_is_marked_culprit(self):
        """예시가 특정 id에 isCulprit: true를 박아두면 그 id가 항상 범인이 된다."""
        assert '"isCulprit": true' not in self._body()
        assert self._body().count('"isCulprit": false') == 3

    def test_isculprit_is_boolean_not_description(self):
        """설명 문자열을 두면 LLM이 그 문자열을 출력해 find_culprit()이 범인을 놓친다."""
        for value in re.findall(r'"isCulprit":\s*([^,\n]+)', self._body()):
            assert value.strip() in ("true", "false"), (
                "isCulprit 예시가 boolean이 아니다: %r" % value
            )

    @pytest.mark.parametrize("field", ["real_action", "alibi_claim", "secret", "image_prompt_keywords"])
    def test_slots_are_symmetric(self, field):
        """세 용의자 예시의 설명이 다르면 그 차이가 범인 힌트로 복사된다.

        실제로 id 2 예시에만 "실제 범행 행동"·"거짓 알리바이"가 적혀 있었다.
        """
        values = set(re.findall(r'"%s": "([^"]*)"' % field, self._body()))
        assert len(values) == 1, "%s 설명이 슬롯마다 다르다: %s" % (field, values)

    def test_boolean_directive_present(self):
        p = build_case_prompt(random.Random(4))
        assert "JSON boolean" in p, "isCulprit 타입을 명시하지 않으면 문자열로 나올 수 있다"


class TestCrimeTypeDistribution:
    def test_all_types_appear(self, prompts):
        seen = {_field(p, "- 범죄 유형:") for p in prompts}
        assert seen == set(CRIME_TYPES), "누락된 범죄 유형: %s" % (set(CRIME_TYPES) - seen)

    def test_murder_is_not_dominant(self, prompts):
        """살인 4/4였다. 어떤 유형도 과반을 넘기면 안 된다."""
        counts = Counter(_field(p, "- 범죄 유형:") for p in prompts)
        top, n = counts.most_common(1)[0]
        assert n < SAMPLES * 0.4, "%s가 %d/%d로 쏠렸다" % (top, n, SAMPLES)


class TestCulpritPosition:
    def test_all_three_slots_used(self, prompts):
        """범인이 항상 같은 id면 기록 재생에서 정답이 노출된다."""
        slots = {_field(p, "- 범인:").split("**id ")[1].split("**")[0] for p in prompts}
        assert slots == {"1", "2", "3"}, "사용되지 않은 범인 위치가 있다: %s" % slots

    def test_no_slot_is_dominant(self, prompts):
        counts = Counter(
            _field(p, "- 범인:").split("**id ")[1].split("**")[0] for p in prompts
        )
        top, n = counts.most_common(1)[0]
        assert n < SAMPLES * 0.5, "범인 id %s가 %d/%d로 쏠렸다" % (top, n, SAMPLES)


class TestEvidenceCount:
    def test_count_varies(self, prompts):
        counts = {_field(p, "- evidence_list 개수: 정확히") for p in prompts}
        assert len(counts) >= 3, "증거 개수가 고정돼 있다: %s" % counts

    def test_count_is_playable(self, prompts):
        """0~1개면 추리가 불가능하고, 너무 많으면 10분 안에 소화할 수 없다."""
        for p in prompts:
            n = int(_field(p, "- evidence_list 개수: 정확히").rstrip("개"))
            assert 2 <= n <= 4, "증거 개수 %d는 플레이 가능 범위를 벗어난다" % n


class TestStageVariety:
    def test_pools_are_large_enough(self):
        """풀이 작으면 몇 판 만에 같은 무대가 반복된다. 월 25판이 상한이다."""
        assert len(STAGES) >= 20, "무대 풀이 %d개뿐이다" % len(STAGES)
        assert len(CONDITIONS) >= 10
        assert len(TIME_FRAMES) >= 4

    def test_pools_avoid_the_cliche(self):
        """풀 자체에 저택·산장이 있으면 금지 지시와 모순된다."""
        banned = ("저택", "산장", "별장", "펜션")
        for stage in STAGES:
            assert not any(b in stage for b in banned), "무대 풀에 클리셰가 있다: %s" % stage

    def test_conditions_are_not_all_isolation_weather(self):
        """날씨를 고립 장치로만 쓰면 결국 같은 사건이 된다."""
        isolating = [c for c in CONDITIONS if "폭우" in c or "안개" in c or "눈보라" in c]
        assert len(isolating) <= len(CONDITIONS) * 0.2, (
            "고립형 날씨가 %d/%d로 많다" % (len(isolating), len(CONDITIONS))
        )

    def test_stage_varies_across_samples(self, prompts):
        stages = Counter(_field(p, "- 무대:") for p in prompts)
        assert len(stages) >= 15, "%d종류의 무대만 등장했다" % len(stages)


class TestCulpritNormalization:
    """생성 결과의 isCulprit을 저장 전에 교정한다.

    범인이 0명이면 find_culprit()이 None을 주고, 평가 프롬프트의 정답이 "Unknown"이
    되어 **모든 추리가 조용히 틀리게 채점된다.** 예외가 나지 않는 종류의 고장이다.
    """

    @staticmethod
    def _case(*is_culprit):
        return {
            "suspects": [
                {"id": i + 1, "name": "용의자%d" % (i + 1), "isCulprit": v}
                for i, v in enumerate(is_culprit)
            ]
        }

    @staticmethod
    def _flags(case):
        return [s["isCulprit"] for s in case["suspects"]]

    def test_string_false_is_not_treated_as_culprit(self):
        """가장 위험한 입력. truthiness에 맡기면 "false"가 True가 된다."""
        from app.routers.game import _normalize_culprit

        case = self._case("false", "true", "false")
        _normalize_culprit(case, expected_id=2)
        assert self._flags(case) == [False, True, False]

    def test_string_true_is_accepted(self):
        from app.routers.game import _normalize_culprit

        case = self._case("false", "false", "True")
        _normalize_culprit(case, expected_id=1)
        assert self._flags(case) == [False, False, True]

    def test_no_culprit_falls_back_to_designated_id(self):
        from app.routers.game import _normalize_culprit

        case = self._case(False, False, False)
        _normalize_culprit(case, expected_id=3)
        assert self._flags(case) == [False, False, True]

    def test_multiple_culprits_reduced_to_designated_id(self):
        from app.routers.game import _normalize_culprit

        case = self._case(True, True, True)
        _normalize_culprit(case, expected_id=2)
        assert self._flags(case) == [False, True, False]

    def test_descriptive_string_is_not_a_culprit(self):
        """스키마 예시에 설명 문자열을 두면 LLM이 그대로 출력할 수 있다."""
        from app.routers.game import _normalize_culprit

        case = self._case("범인 id와 일치하면 true", "범인 id와 일치하면 true", "true")
        _normalize_culprit(case, expected_id=1)
        assert self._flags(case) == [False, False, True]

    def test_valid_single_culprit_is_left_alone(self):
        """지정 id와 다르더라도 1명이면 서사를 존중해 건드리지 않는다."""
        from app.routers.game import _normalize_culprit

        case = self._case(True, False, False)
        _normalize_culprit(case, expected_id=3)
        assert self._flags(case) == [True, False, False]

    def test_unknown_designated_id_falls_back_to_first(self):
        from app.routers.game import _normalize_culprit

        case = self._case(False, False, False)
        _normalize_culprit(case, expected_id=99)
        assert self._flags(case) == [True, False, False]

    def test_result_is_findable_by_find_culprit(self):
        """교정 후에는 반드시 find_culprit()이 범인을 찾아야 한다."""
        from app.routers.game import _normalize_culprit
        from app.sanitize import find_culprit

        for flags in [(False, False, False), (True, True, True), ("false", "false", "false")]:
            case = self._case(*flags)
            _normalize_culprit(case, expected_id=2)
            found = find_culprit(case)
            assert found is not None, "교정 후에도 범인을 찾지 못했다: %s" % (flags,)
            assert found["id"] == 2

    def test_empty_suspects_does_not_raise(self):
        from app.routers.game import _normalize_culprit

        case = {"suspects": []}
        _normalize_culprit(case, expected_id=1)
        assert case["suspects"] == []

    def test_non_dict_suspects_ignored(self):
        from app.routers.game import _normalize_culprit

        case = {"suspects": ["쓰레기", {"id": 1, "name": "가", "isCulprit": False}]}
        _normalize_culprit(case, expected_id=1)
        assert case["suspects"][1]["isCulprit"] is True


class TestNormalizeReturnsWhetherItActed:
    """감사 결과에 "교정이 발동했는지"를 남기려면 반환값이 정확해야 한다.

    이 값이 없으면 "프롬프트가 지켰다"와 "안전망이 고쳤다"를 구별할 수 없다.
    """

    @staticmethod
    def _case(*flags):
        return {"suspects": [{"id": i + 1, "name": "가", "isCulprit": v}
                             for i, v in enumerate(flags)]}

    def test_returns_false_when_already_valid(self):
        from app.routers.game import _normalize_culprit

        assert _normalize_culprit(self._case(False, True, False), 2) is False

    def test_returns_false_even_when_culprit_differs_from_designated(self):
        """1명이면 서사를 존중해 손대지 않으므로 교정이 아니다."""
        from app.routers.game import _normalize_culprit

        assert _normalize_culprit(self._case(True, False, False), 3) is False

    def test_returns_true_when_no_culprit(self):
        from app.routers.game import _normalize_culprit

        assert _normalize_culprit(self._case(False, False, False), 2) is True

    def test_returns_true_when_multiple_culprits(self):
        from app.routers.game import _normalize_culprit

        assert _normalize_culprit(self._case(True, True, False), 1) is True

    def test_returns_true_when_string_values_needed_coercion_and_left_none(self):
        """문자열 "false"만 있으면 boolean 변환 후 범인이 0명이 되어 교정된다."""
        from app.routers.game import _normalize_culprit

        assert _normalize_culprit(self._case("false", "false", "false"), 2) is True

    def test_returns_false_for_empty_suspects(self):
        from app.routers.game import _normalize_culprit

        assert _normalize_culprit({"suspects": []}, 1) is False


class TestAuditIsSpoilerFree:
    """감사 결과에 지정 범인 id를 담으면 그 자체가 정답 노출이다."""

    def test_audit_keys_are_booleans_only(self):
        import inspect

        from app.routers.game import start_case

        src = inspect.getsource(start_case)
        # generation_audit 리터럴에 spec.culprit_id가 값으로 들어가면 안 된다.
        block = src.split("generation_audit = {", 1)[1].split("}", 1)[0]
        assert "spec.culprit_id" not in block.replace("== spec.culprit_id", ""), (
            "감사 결과에 지정 범인 id가 저장되고 있다 — 스포일러다"
        )
        assert "actual_culprit_id," not in block
