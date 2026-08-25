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
        """월 5,000원 한도. 신규 한 판 약 171원이므로 29판이 상한이다."""
        limits = parse_many(get_settings().rate_limit_start_global)
        monthly = next(l for l in limits if l.GRANULARITY.name == "month")
        assert monthly.amount <= 29, (
            "월 %d회 x 171원 = %d원 — 5,000원 한도를 넘는다"
            % (monthly.amount, monthly.amount * 171)
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


class TestDisabledInTests:
    def test_limiter_disabled(self):
        """conftest가 끄지 않으면 pytest가 실제 예산 카운터를 소진한다."""
        assert limiter.enabled is False
