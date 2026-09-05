# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 증거 제시 및 숨겨진 증거 해금 테스트.

from unittest.mock import patch
from bson import ObjectId
import pytest
from starlette.testclient import TestClient

from app.models import ChatRequest, ChatResponse
from app.prompts import generate_evaluation_prompt, generate_suspect_prompt
from app.routers.game import chat, evaluate


def test_suspect_prompt_with_presented_evidence():
    suspect = {"id": 1, "name": "김철수", "role": "집사", "isCulprit": False}
    world = {"location": "대저택", "weather": "비"}
    timeline = ["20:00 - 정전"]
    evidence = [{"name": "피 묻은 손수건", "description": "주방에서 발견됨"}]
    presented = {"name": "피 묻은 손수건", "description": "주방에서 발견됨"}
    hidden = [
        {
            "name": "찢어진 일기장",
            "description": "서재 책장 뒤",
            "target_suspect_id": 1,
            "trigger_condition": "손수건을 들이밀었을 때",
        }
    ]

    prompt = generate_suspect_prompt(
        suspect,
        world,
        timeline,
        evidence,
        presented_evidence=presented,
        hidden_evidences_for_suspect=hidden,
    )

    assert "[탐정이 지금 당신의 눈앞에 들이민 증거물!]" in prompt
    assert "피 묻은 손수건" in prompt
    assert "[당신이 감추고 있거나 털어놓을 수 있는 숨겨진 단서/증거]" in prompt
    assert "찢어진 일기장" in prompt
    assert "[UNLOCKED: 찢어진 일기장]" in prompt


def test_evaluation_prompt_with_unlocked_evidence():
    prompt = generate_evaluation_prompt(
        truth="사건 진상",
        culprit_name="김철수",
        chosen_suspect_name="김철수",
        reasoning="추리 내용",
        is_over_time=False,
        unlocked_evidence_names=["찢어진 일기장", "황금 열쇠"],
    )

    assert "[탐정이 심문 중 추가로 밝혀낸 숨겨진 증거]" in prompt
    assert "찢어진 일기장, 황금 열쇠" in prompt


class TestChatEndpointEvidenceUnlock:
    def test_chat_unlocks_hidden_evidence_and_strips_tag(self, client: TestClient):
        scenario_id = str(ObjectId())
        case_data = {
            "title": "테스트 사건",
            "evidence_list": [{"name": "초기 증거", "description": "설명"}],
            "hidden_evidence_list": [
                {
                    "name": "숨겨진 열쇠",
                    "description": "화분 밑에서 발견된 금색 열쇠",
                    "target_suspect_id": 1,
                    "trigger_condition": "초기 증거 제시",
                }
            ],
            "suspects": [
                {
                    "id": 1,
                    "name": "용의자A",
                    "role": "비서",
                    "isCulprit": False,
                    "personality": "냉정",
                }
            ],
            "world_setting": {"location": "사무실", "weather": "맑음"},
            "timeline_truth": ["10:00 - 사건 발생"],
            "solution": "진상",
        }

        with patch("app.routers.game._load_scenario", return_value={"case_data": case_data}), \
             patch("app.routers.game.gemini.call_gemini", return_value="사실 그 열쇠는 제가 숨겼습니다. [UNLOCKED: 숨겨진 열쇠]"), \
             patch("app.routers.game.check_contradiction", return_value=False):

            r = client.post(
                "/api/game/chat",
                json={
                    "scenarioId": scenario_id,
                    "suspectId": 1,
                    "message": "이 증거는 무엇입니까?",
                    "presentedEvidenceName": "초기 증거",
                    "unlockedEvidenceNames": [],
                },
            )

            assert r.status_code == 200
            data = r.json()
            # 태그가 reply에서 제거되었는지 확인
            assert "[UNLOCKED:" not in data["reply"]
            assert data["reply"] == "사실 그 열쇠는 제가 숨겼습니다."
            # 해금된 증거 객체가 전달되었는지 확인
            assert data["unlockedEvidence"] is not None
            assert data["unlockedEvidence"]["name"] == "숨겨진 열쇠"
            assert "화분 밑" in data["unlockedEvidence"]["description"]
