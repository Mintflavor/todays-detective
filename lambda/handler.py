# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import json
import logging
import os
import re

# 초상화 병렬 생성 비활성화로 ThreadPoolExecutor는 현재 미사용. 복원 시 다음 import도 함께 복원.
# from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from bson import ObjectId
from pymongo import MongoClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_client = None

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Content-Type": "application/json",
}


def _get_db():
    global _client
    if _client is None:
        _client = MongoClient(
            os.environ["MONGODB_URL"],
            authMechanism="MONGODB-AWS",
            serverSelectionTimeoutMS=5000,
        )
    return _client["todays_detective"]


def get_collection():
    return _get_db()["scenarios"]


def get_feedback_collection():
    return _get_db()["feedbacks"]


def response(status, body):
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, default=str, ensure_ascii=False),
    }


# --- Spoiler sanitization ---
_SPOILER_TOP_FIELDS = ("solution", "timeline_truth", "truth")
_SPOILER_SUSPECT_FIELDS = ("isCulprit", "secret", "real_action", "motive", "trick")


def _sanitize_case_data(case_data):
    sanitized = {k: v for k, v in case_data.items() if k not in _SPOILER_TOP_FIELDS}
    suspects = sanitized.get("suspects") or []
    sanitized["suspects"] = [
        {k: v for k, v in s.items() if k not in _SPOILER_SUSPECT_FIELDS}
        for s in suspects
    ]
    return sanitized


# --- Game endpoints (lazy imports so /scenarios, /feedbacks stay lightweight) ---
def _game_start(body):
    # API Gateway 30초 timeout 회피를 위해 Gemini로 새 시나리오를 생성하는 대신
    # DB에 저장된 기존 시나리오를 랜덤으로 1건 반환한다.
    # (평가 시점엔 scenarioId로 원본 doc을 다시 읽어 정답 확인이 가능하므로 재사용해도 무방)
    #
    # 클라이언트가 보낸 excludeIds는 최근 플레이한 시나리오 _id 목록이며,
    # 가능한 한 새로운 시나리오를 뽑기 위해 $match에서 제외한다.
    # 모든 시나리오가 제외되어 결과가 0건이면 제외 없이 다시 랜덤한다.
    col = get_collection()

    exclude_ids = []
    raw_exclude = body.get("excludeIds") or []
    if isinstance(raw_exclude, list):
        for sid in raw_exclude:
            try:
                exclude_ids.append(ObjectId(sid))
            except Exception:
                continue

    base_match = {"case_data": {"$exists": True, "$ne": None}}

    def _sample_with_match(match):
        return list(col.aggregate([{"$match": match}, {"$sample": {"size": 1}}]))

    docs = []
    if exclude_ids:
        match = {**base_match, "_id": {"$nin": exclude_ids}}
        docs = _sample_with_match(match)
    if not docs:
        docs = _sample_with_match(base_match)
    if not docs:
        return response(500, {"detail": "No scenarios available"})

    doc = docs[0]
    case_data = doc.get("case_data") or {}
    if not case_data:
        return response(500, {"detail": "Invalid scenario data"})

    return response(
        200,
        {
            "scenarioId": str(doc["_id"]),
            "caseData": _sanitize_case_data(case_data),
        },
    )


def _game_chat(body):
    from gemini_client import call_gemini
    from prompts import generate_suspect_prompt

    scenario_id = body.get("scenarioId")
    suspect_id = body.get("suspectId")
    message = body.get("message")
    history = body.get("history", "")

    if not scenario_id or suspect_id is None or not message:
        return response(400, {"detail": "Missing required parameters"})

    col = get_collection()
    try:
        doc = col.find_one({"_id": ObjectId(scenario_id)})
    except Exception:
        return response(400, {"detail": "Invalid scenario id"})
    if not doc:
        return response(404, {"detail": "Scenario not found"})

    case_data = doc.get("case_data") or {}
    suspect = next(
        (s for s in case_data.get("suspects", []) if s.get("id") == suspect_id),
        None,
    )
    if suspect is None:
        return response(404, {"detail": "Suspect not found"})

    system_prompt = generate_suspect_prompt(
        suspect,
        case_data.get("world_setting") or {},
        case_data.get("timeline_truth") or [],
        case_data.get("evidence_list") or [],
    )
    full_prompt = (
        f"{system_prompt}\n\n[이전 대화]\n{history}\n\n탐정: {message}\n용의자:"
    )
    chat_model = os.environ.get("GEMINI_CHAT_MODEL") or os.environ.get("GEMINI_MODEL")
    reply = call_gemini(full_prompt, chat_model)
    return response(200, {"reply": reply})


