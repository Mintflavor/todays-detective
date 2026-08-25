# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 시나리오 CRUD. lambda/handler.py의 /scenarios 라우트를 이식했다.
#
# ⚠️ 에러 메시지가 게임 라우터와 다르다 — CRUD는 "Invalid id", 게임은 "Invalid scenario id".
#    Lambda 원문 그대로 유지한다.
#
# ⚠️ GET /scenarios/{id}는 **정화되지 않은 원본**을 반환한다 (solution, isCulprit 포함).
#    관리자 화면(getScenarioDetailFull) 전용이며, Phase 5.3에서 인증 뒤로 옮긴다.
#    플레이어용 정화본은 GET /api/game/scenario/{id}다.

import logging
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Query

from .. import db
from ..models import DeleteResult, ScenarioCreate, ScenarioCreated, ScenarioListItem

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


def _oid(raw: str) -> ObjectId:
    try:
        return ObjectId(raw)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="Invalid id")


# 프론트엔드(app/lib/api.ts)가 후행 슬래시를 붙여 호출한다.
# Lambda는 path.rstrip("/")로 양쪽을 모두 받았다. 307 리다이렉트를 피하려고 두 경로를 등록한다.
@router.post("", status_code=201, response_model=ScenarioCreated)
@router.post("/", status_code=201, response_model=ScenarioCreated, include_in_schema=False)
def create_scenario(payload: ScenarioCreate) -> ScenarioCreated:
    # TODO(Phase 5.2): X-API-Key 필요. 지금은 인증이 없어 쓰레기 데이터 삽입이 가능하다.
    result = db.get_scenarios().insert_one(
        {
            "title": payload.title,
            "summary": payload.summary,
            "crime_type": payload.crime_type,
            "case_data": payload.case_data,
            "created_at": datetime.now(timezone.utc),
        }
    )
    return ScenarioCreated(_id=str(result.inserted_id))


@router.get("", response_model=list[ScenarioListItem])
@router.get("/", response_model=list[ScenarioListItem], include_in_schema=False)
def list_scenarios(
    page: int = Query(1),
    limit: int = Query(10),
    crime_type: str | None = Query(None),
) -> list[ScenarioListItem]:
    """목록. 본문(case_data)은 projection으로 제외한다.

    Lambda는 범위를 벗어난 값을 거부하지 않고 **클램프**했다. 그 동작을 유지한다.
    (page=0 → 1, limit=999 → 50)
    """
    page = max(page, 1)
    limit = min(max(limit, 1), 50)

    filt: dict[str, Any] = {}
    if crime_type:
        filt["crime_type"] = crime_type

    docs = list(
        db.get_scenarios()
        .find(filt, {"case_data": 0})
        .sort("created_at", -1)
        .skip((page - 1) * limit)
        .limit(limit)
    )
    for d in docs:
        d["_id"] = str(d["_id"])
    return [ScenarioListItem.model_validate(d) for d in docs]


@router.get("/{scenario_id}")
def get_scenario(scenario_id: str) -> dict[str, Any]:
    """⚠️ 스포일러 원본을 그대로 반환한다. 관리자 전용 (Phase 5.3에서 인증 추가)."""
    doc = db.get_scenarios().find_one({"_id": _oid(scenario_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    doc["_id"] = str(doc["_id"])
    return doc


@router.delete("/{scenario_id}", response_model=DeleteResult)
def delete_scenario(scenario_id: str) -> DeleteResult:
    # TODO(Phase 5.2): X-API-Key 필요. 지금은 누구나 삭제할 수 있다.
    result = db.get_scenarios().delete_one({"_id": _oid(scenario_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    logger.info("시나리오 삭제: %s", scenario_id)
    return DeleteResult(deleted=scenario_id)
