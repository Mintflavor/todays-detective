# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 공통 픅스처.
#
# 원칙 두 가지:
#   1. **테스트가 Gemini를 호출하지 않는다.** 호출 시 즉시 실패한다 (비용 발생 방지).
#   2. **운영 데이터를 건드리지 않는다.** 전용 *_pytest 컬렉션을 쓰고 매 테스트마다 비운다.

import io
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

# 앱 전용 계정(detective)은 todays_detective DB에만 readWrite 권한이 있다.
# 별도 DB를 만들면 권한 오류가 나므로 **같은 DB의 전용 컬렉션**을 쓴다.
# 운영 컬렉션(scenarios, feedbacks)은 건드리지 않는다.
TEST_SCENARIOS = "scenarios_pytest"
TEST_FEEDBACKS = "feedbacks_pytest"


# ─────────────────────── Gemini 차단 (autouse) ───────────────────────
@pytest.fixture(autouse=True)
def block_gemini(monkeypatch):
    """어떤 테스트도 실제 Gemini를 호출하지 못하게 한다.

    호출이 필요한 테스트는 이 픅스처가 심어둔 함수를 다시 monkeypatch해서 쓴다.
    실수로 실제 호출이 새어나가면 비용이 발생하므로 기본은 '즉시 실패'다.
    """
    from app import gemini

    def _boom(*args: Any, **kwargs: Any):
        raise AssertionError(
            "테스트가 실제 Gemini를 호출하려 했습니다. mock을 사용하세요."
        )

    monkeypatch.setattr(gemini, "call_gemini", _boom)
    monkeypatch.setattr(gemini, "generate_portrait_image", _boom)
    # 클라이언트 생성 자체도 막는다 (API 키 유효성에 의존하지 않게)
    monkeypatch.setattr(gemini, "get_client", _boom)


# ─────────────────────────── 테스트 DB ───────────────────────────
class _TestCollections:
    """테스트 컬렉션에 dict처럼 접근하게 해주는 얇은 래퍼.

    테스트 코드가 test_db["scenarios"] 로 쓰면 실제로는 scenarios_pytest를 가리킨다.
    """

    _MAP = {"scenarios": TEST_SCENARIOS, "feedbacks": TEST_FEEDBACKS}

    def __init__(self, database):
        self._db = database

    def __getitem__(self, name: str):
        # 매번 새 핸들을 얻어 lifespan의 db.close() 이후에도 안전하게 동작한다.
        from app import db

        return db.get_db()[self._MAP.get(name, name)]


def _drop_test_collections() -> None:
    """정리 시점에 DB 핸들을 새로 얻는다.

    client 픅스처가 TestClient 컨텍스트를 닫을 때 lifespan이 db.close()를 호출하므로,
    setup 때 잡아둔 핸들을 재사용하면 "Cannot use MongoClient after close"가 난다.
    db.close()는 내부 캐시를 비우기 때문에 get_db()를 다시 부르면 새 연결이 생긴다.
    """
    from app import db

    database = db.get_db()
    for name in (TEST_SCENARIOS, TEST_FEEDBACKS):
        database.drop_collection(name)


@pytest.fixture
def test_db(monkeypatch):
    """라우터가 운영 컬렉션 대신 *_pytest 컬렉션을 쓰도록 갈아끼운다."""
    from app import db

    _drop_test_collections()
    database = db.get_db()

    monkeypatch.setattr(db, "get_scenarios", lambda: db.get_db()[TEST_SCENARIOS])
    monkeypatch.setattr(db, "get_feedbacks", lambda: db.get_db()[TEST_FEEDBACKS])

    yield _TestCollections(database)

    _drop_test_collections()


@pytest.fixture
def client(test_db):
    """TestClient. test_db에 의존하므로 라우터가 테스트 컬렉션을 쓴다."""
    from app.main import app

    with TestClient(app) as c:
        yield c


# ─────────────────────────── 데이터 픅스처 ───────────────────────────
@pytest.fixture
def full_case() -> dict[str, Any]:
    """정화되지 않은 원본 사건. 프롬프트 스키마를 따른다."""
    return {
        "title": "폭우 속의 밀실",
        "summary": "저택 서재에서 주인이 숨진 채 발견됐다.",
        "crime_type": "살인",
        "world_setting": {"location": "2층 저택의 서재", "weather": "폭우로 고립됨"},
        "victim_info": {
            "name": "박정한",
            "damage_details": "둔기에 의한 후두부 손상",
            "body_condition": "책상에 엎드린 상태",
            "incident_time": "22:10경",
        },
        "evidence_list": [
            {"name": "젖은 우산", "description": "현관에 놓인 마르지 않은 우산"}
        ],
        "timeline_truth": ["21:00 - 만찬 종료", "22:10 - 서재 불이 꺼짐"],
        "suspects": [
            {
                "id": 1,
                "name": "이하늘",
                "role": "조카",
                "gender": "Female",
                "age": 29,
                "personality": "신경질적인",
                "image_prompt_keywords": "long hair, sharp eyes",
                "secret": "도박 빚이 있다",
                "isCulprit": False,
                "real_action": "22:00에 2층 침실에 있었다",
                "alibi_claim": "방에서 자고 있었다",
            },
            {
                "id": 2,
                "name": "김서준",
                "role": "집사",
                "gender": "Male",
                "age": 47,
                "personality": "침착한",
                "image_prompt_keywords": "slicked back hair",
                "secret": "유언장을 미리 봤다",
                "isCulprit": True,
                "motive": "해고 통보를 받았다",
                "trick": "우산으로 창을 밖에서 잠갔다",
                "real_action": "22:10에 서재로 들어갔다",
                "alibi_claim": "주방에서 은식기를 닦았다",
            },
            {
                "id": 3,
                "name": "강도현",
                "role": "정원사",
                "gender": "Male",
                "age": 55,
                "personality": "말이 없는",
                "image_prompt_keywords": "weathered face",
                "secret": "저택 열쇠를 복사했다",
                "isCulprit": False,
                "real_action": "창고에서 비를 피했다",
                "alibi_claim": "창고에 있었다",
            },
        ],
        "solution": "집사 김서준이 해고에 분노해 범행했다.",
    }


@pytest.fixture
def tiny_jpeg() -> bytes:
    """업로드 경로 테스트용 최소 정사각형 JPEG (Gemini 호출 대체)."""
    buf = io.BytesIO()
    Image.new("RGB", (1024, 1024), (200, 200, 200)).save(buf, format="JPEG", quality=50)
    return buf.getvalue()


@pytest.fixture
def evaluation_text() -> str:
    """실제 Gemini 평가 응답 형태."""
    return (
        "[JUDGMENT]\n성공\n\n"
        "[GRADE]\nA\n\n"
        "[REPORT]\n탐정님의 추리는 정확했습니다. 알리바이 모순을 젖은 우산으로 입증했습니다.\n"
        "다만 동기에 대한 언급이 부족했습니다.\n\n"
        "[ADVICE]\n아쉬운 점: 유언장의 존재를 물어봤어야 했다.\n"
    )
