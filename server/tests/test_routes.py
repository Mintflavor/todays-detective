# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 라우터 레벨 회귀 테스트. Gemini는 mock, DB는 테스트 DB를 쓴다.
#
# conftest의 block_gemini가 실제 호출을 막으므로, 호출이 필요한 테스트는
# 명시적으로 mock을 심는다. 그래야 "테스트가 돈을 쓰는" 사고가 나지 않는다.

import json

import pytest

from app import gemini, storage
from app.sanitize import assert_no_spoilers


@pytest.fixture
def saved_scenario(test_db, full_case):
    """정화되지 않은 원본을 테스트 DB에 넣고 id를 돌려준다."""
    res = test_db["scenarios"].insert_one(
        {
            "title": full_case["title"],
            "summary": full_case["summary"],
            "crime_type": full_case["crime_type"],
            "case_data": full_case,
        }
    )
    return str(res.inserted_id)


# ─────────────────────────── /healthz ───────────────────────────
def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["mongo"] is True


# ─────────────────────── POST /api/game/start ───────────────────────
class TestStart:
    @pytest.fixture(autouse=True)
    def _mocks(self, monkeypatch, full_case, tiny_jpeg):
        monkeypatch.setattr(
            gemini, "call_gemini",
            lambda *a, **k: json.dumps(full_case, ensure_ascii=False),
        )
        monkeypatch.setattr(gemini, "generate_portrait_image", lambda *a, **k: tiny_jpeg)
        self.uploaded: list[bytes] = []

        def fake_upload(raw, key_prefix="portraits"):
            self.uploaded.append(raw)
            return "https://cdn.test/todays-detective/%s/%d.jpg" % (
                key_prefix, len(self.uploaded))

        monkeypatch.setattr(storage, "upload_portrait", fake_upload)

    def test_returns_scenario_id_and_case(self, client):
        r = client.post("/api/game/start")
        assert r.status_code == 200
        body = r.json()
        assert body["scenarioId"]
        assert body["caseData"]["title"] == "폭우 속의 밀실"

    def test_response_has_no_spoilers(self, client):
        body = client.post("/api/game/start").json()
        assert assert_no_spoilers(body["caseData"]) == []

    def test_db_keeps_unsanitized_original(self, client, test_db):
        from bson import ObjectId

        sid = client.post("/api/game/start").json()["scenarioId"]
        doc = test_db["scenarios"].find_one({"_id": ObjectId(sid)})
        assert doc["case_data"]["solution"]
        assert any(s.get("isCulprit") for s in doc["case_data"]["suspects"])
        assert doc["created_at"] is not None
        assert doc["crime_type"] == "살인"

    def test_three_portraits_attached(self, client):
        body = client.post("/api/game/start").json()
        assert all(s.get("portraitImage") for s in body["caseData"]["suspects"])
        assert len(self.uploaded) == 3

    def test_json_fence_stripped(self, client, monkeypatch, full_case):
        """LLM이 ```json 펜스를 붙여도 파싱돼야 한다."""
        fenced = "```json\n" + json.dumps(full_case, ensure_ascii=False) + "\n```"
        monkeypatch.setattr(gemini, "call_gemini", lambda *a, **k: fenced)
        assert client.post("/api/game/start").status_code == 200

    def test_invalid_json_returns_500(self, client, monkeypatch):
        monkeypatch.setattr(gemini, "call_gemini", lambda *a, **k: "이건 JSON이 아닙니다")
        r = client.post("/api/game/start")
        assert r.status_code == 500
        assert r.json()["detail"] == "Failed to parse generated case data"

    def test_no_suspects_returns_500(self, client, monkeypatch):
        monkeypatch.setattr(
            gemini, "call_gemini", lambda *a, **k: json.dumps({"title": "빈 사건"})
        )
        r = client.post("/api/game/start")
        assert r.status_code == 500
        assert r.json()["detail"] == "Invalid generated case data"

    def test_portrait_failure_is_absorbed(self, client, monkeypatch):
        """초상화가 실패해도 사건 생성은 성공해야 한다 (프론트 아이콘 폴백)."""
        def boom(*a, **k):
            raise RuntimeError("이미지 생성 실패")

        monkeypatch.setattr(gemini, "generate_portrait_image", boom)
        r = client.post("/api/game/start")
        assert r.status_code == 200
        assert not any(s.get("portraitImage") for s in r.json()["caseData"]["suspects"])


