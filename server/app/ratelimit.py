# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 레이트 리밋. 목적은 남용 차단이 아니라 **Gemini 예산 보호**다.
#
# 실측 단가 (2026-08, countTokens 기반):
#   새 사건 생성 : 159원  ← 이 중 93%가 초상화 3장 ($0.0336 x 3)
#   심문 1회     : 0.68원
#   평가 1회     : 4.91원
#   신규 한 판(심문 10회) 171원 → 월 5,000원 한도로 약 29판
#   기록 재생 한 판 11.7원 → 약 427판 (15배 저렴)
#
# 그래서 조이는 대상은 `POST /api/game/start` 하나다. 나머지는 남용 방어 수준으로만 둔다.
#
# ⚠️ 지금 모든 제한은 **사실상 전역**이다 — per-IP가 아니다.
#    NPM → web(Next) → api 체인에서 **Next의 rewrite 프록시가 X-Forwarded-For를 전달하지 않는다.**
#    실측으로 확인했다: 리밋 키가 클라이언트 IP가 아니라 web 컨테이너 주소(172.21.0.5)로 잡혔다.
#    그래서 모든 사용자가 하나의 키를 공유한다.
#
#    per-IP인 척하는 설정을 두면 실제 동작을 오해하게 되므로, start는 **전역 제한 하나**만 쓴다.
#    (XFF가 전달되더라도 NPM이 $proxy_add_x_forwarded_for로 **덧붙이는** 방식이라
#     맨 앞 값은 클라이언트가 위조할 수 있다. 결국 예산 보호는 전역 제한이 담당해야 한다.)

import logging

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from .config import get_settings

logger = logging.getLogger(__name__)

_settings = get_settings()


def client_key(request: Request) -> str:
    """클라이언트 식별키. 위조 가능성을 감안한 최선노력 값이다."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return get_remote_address(request)


def global_key(*_: object) -> str:
    """전역 제한용 고정 키. 요청자가 바꿀 수 없다 — 이것이 예산 상한을 지킨다.

    가변 인자인 이유: slowapi는 기본 key_func를 `key_func(request)`로 부르지만,
    `@limiter.limit(..., key_func=...)`로 넘긴 함수는 **인자 없이** 호출한다
    (`limit_key = lim.key_func()`). 양쪽 호출 방식을 모두 받아야 한다.
    """
    return "global"


# 카운터를 MongoDB에 둔다. 기본 메모리 저장소는 **컨테이너 재시작 시 초기화**되어
# 월 단위 예산 상한이 무의미해진다.
#
# limits의 MongoDBStorage는 URI에 적힌 DB가 아니라 기본값 "limits" DB를 쓴다.
# 앱 계정(detective)은 todays_detective에만 권한이 있어 그대로 두면
# `not authorized on limits`로 500이 난다. database_name을 명시해 같은 DB에 쓴다.
_STORAGE_OPTIONS = (
    {"database_name": _settings.mongodb_database, "counter_collection_name": "rate_limit_counters"}
    if _settings.rate_limit_storage_uri
    else {}
)

# ⚠️ headers_enabled=False 로 둔다. True로 켜면 **정상 응답이 전부 500이 된다.**
#    slowapi의 `_inject_headers`는 엔드포인트 반환값이 starlette Response가 아니면
#    `parameter 'response' must be an instance of ...` 예외를 던진다.
#    우리 엔드포인트는 Pydantic 모델을 반환하므로 전부 걸린다.
#    (켜려면 rate-limited 엔드포인트마다 `response: Response` 파라미터를 추가해야 한다)
#
#    실제로 이 설정 때문에 성공 경로가 500이 된 적이 있다. 에러 경로(404/429)만 테스트해서
#    배포 후에야 발견했다 — tests/test_ratelimit.py의 회귀 테스트가 이를 고정한다.
limiter = Limiter(
    key_func=client_key,
    storage_uri=_settings.rate_limit_storage_uri or None,
    storage_options=_STORAGE_OPTIONS,
    strategy="fixed-window",
    enabled=_settings.rate_limit_enabled,
    headers_enabled=False,
)


def log_config() -> None:
    s = _settings
    if not s.rate_limit_enabled:
        logger.warning("레이트 리밋이 비활성화되어 있습니다 (RATE_LIMIT_ENABLED=false)")
        return
    logger.info(
        "레이트 리밋(전역) — start: %s / chat: %s / evaluate: %s / 저장소: %s",
        s.rate_limit_start_global,
        s.rate_limit_chat,
        s.rate_limit_evaluate,
        "MongoDB(%s.rate_limit_counters)" % s.mongodb_database
        if s.rate_limit_storage_uri
        else "메모리(재시작 시 초기화)",
    )
