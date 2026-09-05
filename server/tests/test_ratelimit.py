# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 레이트 리밋 회귀 테스트.
#
# 배포 중 실제로 터진 버그 두 개를 여기서 잡는다:
#   1. slowapi가 명시적 key_func를 **인자 없이** 호출해 TypeError로 전부 500
#   2. limits가 URI의 DB가 아니라 "limits" DB를 써서 권한 오류로 전부 500
#
# 카운터 소진을 막기 위해 conftest가 리미터를 끄므로, 여기서는 실제 차단 동작 대신
# **설정과 계약**을 검증한다 (차단 동작은 배포 후 실측으로 확인했다).

import inspect

import pytest
from limits import parse_many

from app.config import get_settings
from app.ratelimit import client_key, global_key, limiter


class TestGlobalKey:
    """slowapi는 호출 방식이 두 가지다. 둘 다 받아야 한다."""

    def test_callable_without_args(self):
        # @limiter.limit(..., key_func=global_key) 경로: lim.key_func()
        assert global_key() == "global"

    def test_callable_with_request(self):
        # 기본 key_func 경로: key_func(request)
        assert global_key(object()) == "global"

    def test_signature_accepts_varargs(self):
        params = list(inspect.signature(global_key).parameters.values())
        assert any(p.kind is inspect.Parameter.VAR_POSITIONAL for p in params), (
            "가변 인자가 아니면 slowapi의 인자 없는 호출에서 TypeError가 난다"
        )

    def test_key_is_constant(self):
        """요청자가 바꿀 수 없어야 예산 상한이 성립한다."""
        assert global_key() == global_key(1) == global_key(1, 2) == "global"


class TestClientKey:
    def test_prefers_forwarded_for(self):
        class R:
            headers = {"x-forwarded-for": "203.0.113.9, 10.0.0.1"}

        assert client_key(R()) == "203.0.113.9"

    def test_ignores_blank_forwarded_for(self):
        class R:
            headers = {"x-forwarded-for": "  "}
            client = type("C", (), {"host": "172.21.0.5"})()

        assert client_key(R()) == "172.21.0.5"

    def test_falls_back_to_peer(self):
        class R:
            headers: dict[str, str] = {}
            client = type("C", (), {"host": "172.21.0.5"})()

        assert client_key(R()) == "172.21.0.5"


class TestLimitStrings:
    """설정 문자열이 limits 문법으로 파싱되지 않으면 기동 시점에 터진다."""

    @pytest.mark.parametrize(
        "attr",
        ["rate_limit_start_global", "rate_limit_chat", "rate_limit_evaluate"],
    )
    def test_parseable(self, attr):
        value = getattr(get_settings(), attr)
        parsed = parse_many(value)
        assert parsed, "%s = %r 가 파싱되지 않았다" % (attr, value)

    def test_start_has_monthly_cap(self):
        """월 상한이 없으면 예산이 보호되지 않는다."""
        limits = parse_many(get_settings().rate_limit_start_global)
        assert any(l.GRANULARITY.name == "month" for l in limits), (
            "start 제한에 month 단위가 없다 — 월 예산 상한이 없는 상태다"
        )

    def test_monthly_cap_within_budget(self):
        """월 지출 상한을 지킨다.

        예전 기준은 월 5,000원(29판)이었다. 개발용 키를 쓰기로 하면서 기준을
        **하루 세 판을 여유롭게**로 바꿨고(2026-08-26), 그에 맞춰 상한을 올렸다.

        이 테스트를 지우지 말 것. 숫자는 바뀌었어도 **실수로 리밋을 한 자리
        더 올리는 것**을 막는 유일한 장치다. 신규 한 판이 최대 205원
        (사건 생성 159원 + 심문 60회 41원 + 평가 5원)이고, 초상화 3장이
        생성 비용의 93%라 조일 곳은 항상 여기다.
        """
        MONTHLY_CEILING_KRW = 35_000
        PER_GAME_KRW = 205

        limits = parse_many(get_settings().rate_limit_start_global)
        monthly = next(l for l in limits if l.GRANULARITY.name == "month")
        assert monthly.amount * PER_GAME_KRW <= MONTHLY_CEILING_KRW, (
            "월 %d회 x %d원 = %d원 — 상한 %d원을 넘는다"
            % (monthly.amount, PER_GAME_KRW, monthly.amount * PER_GAME_KRW,
               MONTHLY_CEILING_KRW)
        )

    def test_start_has_burst_guard(self):
        """시간 단위 제한이 없으면 하루치를 몇 초 안에 태울 수 있다."""
        limits = parse_many(get_settings().rate_limit_start_global)
        assert any(l.GRANULARITY.name in ("hour", "minute", "second") for l in limits)


