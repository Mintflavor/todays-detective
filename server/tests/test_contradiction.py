# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 모순 감지(Contradiction Check) 단위 및 통합 테스트.

from typing import Any
import pytest
from app import gemini
from app.prompts import generate_contradiction_check_prompt
from app.routers.game import check_contradiction


SAMPLE_SUSPECT = {
    "id": 1,
    "name": "홍길동",
    "role": "경비원",
    "real_action": "오후 10시에 몰래 관리실을 비우고 창고에서 담배를 피웠음",
    "secret": "근무 태만 사실을 숨기고 싶어함",
    "alibi_claim": "오후 10시 내내 관리실에서 CCTV를 보고 있었다고 주장",
    "isCulprit": False,
}

SAMPLE_WORLD = {
    "location": "낡은 상가 건물",
    "weather": "비가 내리고 안개가 짙음",
}

SAMPLE_TIMELINE = [
    "21:30 피해자 건물 진입",
    "22:00 관리실 CCTV 전원 꺼짐",
    "22:30 피해자 사망 추정",
]

SAMPLE_EVIDENCE = [
    {"name": "담배꽁초", "description": "창고 뒤편에서 발견된 특정 브랜드 꽁초"},
]


class TestContradictionPrompt:
    def test_prompt_content_and_spoiler_protection(self):
        prompt = generate_contradiction_check_prompt(
            SAMPLE_SUSPECT,
            SAMPLE_WORLD,
            SAMPLE_TIMELINE,
            SAMPLE_EVIDENCE,
            question="10시에 어디 계셨습니까?",
            reply="저는 계속 관리실을 지켰습니다.",
        )
        # 스포일러 방지: isCulprit 관련 지시가 프롬프트에 없어야 한다.
        assert "진범입니다" not in prompt
        assert "isCulprit" not in prompt
        assert "결백합니다" not in prompt

        # 필수 단서 및 질문/답변 포함 확인
        assert "낡은 상가 건물" in prompt
        assert "담배꽁초" in prompt
        assert "CCTV를 보고 있었다" in prompt
        assert "10시에 어디 계셨습니까?" in prompt
        assert "저는 계속 관리실을 지켰습니다." in prompt
        assert "[CONTRADICTION: TRUE]" in prompt
        assert "[CONTRADICTION: FALSE]" in prompt


class TestCheckContradiction:
    def test_contradiction_true(self, monkeypatch):
        monkeypatch.setattr(
            gemini, "call_gemini", lambda prompt, model=None: "[CONTRADICTION: TRUE]\n모순 감지됨"
        )
        case_data = {
            "world_setting": SAMPLE_WORLD,
            "timeline_truth": SAMPLE_TIMELINE,
            "evidence_list": SAMPLE_EVIDENCE,
        }
        res = check_contradiction(SAMPLE_SUSPECT, case_data, "질문", "답변")
        assert res is True

    def test_contradiction_false(self, monkeypatch):
        monkeypatch.setattr(
            gemini, "call_gemini", lambda prompt, model=None: "[CONTRADICTION: FALSE]\n일치함"
        )
        case_data = {
            "world_setting": SAMPLE_WORLD,
            "timeline_truth": SAMPLE_TIMELINE,
            "evidence_list": SAMPLE_EVIDENCE,
        }
        res = check_contradiction(SAMPLE_SUSPECT, case_data, "질문", "답변")
        assert res is False

    def test_retry_on_first_failure(self, monkeypatch):
        attempts = 0

        def flaky_gemini(prompt, model=None):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise RuntimeError("Temporary Network Error")
            return "[CONTRADICTION: TRUE]"

        monkeypatch.setattr(gemini, "call_gemini", flaky_gemini)
        case_data = {
            "world_setting": SAMPLE_WORLD,
            "timeline_truth": SAMPLE_TIMELINE,
            "evidence_list": SAMPLE_EVIDENCE,
        }
        res = check_contradiction(SAMPLE_SUSPECT, case_data, "질문", "답변")
        assert res is True
        assert attempts == 2

    def test_fallback_to_false_on_total_failure(self, monkeypatch):
        calls = 0

        def failing_gemini(prompt, model=None):
            nonlocal calls
            calls += 1
            raise RuntimeError("API Timeout")

        monkeypatch.setattr(gemini, "call_gemini", failing_gemini)
        case_data = {
            "world_setting": SAMPLE_WORLD,
            "timeline_truth": SAMPLE_TIMELINE,
            "evidence_list": SAMPLE_EVIDENCE,
        }
        res = check_contradiction(SAMPLE_SUSPECT, case_data, "질문", "답변")
        assert res is False
        assert calls == 2


class TestChatEndpointContradiction:
    def test_chat_returns_contradiction_flag(self, client, monkeypatch, saved_scenario):
        call_count = 0

        def mock_gemini(prompt, model=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return "저는 주방에 있었습니다."
            return "[CONTRADICTION: TRUE]"

        monkeypatch.setattr(gemini, "call_gemini", mock_gemini)

        r = client.post("/api/game/chat", json={
            "scenarioId": saved_scenario,
            "suspectId": 2,
            "message": "어디 계셨습니까?",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["reply"] == "저는 주방에 있었습니다."
        assert data["isContradiction"] is True
