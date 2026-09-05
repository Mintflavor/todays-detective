# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 스포일러 정화. lambda/handler.py의 _sanitize_case_data를 그대로 이식했다.
#
# ⚠️ 이 프로젝트에서 회귀 위험이 가장 큰 코드다.
#    깨지면 클라이언트에 정답(solution, isCulprit)이 그대로 흘러가 게임이 근본적으로 망가지며,
#    예외가 나지 않아 조용히 통과한다. 상수와 로직을 임의로 "개선"하지 말 것.
#    변경 시 tests/test_sanitize.py를 반드시 함께 확인한다.

import logging
from typing import Any

logger = logging.getLogger(__name__)

# ── 아래 두 상수는 Lambda 원문과 글자 단위로 동일하다 ──────────────────
SPOILER_TOP_FIELDS: tuple[str, ...] = (
    "solution",
    "timeline_truth",
    "truth",
    "hidden_evidence_list",
)
SPOILER_SUSPECT_FIELDS: tuple[str, ...] = (
    "isCulprit",
    "secret",
    "real_action",
    "motive",
    "trick",
)

# 프롬프트 스키마(app/prompts.py의 CASE_GENERATION_PROMPT)가 규정하는 키 집합.
# 정화 동작에는 영향을 주지 않는다 — LLM이 스키마에 없는 필드를 만들어냈을 때
# 경고 로그로 드러내기 위한 용도다. 새 스포일러 필드가 조용히 새는 것을 막는다.
_KNOWN_TOP_FIELDS = frozenset(
    {
        "title",
        "summary",
        "crime_type",
        "world_setting",
        "victim_info",
        "evidence_list",
        "hidden_evidence_list",
        "timeline_truth",
        "suspects",
        "solution",
        # 서버가 덧붙이는 필드
        "scenarioId",
        "caseNumber",
    }
)
_KNOWN_SUSPECT_FIELDS = frozenset(
    {
        "id",
        "name",
        "role",
        "gender",
        "age",
        "personality",
        "image_prompt_keywords",
        "secret",
        "isCulprit",
        "motive",
        "trick",
        "real_action",
        "alibi_claim",
        "relationship_to_victim",
        "relationships_to_others",
        # 서버가 덧붙이는 필드
        "portraitImage",
    }
)


def _warn_unknown(where: str, keys: Any, known: frozenset) -> None:
    unknown = sorted(set(keys) - known)
    if unknown:
        logger.warning(
            "%s에 스키마에 없는 필드가 있습니다: %s — 스포일러 가능성을 검토하고 "
            "필요하면 SPOILER_%s_FIELDS에 추가하세요.",
            where,
            unknown,
            "TOP" if known is _KNOWN_TOP_FIELDS else "SUSPECT",
        )


def sanitize_case_data(case_data: dict[str, Any]) -> dict[str, Any]:
    """플레이어에게 보낼 정화본을 만든다. 원본 dict은 변경하지 않는다.

    최상위에서 solution / timeline_truth / truth 를 제거하고,
    각 suspect에서 isCulprit / secret / real_action / motive / trick 을 제거한다.
    """
    _warn_unknown("case_data", case_data.keys(), _KNOWN_TOP_FIELDS)

    sanitized = {k: v for k, v in case_data.items() if k not in SPOILER_TOP_FIELDS}

    suspects = sanitized.get("suspects") or []
    cleaned = []
    for s in suspects:
        if not isinstance(s, dict):
            continue
        _warn_unknown("suspect", s.keys(), _KNOWN_SUSPECT_FIELDS)
        cleaned.append({k: v for k, v in s.items() if k not in SPOILER_SUSPECT_FIELDS})
    sanitized["suspects"] = cleaned

    return sanitized


def find_culprit(case_data: dict[str, Any]) -> dict[str, Any] | None:
    """정화되지 않은 원본에서 진범을 찾는다. 평가 시에만 사용한다."""
    for s in case_data.get("suspects") or []:
        if isinstance(s, dict) and s.get("isCulprit"):
            return s
    return None


def assert_no_spoilers(payload: dict[str, Any]) -> list[str]:
    """정화본에 스포일러가 남아 있는지 검사한다. 남은 필드 경로 목록을 반환한다.

    테스트와 디버깅용이다. 빈 리스트가 정상이다.
    """
    leaks = [f for f in SPOILER_TOP_FIELDS if f in payload]
    for i, s in enumerate(payload.get("suspects") or []):
        if not isinstance(s, dict):
            continue
        leaks.extend(
            "suspects[%d].%s" % (i, f) for f in SPOILER_SUSPECT_FIELDS if f in s
        )
    return leaks