class TestStorage:
    def test_storage_uses_app_database(self):
        """limits 기본값("limits" DB)을 쓰면 앱 계정 권한이 없어 500이 난다."""
        s = get_settings()
        if not s.rate_limit_storage_uri:
            pytest.skip("메모리 저장소 구성")
        from app.ratelimit import _STORAGE_OPTIONS

        assert _STORAGE_OPTIONS.get("database_name") == s.mongodb_database

    def test_persistent_storage_configured(self):
        """메모리 저장소면 재시작마다 월 상한이 리셋된다."""
        assert get_settings().rate_limit_storage_uri, (
            "RATE_LIMIT_STORAGE_URI가 비어 있다 — 재시작 시 월 예산 상한이 리셋된다"
        )


class TestHeadersDisabled:
    """켜면 정상 응답이 전부 500이 된다. 배포 후에야 발견한 버그다."""

    def test_headers_not_enabled(self):
        assert limiter._headers_enabled is False, (
            "headers_enabled=True면 slowapi가 Pydantic 반환값에 헤더를 주입하려다 "
            "'parameter response must be an instance of Response' 예외로 500을 낸다"
        )


class TestLimiterEnabledSuccessPath:
    """리미터를 **켠 상태로** 성공 응답을 통과시킨다.

    conftest는 실제 예산 카운터 소진을 막으려 리미터를 끈다. 그 결과 데코레이터 경로가
    한 번도 실행되지 않아 위 버그를 174개 테스트가 모두 놓쳤다.
    여기서는 저장소를 메모리로 갈아끼워 **운영 카운터를 건드리지 않고** 켠다.
    """

    @pytest.fixture
    def limited_client(self, client, monkeypatch):
        from limits.storage import MemoryStorage

        from limits.strategies import FixedWindowRateLimiter

        storage = MemoryStorage()
        monkeypatch.setattr(limiter, "enabled", True)
        monkeypatch.setattr(limiter, "_storage", storage)
        # `limiter.limiter`는 읽기 전용 프로퍼티다. 실제 저장 속성은 `_limiter`다.
        monkeypatch.setattr(limiter, "_limiter", FixedWindowRateLimiter(storage))
        return client

    def test_chat_success_returns_200(self, limited_client, monkeypatch, test_db, full_case):
        """가장 흔한 성공 경로. 여기서 500이 나면 게임이 통째로 멈춘다."""
        from app import gemini

        res = test_db["scenarios"].insert_one({"case_data": full_case})
        monkeypatch.setattr(gemini, "call_gemini", lambda *a, **k: "주방에 있었습니다.")

        r = limited_client.post("/api/game/chat", json={
            "scenarioId": str(res.inserted_id), "suspectId": 1, "message": "어디 있었습니까?",
        })
        assert r.status_code == 200, r.text
        assert r.json()["reply"] == "주방에 있었습니다."

    def test_evaluate_success_returns_200(self, limited_client, monkeypatch, test_db,
                                          full_case, evaluation_text):
        from app import gemini

        res = test_db["scenarios"].insert_one({"case_data": full_case})
        monkeypatch.setattr(gemini, "call_gemini", lambda *a, **k: evaluation_text)

        r = limited_client.post("/api/game/evaluate", json={
            "scenarioId": str(res.inserted_id),
            "deductionData": {"culpritName": "김서준", "reasoning": "우산"},
        })
        assert r.status_code == 200, r.text
        assert r.json()["grade"] == "A"

    def test_admin_login_success_returns_200(self, limited_client, monkeypatch):
        """이 엔드포인트에서 처음 500이 발견됐다."""
        from app.config import get_settings

        pw = get_settings().admin_password
        if not pw:
            pytest.skip("ADMIN_PASSWORD 미설정")
        r = limited_client.post("/admin/login", json={"password": pw})
        assert r.status_code == 200, r.text
        assert r.json()["token"]

    def test_limit_still_blocks(self, limited_client, monkeypatch, test_db, full_case):
        """켠 상태에서 제한이 실제로 발동하는지 (메모리 저장소)."""
        from app import gemini

        res = test_db["scenarios"].insert_one({"case_data": full_case})
        monkeypatch.setattr(gemini, "call_gemini", lambda *a, **k: "네.")

        body = {"scenarioId": str(res.inserted_id), "suspectId": 1, "message": "질문"}
        limit = parse_many(get_settings().rate_limit_chat)[0].amount
        codes = [limited_client.post("/api/game/chat", json=body).status_code
                 for _ in range(limit + 2)]
        assert codes[:limit] == [200] * limit, codes
        assert codes[limit:] == [429, 429], codes


class TestDisabledInTests:
    def test_limiter_disabled_by_default(self):
        """conftest가 끄지 않으면 pytest가 실제 예산 카운터를 소진한다."""
        assert limiter.enabled is False
