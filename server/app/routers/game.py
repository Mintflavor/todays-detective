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
from fastapi import APIRouter, HTTPException, Response

from .. import db, gemini, storage
from ..config import get_settings
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
    CASE_GENERATION_PROMPT,
    generate_evaluation_prompt,
    generate_portrait_prompt,
    generate_suspect_prompt,
)
from ..sanitize import find_culprit, sanitize_case_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/game", tags=["game"])

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


@router.post("/start", response_model=GameStartResponse)
def start_case() -> GameStartResponse:
    """새 사건을 생성해 저장하고 정화본을 반환한다.

    수십 초가 걸린다 (텍스트 1회 + 이미지 3장). 프록시 타임아웃을 넉넉히 둘 것.
    """
    # TODO(Phase 5.5): 레이트 리밋. 이 엔드포인트 1회 = Gemini 텍스트 1회 + 이미지 3장의 실비.
    settings = get_settings()

    raw = gemini.call_gemini(CASE_GENERATION_PROMPT, settings.gemini_model)
    case_data = _parse_case_json(raw)

    suspects = case_data.get("suspects") or []
    if not suspects:
        logger.error("생성된 사건에 suspects가 없습니다: keys=%s", list(case_data.keys()))
        raise HTTPException(status_code=500, detail="Invalid generated case data")

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
@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
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
    )
    # 프롬프트 조립 형태를 Lambda와 동일하게 유지한다.
    full_prompt = (
        f"{system_prompt}\n\n[이전 대화]\n{req.history}\n\n"
        f"탐정: {req.message}\n용의자:"
    )

    # GEMINI_CHAT_MODEL or GEMINI_MODEL 폴백 (config.chat_model이 담당)
    reply = gemini.call_gemini(full_prompt, get_settings().chat_model)
    return ChatResponse(reply=reply)


# ─────────────────────────── 추리 평가 ───────────────────────────
@router.post("/evaluate", response_model=EvaluateResponse)
def evaluate(req: EvaluateRequest) -> EvaluateResponse:
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