# ─────────────────────── POST /api/game/chat ───────────────────────
class TestChat:
    def test_reply(self, client, monkeypatch, saved_scenario):
        captured = {}

        def fake(prompt, model=None):
            captured["prompt"] = prompt
            captured["model"] = model
            return "저는 주방에 있었습니다."

        monkeypatch.setattr(gemini, "call_gemini", fake)
        r = client.post("/api/game/chat", json={
            "scenarioId": saved_scenario, "suspectId": 2,
            "message": "어디 있었습니까?", "history": "탐정: 이름은?\n용의자: 김서준입니다.",
        })
        assert r.status_code == 200
        assert r.json()["reply"] == "저는 주방에 있었습니다."
        # 프롬프트 조립 형태가 Lambda와 같아야 한다
        assert "[이전 대화]" in captured["prompt"]
        assert captured["prompt"].endswith("탐정: 어디 있었습니까?\n용의자:")
        assert "김서준" in captured["prompt"]
        # 심문은 chat 모델을 써야 한다
        from app.config import get_settings
        assert captured["model"] == get_settings().chat_model

    def test_culprit_gets_liar_instruction(self, client, monkeypatch, saved_scenario):
        """진범에게는 '거짓말을 꾸며내라'는 지시가 들어가야 한다."""
        captured = {}
        monkeypatch.setattr(gemini, "call_gemini",
                            lambda p, m=None: captured.setdefault("p", p) or "네")
        client.post("/api/game/chat", json={
            "scenarioId": saved_scenario, "suspectId": 2, "message": "질문"})
        assert "진범입니다" in captured["p"]

    def test_innocent_gets_honest_instruction(self, client, monkeypatch, saved_scenario):
        captured = {}
        monkeypatch.setattr(gemini, "call_gemini",
                            lambda p, m=None: captured.setdefault("p", p) or "네")
        client.post("/api/game/chat", json={
            "scenarioId": saved_scenario, "suspectId": 1, "message": "질문"})
        assert "결백합니다" in captured["p"]

    def test_unknown_suspect_404(self, client, saved_scenario):
        r = client.post("/api/game/chat", json={
            "scenarioId": saved_scenario, "suspectId": 999, "message": "질문"})
        assert r.status_code == 404
        assert r.json()["detail"] == "Suspect not found"

    def test_invalid_scenario_id_400(self, client):
        r = client.post("/api/game/chat", json={
            "scenarioId": "not-an-oid", "suspectId": 1, "message": "질문"})
        assert r.status_code == 400
        assert r.json()["detail"] == "Invalid scenario id"

    def test_missing_scenario_404(self, client):
        r = client.post("/api/game/chat", json={
            "scenarioId": "0" * 24, "suspectId": 1, "message": "질문"})
        assert r.status_code == 404
        assert r.json()["detail"] == "Scenario not found"

    def test_blank_message_422(self, client, saved_scenario):
        r = client.post("/api/game/chat", json={
            "scenarioId": saved_scenario, "suspectId": 1, "message": "   "})
        assert r.status_code == 422