_GRADE_RE = re.compile(r"\[GRADE[^\]]*\]\s*(.*)")
_REPORT_RE = re.compile(r"\[REPORT[^\]]*\]\s*([\s\S]*?)(?=\[ADVICE[^\]]*\]|$)")
_ADVICE_RE = re.compile(r"\[ADVICE[^\]]*\]\s*([\s\S]*)")


def _game_evaluate(body):
    from gemini_client import call_gemini
    from prompts import generate_evaluation_prompt

    scenario_id = body.get("scenarioId")
    deduction = body.get("deductionData") or {}
    culprit_name = deduction.get("culpritName")
    reasoning = deduction.get("reasoning")
    is_over_time = bool(deduction.get("isOverTime"))

    if not scenario_id or not culprit_name or not reasoning:
        return response(400, {"detail": "Missing required parameters"})

    col = get_collection()
    try:
        doc = col.find_one({"_id": ObjectId(scenario_id)})
    except Exception:
        return response(400, {"detail": "Invalid scenario id"})
    if not doc:
        return response(404, {"detail": "Scenario not found"})

    case_data = doc.get("case_data") or {}
    truth = case_data.get("solution") or "No solution provided in case data."
    real_culprit = next(
        (s for s in case_data.get("suspects", []) if s.get("isCulprit")),
        None,
    )
    real_culprit_name = (real_culprit or {}).get("name", "Unknown")

    eval_prompt = generate_evaluation_prompt(
        truth, real_culprit_name, culprit_name, reasoning, is_over_time
    )
    result_text = call_gemini(eval_prompt)

    grade_match = _GRADE_RE.search(result_text)
    report_match = _REPORT_RE.search(result_text)
    advice_match = _ADVICE_RE.search(result_text)

    grade = (grade_match.group(1).strip() if grade_match else "F").split("\n", 1)[0].strip()
    report = report_match.group(1).strip() if report_match else "보고서 생성 실패"
    advice = advice_match.group(1).strip() if advice_match else "조언을 불러올 수 없습니다."
    is_correct = real_culprit_name.strip() == culprit_name.strip()

    return response(
        200,
        {
            "isCorrect": is_correct,
            "report": report,
            "advice": advice,
            "grade": grade,
            "truth": truth,
            "culpritName": real_culprit_name,
        },
    )


def _game_feedback(body):
    """기존 POST /feedbacks와 동일 저장 로직 — camelCase payload를 받아 snake_case로 저장."""
    content = (body.get("content") or "").strip()
    if not content:
        return response(400, {"detail": "피드백 내용이 비어있습니다."})
    if len(content) > 300:
        return response(400, {"detail": "피드백은 최대 300자까지 입력할 수 있습니다."})

    game_result_payload = None
    gr = body.get("gameResult")
    if isinstance(gr, dict):
        game_result_payload = {
            "scenario_title": gr.get("scenarioTitle"),
            "selected_suspect_id": gr.get("selectedSuspectId"),
            "selected_suspect_name": gr.get("selectedSuspectName"),
            "reasoning": gr.get("reasoning"),
            "is_correct": gr.get("isCorrect"),
            "grade": gr.get("grade"),
            "culprit_name": gr.get("culpritName"),
            "report": gr.get("report"),
            "advice": gr.get("advice"),
            "time_taken": gr.get("timeTaken"),
        }

    fb_col = get_feedback_collection()
    result = fb_col.insert_one(
        {
            "content": content,
            "scenario_id": body.get("scenarioId"),
            "grade": body.get("grade"),
            "game_result": game_result_payload,
            "created_at": datetime.now(timezone.utc),
        }
    )
    return response(200, {"ok": True, "_id": str(result.inserted_id)})


def _game_scenario_sanitized(scenario_id):
    col = get_collection()
    try:
        doc = col.find_one({"_id": ObjectId(scenario_id)})
    except Exception:
        return response(400, {"detail": "Invalid scenario id"})
    if not doc:
        return response(404, {"detail": "Scenario not found"})
    case_data = doc.get("case_data")
    if not case_data:
        return response(500, {"detail": "Invalid scenario data"})
    return response(200, _sanitize_case_data(case_data))


