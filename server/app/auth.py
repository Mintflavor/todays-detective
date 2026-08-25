# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 관리자 인증.
#
# 이전 구조의 문제: Next.js의 /api/admin/verify가 비밀번호만 확인하고 true를 돌려줬고,
# 실제 삭제·원본 조회는 브라우저가 API로 **직접** 호출했다. 즉 인증을 건너뛸 수 있었다.
#
# 이제 인증을 API가 담당한다. 받는 자격증명은 두 가지다.
#   1) X-Admin-Token — 비밀번호 로그인으로 발급되는 **단기 토큰**. 브라우저용.
#   2) X-API-Key     — 고정 키. 스크립트/서버 간 호출용.
#
# 브라우저에 고정 키를 내려주지 않는 이유: devtools에 그대로 노출되고 만료도 없다.
# 토큰은 서버 재시작 없이도 만료되고, 유출돼도 수명이 짧다.
#
# 토큰은 **무상태 HMAC**이다 (서버 메모리에 세션을 두지 않는다).
#   payload = 만료시각(epoch 초)
#   token   = "<exp>.<hmac_sha256(key, exp)>"
# 컨테이너를 재시작해도 유효하고, 키를 바꾸면 전부 무효가 된다.

import hashlib
import hmac
import logging
import time

from fastapi import Header, HTTPException, status

from .config import get_settings

logger = logging.getLogger(__name__)

TOKEN_TTL_SECONDS = 60 * 60 * 2  # 2시간


def _signing_key() -> bytes:
    """토큰 서명 키.

    API_KEY_ADMIN을 우선 쓰고, 없으면 ADMIN_PASSWORD로 대체한다.
    둘 다 비어 있으면 관리자 기능을 아예 잠근다 (기본 개방보다 안전하다).
    """
    s = get_settings()
    secret = s.api_key_admin or s.admin_password
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="관리자 인증이 구성되지 않았습니다",
        )
    return secret.encode()


def _sign(exp: int) -> str:
    return hmac.new(_signing_key(), str(exp).encode(), hashlib.sha256).hexdigest()


def issue_token() -> tuple[str, int]:
    """(토큰, 유효기간 초)를 반환한다."""
    exp = int(time.time()) + TOKEN_TTL_SECONDS
    return "%d.%s" % (exp, _sign(exp)), TOKEN_TTL_SECONDS


def _token_valid(token: str) -> bool:
    try:
        exp_str, sig = token.split(".", 1)
        exp = int(exp_str)
    except (ValueError, AttributeError):
        return False
    if exp < time.time():
        return False
    # 서명 비교는 상수 시간으로 한다.
    return hmac.compare_digest(sig, _sign(exp))


def verify_password(password: str) -> bool:
    s = get_settings()
    if not s.admin_password:
        return False
    return hmac.compare_digest(password.encode(), s.admin_password.encode())


def require_admin(
    x_admin_token: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
) -> None:
    """관리자 전용 엔드포인트 의존성. 실패 시 401."""
    settings = get_settings()

    if x_admin_token and _token_valid(x_admin_token):
        return

    if (
        x_api_key
        and settings.api_key_admin
        and hmac.compare_digest(x_api_key, settings.api_key_admin)
    ):
        return

    # 어떤 자격증명이 왔는지만 남긴다 — 값은 로그에 남기지 않는다.
    logger.warning(
        "관리자 인증 실패 (token=%s, api_key=%s)",
        "제시됨" if x_admin_token else "없음",
        "제시됨" if x_api_key else "없음",
    )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="관리자 권한이 필요합니다",
    )
