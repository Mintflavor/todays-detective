# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 피드백 CRUD. lambda/handler.py의 /feedbacks 라우트를 이식했다.
#
# ⚠️ POST /feedbacks 와 POST /api/game/feedback 은 **입력 형식이 다르다.**
#    - 이 경로     : snake_case (scenario_id, game_result) — 그대로 저장
#    - 게임 경로   : camelCase (scenarioId, gameResult)    — 변환해서 저장
#    Lambda가 그렇게 동작했으므로 유지한다. 응답 코드도 다르다 (201 vs 200).

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator

from .. import db
from ..auth import require_admin
from ..models import (
    FEEDBACK_MAX_LENGTH,
    DeleteResult,
    FeedbackItem,
    game_result_from_db,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feedbacks", tags=["feedbacks"])


class FeedbackCreateSnake(BaseModel):
    """이 경로는 snake_case를 받는다 (게임 경로의 camelCase와 다르다)."""

    content: str
    scenario_id: Optional[str] = None
    grade: Optional[str] = None
    game_result: Optional[dict[str, Any]] = None

    @field_validator("content")
    @classmethod
    def _content_rules(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("content is required")
        if len(stripped) > FEEDBACK_MAX_LENGTH:
            raise ValueError(
                "content exceeds %d characters" % FEEDBACK_MAX_LENGTH
            )
        return stripped


@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
def create_feedback(payload: FeedbackCreateSnake) -> dict[str, str]:
    result = db.get_feedbacks().insert_one(
        {
            "content": payload.content,
            "scenario_id": payload.scenario_id,
            "grade": payload.grade,
            "game_result": payload.game_result,
            "created_at": datetime.now(timezone.utc),
        }
    )
    return {"_id": str(result.inserted_id)}


@router.get("", response_model=list[FeedbackItem], dependencies=[Depends(require_admin)])
@router.get("/", response_model=list[FeedbackItem],
            dependencies=[Depends(require_admin)], include_in_schema=False)
def list_feedbacks(
    page: int = Query(1),
    limit: int = Query(10),
) -> list[FeedbackItem]:
    """목록. game_result를 snake_case → camelCase로 역매핑한다 (Lambda와 동일).

    관리자 전용 — 다른 사용자의 추리 내용과 게임 결과가 담겨 있다.
    """
    page = max(page, 1)
    limit = min(max(limit, 1), 50)

    docs = list(
        db.get_feedbacks()
        .find({})
        .sort("created_at", -1)
        .skip((page - 1) * limit)
        .limit(limit)
    )
    for d in docs:
        d["_id"] = str(d["_id"])
        gr = d.get("game_result")
        if isinstance(gr, dict):
            d["game_result"] = game_result_from_db(gr)
    return [FeedbackItem.model_validate(d) for d in docs]


@router.delete("/{feedback_id}", response_model=DeleteResult,
               dependencies=[Depends(require_admin)])
def delete_feedback(feedback_id: str) -> DeleteResult:
    try:
        oid = ObjectId(feedback_id)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="Invalid id")

    result = db.get_feedbacks().delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    logger.info("피드백 삭제: %s", feedback_id)
    return DeleteResult(deleted=feedback_id)
