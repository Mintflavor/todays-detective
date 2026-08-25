# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# MongoDB 연결. Lambda의 authMechanism="MONGODB-AWS"(IAM 인증)를 제거하고
# 접속 문자열에 담긴 SCRAM 자격증명을 그대로 쓴다.

import logging
from typing import Optional

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

from .config import get_settings

logger = logging.getLogger(__name__)

_client: Optional[MongoClient] = None


def get_client() -> MongoClient:
    global _client
    if _client is None:
        settings = get_settings()
        _client = MongoClient(
            settings.mongodb_url,
            serverSelectionTimeoutMS=5000,
            tz_aware=True,
        )
        logger.info("MongoClient 초기화 완료")
    return _client


def get_db() -> Database:
    return get_client()[get_settings().mongodb_database]


def get_scenarios() -> Collection:
    return get_db()["scenarios"]


def get_feedbacks() -> Collection:
    return get_db()["feedbacks"]


def ping() -> bool:
    """/healthz 용. 실패를 예외로 올리지 않고 bool로 돌려준다."""
    try:
        get_client().admin.command("ping")
        return True
    except Exception as exc:  # noqa: BLE001 — 헬스체크는 원인을 로그로만 남긴다
        logger.warning("MongoDB ping 실패: %s", exc)
        return False


def close() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
