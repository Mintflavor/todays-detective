# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 관리자 로그인. Next.js의 /api/admin/verify를 대체한다.

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from ..auth import TOKEN_TTL_SECONDS, issue_token, require_admin, verify_password
from ..config import get_settings
from ..ratelimit import global_key, limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

_settings = get_settings()


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str
    expiresIn: int


@router.post("/login", response_model=LoginResponse)
# 무차별 대입 방어. 비밀번호가 24자 난수라 현실적 위험은 낮지만 로그를 더럽히지 않게 막는다.
# 제한이 전역이므로 공격자가 소진시켜 관리자를 잠글 수는 있다 — 무차별 대입 허용보다는 낫다.
@limiter.limit(_settings.rate_limit_admin_login, key_func=global_key)
def login(request: Request, payload: LoginRequest) -> LoginResponse:
    if not verify_password(payload.password):
        logger.warning("관리자 로그인 실패")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="접근 코드가 올바르지 않습니다.",
        )
    token, ttl = issue_token()
    logger.info("관리자 로그인 성공 (유효 %d초)", ttl)
    return LoginResponse(token=token, expiresIn=ttl)


@router.get("/session")
def check_session(_: None = Depends(require_admin)) -> dict[str, object]:
    """토큰이 아직 유효한지 확인한다. 관리자 화면 진입 시 재로그인 여부 판단용."""
    return {"ok": True, "ttl": TOKEN_TTL_SECONDS}
