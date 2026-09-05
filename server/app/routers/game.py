# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 게임 엔드포인트. lambda/handler.py의 _game_* 함수들을 이식했다.
#
# ⚠️ 이식 원칙: 정규식·폴백 문구·에러 메시지를 임의로 바꾸지 않는다.
#    특히 평가 파싱이 어긋나면 모든 추리가 "F / 보고서 생성 실패"로 나오고,
#    예외가 발생하지 않아 조용히 통과한다.
#
# start는 lambda가 아니라 app/api/game/start/route.ts(Next.js)의 신규 생성 로직을 이식한다.
# lambda의 $sample 랜덤 추출 경로는 이식하지 않는다 (계획 §3-1).

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Request, Response

from .. import db, gemini, storage
from ..config import get_settings
from ..ratelimit import global_key, limiter
from ..models import (
    ChatRequest,
    ChatResponse,
    EvaluateRequest,
    EvaluateResponse,
    FeedbackRequest,
    GameStartResponse,
    game_result_to_db,
)
from ..prompts import (
    build_case_spec,
    generate_contradiction_check_prompt,
    generate_evaluation_prompt,
    generate_portrait_prompt,
    generate_suspect_prompt,
)
from ..sanitize import find_culprit, sanitize_case_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/game", tags=["game"])

_settings = get_settings()

# ── Lambda 원문과 글자 단위로 동일한 정규식 ─────────────────────────
_GRADE_RE = re.compile(r"\[GRADE[^\]]*\]\s*(.*)")
_REPORT_RE = re.compile(r"\[REPORT[^\]]*\]\s*([\s\S]*?)(?=\[ADVICE[^\]]*\]|$)")
_ADVICE_RE = re.compile(r"\[ADVICE[^\]]*\]\s*([\s\S]*)")

# ── Lambda 원문과 동일한 폴백 문구 ─────────────────────────────────
_FALLBACK_GRADE = "F"
_FALLBACK_REPORT = "보고서 생성 실패"
_FALLBACK_ADVICE = "조언을 불러올 수 없습니다."


def _oid(scenario_id: str) -> ObjectId:
    """Lambda는 ObjectId 변환 실패를 400 'Invalid scenario id'로 처리했다."""
    try:
        return ObjectId(scenario_id)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="Invalid scenario id")