def handler(event, context):
    method = (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method", "")
    )
    path = event.get("path") or event.get("rawPath", "")
    raw_body = event.get("body") or "{}"
    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        return response(400, {"detail": "Invalid JSON body"})
    params = event.get("queryStringParameters") or {}

    if method == "OPTIONS":
        return response(200, {})

    # --- Game endpoints (new) ---
    if method == "POST" and path.rstrip("/") == "/api/game/start":
        return _game_start(body)

    if method == "POST" and path.rstrip("/") == "/api/game/chat":
        return _game_chat(body)

    if method == "POST" and path.rstrip("/") == "/api/game/evaluate":
        return _game_evaluate(body)

    if method == "POST" and path.rstrip("/") == "/api/game/feedback":
        return _game_feedback(body)

    if method == "GET" and path.startswith("/api/game/scenario/"):
        sid = path.rstrip("/").split("/")[-1]
        return _game_scenario_sanitized(sid)

    # --- Existing endpoints (preserve original behavior) ---
    col = get_collection()

    if method == "POST" and path.rstrip("/") == "/scenarios":
        doc = {
            "title": body.get("title", ""),
            "summary": body.get("summary", ""),
            "crime_type": body.get("crime_type", "Unknown"),
            "case_data": body.get("case_data", {}),
            "created_at": datetime.now(timezone.utc),
        }
        result = col.insert_one(doc)
        return response(201, {"_id": str(result.inserted_id)})

    if method == "GET" and path.rstrip("/") == "/scenarios":
        page = max(int(params.get("page", 1)), 1)
        limit = min(max(int(params.get("limit", 10)), 1), 50)
        filt = {}
        if params.get("crime_type"):
            filt["crime_type"] = params["crime_type"]
        skip = (page - 1) * limit
        docs = list(
            col.find(filt, {"case_data": 0})
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )
        for d in docs:
            d["_id"] = str(d["_id"])
        return response(200, docs)

    if method == "GET" and path.startswith("/scenarios/"):
        sid = path.rstrip("/").split("/")[-1]
        try:
            doc = col.find_one({"_id": ObjectId(sid)})
        except Exception:
            return response(400, {"detail": "Invalid id"})
        if not doc:
            return response(404, {"detail": "Not found"})
        doc["_id"] = str(doc["_id"])
        return response(200, doc)

    if method == "DELETE" and path.startswith("/scenarios/"):
        sid = path.rstrip("/").split("/")[-1]
        try:
            result = col.delete_one({"_id": ObjectId(sid)})
        except Exception:
            return response(400, {"detail": "Invalid id"})
        if result.deleted_count == 0:
            return response(404, {"detail": "Not found"})
        return response(200, {"deleted": sid})

    if method == "POST" and path.rstrip("/") == "/feedbacks":
        content = (body.get("content") or "").strip()
        if not content:
            return response(400, {"detail": "content is required"})
        if len(content) > 300:
            return response(400, {"detail": "content exceeds 300 characters"})
        fb_col = get_feedback_collection()
        doc = {
            "content": content,
            "scenario_id": body.get("scenario_id"),
            "grade": body.get("grade"),
            "game_result": body.get("game_result"),
            "created_at": datetime.now(timezone.utc),
        }
        result = fb_col.insert_one(doc)
        return response(201, {"_id": str(result.inserted_id)})

    if method == "GET" and path.rstrip("/") == "/feedbacks":
        page = max(int(params.get("page", 1)), 1)
        limit = min(max(int(params.get("limit", 10)), 1), 50)
        skip = (page - 1) * limit
        fb_col = get_feedback_collection()
        docs = list(
            fb_col.find({})
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )
        for d in docs:
            d["_id"] = str(d["_id"])
            gr = d.get("game_result")
            if isinstance(gr, dict):
                d["game_result"] = {
                    "scenarioTitle": gr.get("scenario_title"),
                    "selectedSuspectId": gr.get("selected_suspect_id"),
                    "selectedSuspectName": gr.get("selected_suspect_name"),
                    "reasoning": gr.get("reasoning"),
                    "isCorrect": gr.get("is_correct"),
                    "grade": gr.get("grade"),
                    "culpritName": gr.get("culprit_name"),
                    "report": gr.get("report"),
                    "advice": gr.get("advice"),
                    "timeTaken": gr.get("time_taken"),
                }
        return response(200, docs)

    if method == "DELETE" and path.startswith("/feedbacks/"):
        fid = path.rstrip("/").split("/")[-1]
        fb_col = get_feedback_collection()
        try:
            result = fb_col.delete_one({"_id": ObjectId(fid)})
        except Exception:
            return response(400, {"detail": "Invalid id"})
        if result.deleted_count == 0:
            return response(404, {"detail": "Not found"})
        return response(200, {"deleted": fid})

    return response(404, {"detail": "Not found"})