# ───────────────────── POST /api/game/evaluate ─────────────────────
class TestEvaluate:
    def test_correct_answer(self, client, monkeypatch, saved_scenario, evaluation_text):
        monkeypatch.setattr(gemini, "call_gemini", lambda *a, **k: evaluation_text)
        r = client.post("/api/game/evaluate", json={
            "scenarioId": saved_scenario,
            "deductionData": {"culpritName": "김서준", "reasoning": "우산이 근거", "isOverTime": False},
        })
        body = r.json()
        assert body["isCorrect"] is True
        assert body["culpritName"] == "김서준"
        assert body["grade"] == "A"
        assert body["truth"] == "집사 김서준이 해고에 분노해 범행했다."

    def test_wrong_answer(self, client, monkeypatch, saved_scenario, evaluation_text):
        monkeypatch.setattr(gemini, "call_gemini", lambda *a, **k: evaluation_text)
        body = client.post("/api/game/evaluate", json={
            "scenarioId": saved_scenario,
            "deductionData": {"culpritName": "이하늘", "reasoning": "태도가 수상"},
        }).json()
        assert body["isCorrect"] is False
        assert body["culpritName"] == "김서준"

    def test_name_compared_after_strip(self, client, monkeypatch, saved_scenario, evaluation_text):
        """Lambda는 양쪽을 strip해 비교했다. 공백 때문에 정답이 오답이 되면 안 된다."""
        monkeypatch.setattr(gemini, "call_gemini", lambda *a, **k: evaluation_text)
        body = client.post("/api/game/evaluate", json={
            "scenarioId": saved_scenario,
            "deductionData": {"culpritName": "  김서준  ", "reasoning": "근거"},
        }).json()
        assert body["isCorrect"] is True

    def test_overtime_flag_reaches_prompt(self, client, monkeypatch, saved_scenario, evaluation_text):
        captured = {}

        def fake(prompt, model=None):
            captured["p"] = prompt
            return evaluation_text

        monkeypatch.setattr(gemini, "call_gemini", fake)
        client.post("/api/game/evaluate", json={
            "scenarioId": saved_scenario,
            "deductionData": {"culpritName": "김서준", "reasoning": "근거", "isOverTime": True},
        })
        assert "최대 'B'까지만" in captured["p"]

    def test_uses_default_model_not_chat_model(self, client, monkeypatch, saved_scenario, evaluation_text):
        """평가는 chat 모델이 아니라 기본 모델을 써야 한다 (Lambda와 동일)."""
        captured = {}

        def fake(prompt, model=None):
            captured["model"] = model
            return evaluation_text

        monkeypatch.setattr(gemini, "call_gemini", fake)
        client.post("/api/game/evaluate", json={
            "scenarioId": saved_scenario,
            "deductionData": {"culpritName": "김서준", "reasoning": "근거"},
        })
        assert captured["model"] is None, "model_override 없이 호출해야 기본 모델이 쓰인다"

    def test_malformed_response_uses_fallbacks(self, client, monkeypatch, saved_scenario):
        monkeypatch.setattr(gemini, "call_gemini", lambda *a, **k: "평가 불가")
        body = client.post("/api/game/evaluate", json={
            "scenarioId": saved_scenario,
            "deductionData": {"culpritName": "김서준", "reasoning": "근거"},
        }).json()
        assert body["grade"] == "F"
        assert body["report"] == "보고서 생성 실패"
        assert body["advice"] == "조언을 불러올 수 없습니다."

    def test_missing_solution_fallback(self, client, monkeypatch, test_db, evaluation_text):
        monkeypatch.setattr(gemini, "call_gemini", lambda *a, **k: evaluation_text)
        res = test_db["scenarios"].insert_one({"case_data": {"suspects": []}})
        body = client.post("/api/game/evaluate", json={
            "scenarioId": str(res.inserted_id),
            "deductionData": {"culpritName": "누구", "reasoning": "근거"},
        }).json()
        assert body["truth"] == "No solution provided in case data."
        assert body["culpritName"] == "Unknown"
        assert body["isCorrect"] is False

    def test_blank_reasoning_422(self, client, saved_scenario):
        r = client.post("/api/game/evaluate", json={
            "scenarioId": saved_scenario,
            "deductionData": {"culpritName": "김서준", "reasoning": "  "},
        })
        assert r.status_code == 422


# ─────────────── GET /api/game/scenario/{id} ───────────────
class TestScenarioSanitized:
    def test_returns_sanitized(self, client, saved_scenario):
        r = client.get("/api/game/scenario/" + saved_scenario)
        assert r.status_code == 200
        assert assert_no_spoilers(r.json()) == []

    def test_no_store_header(self, client, saved_scenario):
        r = client.get("/api/game/scenario/" + saved_scenario)
        assert r.headers["cache-control"] == "no-store"

    def test_invalid_id_400(self, client):
        assert client.get("/api/game/scenario/bad").status_code == 400

    def test_missing_404(self, client):
        assert client.get("/api/game/scenario/" + "0" * 24).status_code == 404

    def test_empty_case_data_500(self, client, test_db):
        res = test_db["scenarios"].insert_one({"case_data": None})
        r = client.get("/api/game/scenario/" + str(res.inserted_id))
        assert r.status_code == 500
        assert r.json()["detail"] == "Invalid scenario data"