def _load_scenario(scenario_id: str) -> dict[str, Any]:
    doc = db.get_scenarios().find_one({"_id": _oid(scenario_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return doc


# ─────────────────────────── 사건 생성 ───────────────────────────
def _parse_case_json(raw: str) -> dict[str, Any]:
    """Next.js 라우트의 펜스 제거 로직을 그대로 이식한다.

    프롬프트가 순수 JSON을 요구하지만 LLM이 ```json 펜스를 붙이는 경우가 있다.
    """
    cleaned = raw.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.error("사건 JSON 파싱 실패: %s | 원문 앞부분=%r", exc, cleaned[:300])
        raise HTTPException(
            status_code=500, detail="Failed to parse generated case data"
        )


def _attach_portrait(suspect: dict[str, Any]) -> None:
    """초상화 1장을 생성해 suspect에 붙인다. 실패는 개별적으로 흡수한다.

    Lambda·Next.js 모두 실패 시 이미지 없이 진행했다(프론트가 아이콘으로 폴백).
    사건 생성 전체를 실패시키지 않는다.
    """
    try:
        prompt = generate_portrait_prompt(suspect)
        raw = gemini.generate_portrait_image(prompt)
        suspect["portraitImage"] = storage.upload_portrait(raw)
    except Exception as exc:  # noqa: BLE001 — 초상화는 있으면 좋은 요소다
        logger.warning(
            "용의자 %s 초상화 생성/업로드 실패 (아이콘 폴백): %s",
            suspect.get("id"),
            exc,
        )


# 최근 사용 회피 창 크기.
#
# 무대 78종에 월 25판이면 생일 문제로 3~4회 겹친다. 최근 20판을 피하면 한 달 안에서는
# 사실상 중복이 없다. 조건은 36종이라 창을 더 좁게 둔다 (풀의 1/3을 넘기면 남는 것이
# 적어 다양성이 오히려 줄어든다).
_RECENT_STAGE_WINDOW = 20
_RECENT_CONDITION_WINDOW = 10


def _recent_choices() -> tuple[set[str], set[str]]:
    """최근 생성에 쓴 무대·조건을 모은다. (무대, 조건)

    이건 **최적화이지 필수 경로가 아니다.** 조회에 실패하면 빈 집합을 돌려주고
    전체 풀에서 고르게 한다 — DB 문제로 159원짜리 생성을 막을 이유가 없다.
    """
    try:
        docs = list(
            db.get_scenarios()
            .find({"generation_spec": {"$exists": True}}, {"generation_spec": 1})
            .sort("created_at", -1)
            .limit(_RECENT_STAGE_WINDOW)
        )
    except Exception:
        logger.warning("최근 생성 이력 조회 실패 — 전체 풀에서 고른다", exc_info=True)
        return set(), set()

    stages: set[str] = set()
    conditions: set[str] = set()
    for i, d in enumerate(docs):
        # 형태를 신뢰하지 않는다. dict가 아니면 넘긴다 (수기 편집·마이그레이션 사고).
        spec = d.get("generation_spec")
        if not isinstance(spec, dict):
            continue
        stage = spec.get("stage")
        if isinstance(stage, str) and stage:
            stages.add(stage)
        if i < _RECENT_CONDITION_WINDOW:
            condition = spec.get("condition")
            if isinstance(condition, str) and condition:
                conditions.add(condition)
    return stages, conditions


def _coerce_bool(value: object) -> bool:
    """LLM이 isCulprit을 문자열로 줄 수 있다.

    파이썬 truthiness에 그냥 맡기면 `"false"`가 True가 되어 **엉뚱한 인물이
    범인이 된다.** find_culprit()은 truthiness를 쓰므로 여기서 걸러야 한다.
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() == "true"
    return bool(value)


def _normalize_culprit(case_data: dict[str, Any], expected_id: int) -> bool:
    """isCulprit을 boolean으로 정규화하고 정확히 1명만 남긴다. 제자리 수정.

    범인이 0명이면 find_culprit()이 None을 반환하고, 평가 프롬프트의 정답이
    "Unknown"이 되어 **모든 추리가 조용히 틀리게 채점된다.** 예외가 나지 않으므로
    반드시 여기서 막는다.

    교정이 발동했으면 True를 반환한다 (감사용).
    """
    suspects = [s for s in case_data.get("suspects") or [] if isinstance(s, dict)]
    if not suspects:
        return False

    for s in suspects:
        s["isCulprit"] = _coerce_bool(s.get("isCulprit"))

    culprits = [s for s in suspects if s["isCulprit"]]
    if len(culprits) == 1:
        return False

    # 지정한 id를 우선 쓰고, 없으면 첫 번째 인물로 떨어뜨린다.
    target = next((s for s in suspects if s.get("id") == expected_id), suspects[0])
    logger.warning(
        "생성 결과의 범인이 %d명이다 (지정 id=%s). '%s'(id=%s)로 교정한다.",
        len(culprits),
        expected_id,
        target.get("name", "?"),
        target.get("id"),
    )
    for s in suspects:
        s["isCulprit"] = s is target
    return True


@router.post("/start", response_model=GameStartResponse)
# 전역 제한. per-IP는 XFF가 전달되지 않아 불가능하다. 근거는 app/ratelimit.py 참조.
@limiter.limit(_settings.rate_limit_start_global, key_func=global_key)
def start_case(request: Request) -> GameStartResponse:
    """새 사건을 생성해 저장하고 정화본을 반환한다.

    ⚠️ 이 엔드포인트 1회 = 약 159원 (초상화 3장이 93%). 가장 비싼 경로다.
    수십 초가 걸린다 (텍스트 1회 + 이미지 3장). 프록시 타임아웃을 넉넉히 둘 것.
    """
    settings = get_settings()

    # 다양성 축(무대·조건·범죄 유형·범인 위치·증거 개수)을 서버에서 뽑아 주입한다.
    # LLM에게 무작위 선택을 맡기면 고르지 않는다 — prompts.py 주석 참조.
    recent_stages, recent_conditions = _recent_choices()
    spec = build_case_spec(
        recent_stages=recent_stages, recent_conditions=recent_conditions
    )
    raw = gemini.call_gemini(spec.prompt, settings.gemini_model)
    case_data = _parse_case_json(raw)

    suspects = case_data.get("suspects") or []
    if not suspects:
        logger.error("생성된 사건에 suspects가 없습니다: keys=%s", list(case_data.keys()))
        raise HTTPException(status_code=500, detail="Invalid generated case data")

    # 지정 조건을 지켰는지 확인한다. isCulprit은 교정하고, 나머지는 경고만 남긴다
    # (서사와 어긋나게 값을 덮어쓰면 사건이 앞뒤가 안 맞는다).
    #
    # 매 생성의 지정값을 남긴다. 이게 없으면 "LLM이 지정을 따랐는지"를
    # 사후에 판정할 수 없다 — 결과만 봐서는 우연히 맞은 것과 구별되지 않는다.
    logger.info(
        "지정 조건: crime_type=%s culprit_id=%d evidence=%d stage=%.30s "
        "(최근 회피: 무대 %d종, 조건 %d종)",
        spec.crime_type,
        spec.culprit_id,
        spec.evidence_count,
        spec.stage,
        len(recent_stages),
        len(recent_conditions),
    )
    culprit_was_normalized = _normalize_culprit(case_data, spec.culprit_id)

    actual_culprit = next(
        (s for s in suspects if isinstance(s, dict) and s.get("isCulprit")), None
    )
    actual_culprit_id = (actual_culprit or {}).get("id")

    # 감사 결과는 **불리언만** 남긴다. 지정 범인 id를 저장하면 그 자체가 스포일러다.
    # 컨테이너를 재생성하면 stdout 로그는 사라지므로 DB에 남겨야 사후 확인이 된다
    # (실제로 검증 직후 재시작해서 로그를 날린 적이 있다).
    generation_audit = {
        "culprit_followed": actual_culprit_id == spec.culprit_id,
        "crime_type_followed": case_data.get("crime_type") == spec.crime_type,
        "evidence_count_followed": len(case_data.get("evidence_list") or [])
        == spec.evidence_count,
        "culprit_normalized": culprit_was_normalized,
    }

    if actual_culprit_id != spec.culprit_id:
        # 교정 대상이 아니다 (범인은 정확히 1명이다). LLM이 다른 인물을 골랐을 뿐이며
        # 서사는 그 인물 기준으로 일관되므로 덮어쓰지 않는다. 다만 빈도는 봐야 한다.
        logger.warning(
            "범인 위치 불일치: 지정 id=%d 결과 id=%s (%s)",
            spec.culprit_id,
            actual_culprit_id,
            (actual_culprit or {}).get("name", "?"),
        )
    if case_data.get("crime_type") != spec.crime_type:
        logger.warning(
            "crime_type 불일치: 지정=%s 결과=%s", spec.crime_type, case_data.get("crime_type")
        )
    actual_evidence = len(case_data.get("evidence_list") or [])
    if actual_evidence != spec.evidence_count:
        logger.warning(
            "evidence_list 개수 불일치: 지정=%d 결과=%d", spec.evidence_count, actual_evidence
        )

    # 초상화 3장 병렬 생성. 순차로는 대기시간이 3배가 된다.
    with ThreadPoolExecutor(max_workers=len(suspects)) as pool:
        list(pool.map(_attach_portrait, [s for s in suspects if isinstance(s, dict)]))

    now = datetime.now(timezone.utc)
    result = db.get_scenarios().insert_one(
        {
            "title": case_data.get("title", ""),
            "summary": case_data.get("summary", ""),
            "crime_type": case_data.get("crime_type") or "Unknown",
            "case_data": case_data,
            # storable()이 culprit_id를 제외한다. 직접 dict를 만들지 말 것.
            "generation_spec": spec.storable(),
            "generation_audit": generation_audit,
            "created_at": now,
        }
    )
    scenario_id = str(result.inserted_id)
    logger.info(
        "사건 생성 완료: %s '%s' (초상화 %d/%d)",
        scenario_id,
        case_data.get("title", ""),
        sum(1 for s in suspects if isinstance(s, dict) and s.get("portraitImage")),
        len(suspects),
    )

    return GameStartResponse(
        scenarioId=scenario_id,
        caseData=sanitize_case_data(case_data),
    )


# ─────────────────────────── 용의자 심문 ───────────────────────────
_CONTRADICTION_RE = re.compile(r"\[CONTRADICTION:\s*(TRUE|FALSE)\]", re.IGNORECASE)


def check_contradiction(
    suspect: dict[str, Any],
    case_data: dict[str, Any],
    question: str,
    reply: str,
) -> bool:
    """용의자의 답변이 객관적 사실과 모순되는지 검증한다.

    실패 시 1회 즉시 재시도하며, 재실패하거나 파싱 불능 시 False로 폴백한다.
    """
    prompt = generate_contradiction_check_prompt(
        suspect,
        case_data.get("world_setting") or {},
        case_data.get("timeline_truth") or [],
        case_data.get("evidence_list") or [],
        question,
        reply,
    )
    chat_model = get_settings().chat_model

    for attempt in range(2):
        try:
            result = gemini.call_gemini(prompt, chat_model)
            match = _CONTRADICTION_RE.search(result)
            if match:
                return match.group(1).upper() == "TRUE"
            logger.warning(
                "모순 판정 파싱 실패 (attempt %d/2): %s", attempt + 1, result[:100]
            )
        except Exception as exc:
            logger.warning(
                "모순 판정 LLM 호출 실패 (attempt %d/2): %s", attempt + 1, exc
            )

    logger.warning("모순 판정 최종 실패 — False로 폴백합니다")
    return False


@router.post("/chat", response_model=ChatResponse)
@limiter.limit(_settings.rate_limit_chat, key_func=global_key)
def chat(request: Request, req: ChatRequest) -> ChatResponse:
    doc = _load_scenario(req.scenarioId)
    case_data = doc.get("case_data") or {}

    suspect = next(
        (
            s
            for s in (case_data.get("suspects") or [])
            if isinstance(s, dict) and s.get("id") == req.suspectId
        ),
        None,
    )
    if suspect is None:
        raise HTTPException(status_code=404, detail="Suspect not found")

    system_prompt = generate_suspect_prompt(
        suspect,
        case_data.get("world_setting") or {},
        case_data.get("timeline_truth") or [],
        case_data.get("evidence_list") or [],
        all_suspects=case_data.get("suspects") or [],
        victim_info=case_data.get("victim_info") or {},
    )
    # 프롬프트 조립 형태를 Lambda와 동일하게 유지한다.
    full_prompt = (
        f"{system_prompt}\n\n[이전 대화]\n{req.history}\n\n"
        f"탐정: {req.message}\n용의자:"
    )

    # GEMINI_CHAT_MODEL or GEMINI_MODEL 폴백 (config.chat_model이 담당)
    reply = gemini.call_gemini(full_prompt, get_settings().chat_model)

    # 모순 여부 판정 (1회 재시도 후 False 폴백)
    is_contradiction = check_contradiction(suspect, case_data, req.message, reply)

    return ChatResponse(reply=reply, isContradiction=is_contradiction)


# ─────────────────────────── 추리 평가 ───────────────────────────
@router.post("/evaluate", response_model=EvaluateResponse)
@limiter.limit(_settings.rate_limit_evaluate, key_func=global_key)
def evaluate(request: Request, req: EvaluateRequest) -> EvaluateResponse:
    doc = _load_scenario(req.scenarioId)
    case_data = doc.get("case_data") or {}

    truth = case_data.get("solution") or "No solution provided in case data."
    real_culprit = find_culprit(case_data)
    real_culprit_name = (real_culprit or {}).get("name", "Unknown")

    eval_prompt = generate_evaluation_prompt(
        truth,
        real_culprit_name,
        req.deductionData.culpritName,
        req.deductionData.reasoning,
        req.deductionData.isOverTime,
    )
    # 평가는 기본 모델을 쓴다 (chat 모델이 아니다) — Lambda와 동일.
    result_text = gemini.call_gemini(eval_prompt)

    grade_match = _GRADE_RE.search(result_text)
    report_match = _REPORT_RE.search(result_text)
    advice_match = _ADVICE_RE.search(result_text)

    # 등급은 첫 줄만 취한다. Lambda의 .split("\n", 1)[0].strip() 그대로.
    grade = (
        grade_match.group(1).strip() if grade_match else _FALLBACK_GRADE
    ).split("\n", 1)[0].strip()
    report = report_match.group(1).strip() if report_match else _FALLBACK_REPORT
    advice = advice_match.group(1).strip() if advice_match else _FALLBACK_ADVICE

    if not grade_match or not report_match:
        logger.warning(
            "평가 응답 파싱 실패 (grade=%s report=%s) | 원문 앞부분=%r",
            bool(grade_match),
            bool(report_match),
            result_text[:300],
        )

    return EvaluateResponse(
        isCorrect=real_culprit_name.strip() == req.deductionData.culpritName.strip(),
        report=report,
        advice=advice,
        grade=grade,
        truth=truth,
        culpritName=real_culprit_name,
    )


# ─────────────────────────── 피드백 ───────────────────────────
@router.post("/feedback")
def submit_feedback(req: FeedbackRequest) -> dict[str, Any]:
    """Lambda의 _game_feedback과 동일. camelCase를 받아 snake_case로 저장한다."""
    result = db.get_feedbacks().insert_one(
        {
            "content": req.content,
            "scenario_id": req.scenarioId,
            "grade": req.grade,
            "game_result": game_result_to_db(req.gameResult),
            "created_at": datetime.now(timezone.utc),
        }
    )
    # POST /feedbacks는 201을 쓰지만 이 경로는 Lambda와 동일하게 200 + ok를 유지한다.
    return {"ok": True, "_id": str(result.inserted_id)}


# ─────────────────────── 저장된 사건 불러오기 ───────────────────────
@router.get("/scenario/{scenario_id}")
def get_scenario_sanitized(scenario_id: str, response: Response) -> dict[str, Any]:
    doc = _load_scenario(scenario_id)
    case_data = doc.get("case_data")
    if not case_data:
        raise HTTPException(status_code=500, detail="Invalid scenario data")

    # 정화본이 캐시되면 스포일러 유출 위험이 생긴다. 캐시를 금지한다.
    response.headers["Cache-Control"] = "no-store"
    return sanitize_case_data(case_data)
