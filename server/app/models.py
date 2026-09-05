# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 요청·응답 모델. Lambda가 dict을 직접 파싱하던 부분을 Pydantic으로 대체한다.
#
# 설계 방침: case_data는 **엄격한 모델로 만들지 않는다.**
#   LLM이 생성하는 JSON이라 필드가 유동적이고, 스키마를 강제하면 정상 시나리오까지 422로
#   튕겨낸다. 검증은 게임 진행에 반드시 필요한 최소 조건(suspects 존재 등)만 하고
#   나머지는 dict으로 통과시킨다.

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

CaseData = dict[str, Any]


# ─────────────────────────── 게임 ───────────────────────────
class GameStartResponse(BaseModel):
    scenarioId: str
    caseData: CaseData


class ChatRequest(BaseModel):
    scenarioId: str
    suspectId: int
    message: str
    history: str = ""
    presentedEvidenceName: Optional[str] = None
    unlockedEvidenceNames: list[str] = Field(default_factory=list)

    @field_validator("message")
    @classmethod
    def _message_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("message는 비어 있을 수 없습니다")
        return v


class ChatResponse(BaseModel):
    reply: str
    isContradiction: bool = False
    unlockedEvidence: Optional[dict[str, Any]] = None


class DeductionData(BaseModel):
    culpritName: str
    reasoning: str
    isOverTime: bool = False
    unlockedEvidenceNames: list[str] = Field(default_factory=list)

    @field_validator("culpritName", "reasoning")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("값이 비어 있을 수 없습니다")
        return v


class EvaluateRequest(BaseModel):
    scenarioId: str
    deductionData: DeductionData


class EvaluateResponse(BaseModel):
    isCorrect: bool
    report: str
    advice: str
    grade: str
    truth: str
    culpritName: str


# ─────────────────────────── 사건 Q&A (진실 질의응답) ───────────────────────────
class QAMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    role: str  # "user" | "model" | "assistant"
    content: str


class QARequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    scenarioId: str
    question: str
    history: list[QAMessage] = Field(default_factory=list)

    @field_validator("question")
    @classmethod
    def _question_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("question은 비어 있을 수 없습니다")
        return v.strip()


class QAResponse(BaseModel):
    answer: str


# ─────────────────────────── 피드백 ───────────────────────────
# 클라이언트는 camelCase로 보내고, DB에는 snake_case로 저장한다.
# Lambda의 _game_feedback / GET /feedbacks 매핑을 그대로 유지한다.
_GAME_RESULT_FIELDS: tuple[tuple[str, str], ...] = (
    # (camelCase, snake_case)
    ("scenarioTitle", "scenario_title"),
    ("selectedSuspectId", "selected_suspect_id"),
    ("selectedSuspectName", "selected_suspect_name"),
    ("reasoning", "reasoning"),
    ("isCorrect", "is_correct"),
    ("grade", "grade"),
    ("culpritName", "culprit_name"),
    ("report", "report"),
    ("advice", "advice"),
    ("timeTaken", "time_taken"),
)

FEEDBACK_MAX_LENGTH = 300


class FeedbackGameResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    scenarioTitle: Optional[str] = None
    selectedSuspectId: Optional[int] = None
    selectedSuspectName: Optional[str] = None
    reasoning: Optional[str] = None
    isCorrect: Optional[bool] = None
    grade: Optional[str] = None
    culpritName: Optional[str] = None
    report: Optional[str] = None
    advice: Optional[str] = None
    timeTaken: Optional[str] = None


class FeedbackRequest(BaseModel):
    content: str
    scenarioId: Optional[str] = None
    grade: Optional[str] = None
    gameResult: Optional[FeedbackGameResult] = None

    @field_validator("content")
    @classmethod
    def _content_rules(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("피드백 내용이 비어있습니다.")
        if len(stripped) > FEEDBACK_MAX_LENGTH:
            raise ValueError(
                "피드백은 최대 %d자까지 입력할 수 있습니다." % FEEDBACK_MAX_LENGTH
            )
        return stripped


def game_result_to_db(gr: Optional[FeedbackGameResult]) -> Optional[dict[str, Any]]:
    """camelCase 모델 → snake_case DB 문서. Lambda 저장 형태와 동일하다."""
    if gr is None:
        return None
    data = gr.model_dump()
    return {snake: data.get(camel) for camel, snake in _GAME_RESULT_FIELDS}


def game_result_from_db(doc: Any) -> Optional[dict[str, Any]]:
    """snake_case DB 문서 → camelCase 응답. Lambda 조회 형태와 동일하다."""
    if not isinstance(doc, dict):
        return None
    return {camel: doc.get(snake) for camel, snake in _GAME_RESULT_FIELDS}


class FeedbackItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    # Python에서 선행 밑줄은 private 취급이라 alias로 노출한다.
    id: str = Field(alias="_id")
    content: str
    scenario_id: Optional[str] = None
    grade: Optional[str] = None
    created_at: Optional[datetime] = None
    game_result: Optional[dict[str, Any]] = None


# ─────────────────────────── 시나리오 ───────────────────────────
class ScenarioCreate(BaseModel):
    title: str = ""
    summary: str = ""
    crime_type: str = "Unknown"
    case_data: CaseData = Field(default_factory=dict)


class ScenarioCreated(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")


class ScenarioListItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    title: str = ""
    summary: str = ""
    crime_type: str = "Unknown"
    created_at: Optional[datetime] = None


class DeleteResult(BaseModel):
    deleted: str
