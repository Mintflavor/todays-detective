# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# FastAPI 앱. Lambda handler.py의 event dict 파싱과 CORS_HEADERS 수동 부착을
# 프레임워크 기본 기능으로 대체한다.

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .config import get_settings

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 첫 요청이 아니라 부팅 시점에 DB 연결을 확인해 문제를 빨리 드러낸다.
    if db.ping():
        logger.info("MongoDB 연결 확인")
    else:
        logger.error("MongoDB 연결 실패 — /healthz가 degraded를 반환한다")
    yield
    db.close()
    logger.info("종료 완료")


app = FastAPI(
    title="Today's Detective API",
    description="AI 추리게임 백엔드. AWS Lambda handler.py를 대체한다.",
    version="1.0.0",
    lifespan=lifespan,
)

# Lambda의 Access-Control-Allow-Origin: * 를 화이트리스트로 대체한다.
# api를 외부에 노출하지 않으므로 보통 자기 도메인 하나로 충분하다. (계획 §3-3)
if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["content-type", "x-api-key"],
    )
    logger.info("CORS 허용 오리진: %s", settings.cors_origins)
else:
    logger.info("CORS 미들웨어 비활성 (ALLOWED_ORIGINS 미설정)")


@app.get("/healthz", tags=["ops"])
def healthz():
    """컨테이너 헬스체크용. DB가 죽어도 200을 주되 status로 구분한다."""
    mongo_ok = db.ping()
    return {
        "status": "ok" if mongo_ok else "degraded",
        "mongo": mongo_ok,
    }


# 라우터는 후속 단계에서 등록한다.
#   2-D: routers/game.py       → /api/game/*
#   2-E: routers/scenarios.py  → /scenarios
#        routers/feedbacks.py  → /feedbacks