# ─────────────────────── /scenarios CRUD ───────────────────────
class TestScenariosCrud:
    def test_list_excludes_case_data(self, client, saved_scenario):
        items = client.get("/scenarios").json()
        assert len(items) == 1
        assert "case_data" not in items[0]
        assert items[0]["_id"] == saved_scenario

    @pytest.mark.parametrize("path", ["/scenarios", "/scenarios/"])
    def test_trailing_slash_no_redirect(self, client, path):
        r = client.get(path)
        assert r.status_code == 200, "307 리다이렉트 없이 바로 200이어야 한다"

    def test_detail_returns_unsanitized(self, client, saved_scenario, admin_headers):
        """⚠️ 관리자 인증 필수. 정화되지 않은 원본을 반환한다."""
        body = client.get("/scenarios/" + saved_scenario, headers=admin_headers).json()
        assert body["case_data"]["solution"]
        assert any(s.get("isCulprit") for s in body["case_data"]["suspects"])

    def test_crud_error_messages_differ_from_game(self, client, admin_headers):
        assert client.get("/scenarios/bad", headers=admin_headers).json()["detail"] == "Invalid id"
        assert (client.get("/scenarios/" + "0" * 24, headers=admin_headers).json()["detail"]
                == "Not found")

    def test_create_and_delete(self, client, admin_headers):
        r = client.post("/scenarios", headers=admin_headers, json={
            "title": "t", "summary": "s", "crime_type": "절도", "case_data": {"x": 1}})
        assert r.status_code == 201
        sid = r.json()["_id"]
        assert client.delete("/scenarios/" + sid, headers=admin_headers).json() == {"deleted": sid}
        assert client.get("/scenarios/" + sid, headers=admin_headers).status_code == 404

    def test_crime_type_filter(self, client, saved_scenario, admin_headers):
        client.post("/scenarios", headers=admin_headers,
                    json={"title": "절도건", "crime_type": "절도"})
        assert len(client.get("/scenarios", params={"crime_type": "살인"}).json()) == 1
        assert len(client.get("/scenarios", params={"crime_type": "절도"}).json()) == 1

    @pytest.mark.parametrize("page,limit", [(0, 999), (-5, 0), (1, 1000)])
    def test_page_limit_clamped_not_rejected(self, client, saved_scenario, page, limit):
        """Lambda는 범위를 벗어난 값을 클램프했다. 422로 거부하면 안 된다."""
        r = client.get("/scenarios", params={"page": page, "limit": limit})
        assert r.status_code == 200
        assert len(r.json()) <= 50

    def test_non_numeric_page_422(self, client):
        """Lambda는 int() 예외로 500이었다. 422가 낫다."""
        assert client.get("/scenarios", params={"page": "abc"}).status_code == 422


# ─────────────────────── /feedbacks CRUD ───────────────────────
class TestFeedbacksCrud:
    def test_snake_case_input_201(self, client):
        r = client.post("/feedbacks", json={
            "content": "좋아요", "scenario_id": "abc", "grade": "A",
            "game_result": {"selected_suspect_id": 2, "time_taken": "07:31"},
        })
        assert r.status_code == 201, "이 경로는 201이다 (게임 경로는 200)"

    def test_list_remaps_to_camel(self, client, admin_headers):
        client.post("/feedbacks", json={
            "content": "좋아요",
            "game_result": {"selected_suspect_name": "김서준", "time_taken": "07:31"},
        })
        gr = client.get("/feedbacks", headers=admin_headers).json()[0]["game_result"]
        assert gr["selectedSuspectName"] == "김서준"
        assert gr["timeTaken"] == "07:31"
        assert "selected_suspect_name" not in gr

    def test_game_route_camel_input_200(self, client):
        r = client.post("/api/game/feedback", json={
            "content": "좋아요", "scenarioId": "abc",
            "gameResult": {"selectedSuspectId": 2, "timeTaken": "07:31"},
        })
        assert r.status_code == 200, "게임 경로는 200이다 (CRUD 경로는 201)"
        assert r.json()["ok"] is True

    def test_game_route_stores_snake_case(self, client, test_db):
        client.post("/api/game/feedback", json={
            "content": "좋아요", "gameResult": {"selectedSuspectId": 2}})
        doc = test_db["feedbacks"].find_one({})
        assert doc["game_result"]["selected_suspect_id"] == 2

    def test_delete(self, client, admin_headers):
        fid = client.post("/feedbacks", json={"content": "x"}).json()["_id"]
        assert client.delete("/feedbacks/" + fid, headers=admin_headers).json() == {"deleted": fid}
        assert client.delete("/feedbacks/" + fid, headers=admin_headers).status_code == 404

    def test_delete_invalid_id_400(self, client, admin_headers):
        r = client.delete("/feedbacks/bad", headers=admin_headers)
        assert r.status_code == 400 and r.json()["detail"] == "Invalid id"

    def test_sorted_newest_first(self, client, admin_headers):
        first = client.post("/feedbacks", json={"content": "첫번째"}).json()["_id"]
        second = client.post("/feedbacks", json={"content": "두번째"}).json()["_id"]
        items = client.get("/feedbacks", headers=admin_headers).json()
        assert [i["_id"] for i in items][:2] == [second, first]
