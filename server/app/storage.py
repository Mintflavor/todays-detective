# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 오브젝트 스토리지 업로드. lambda/s3_upload.py에서 이식.
#
# AWS S3 → MinIO 전환으로 바뀐 점:
#   1. endpoint_url 지정 (AWS 엔드포인트 자동 해석 대신)
#   2. addressing_style="path" (MinIO는 virtual-hosted 방식을 쓰지 않는다)
#   3. 반환 URL을 하드코딩 대신 PUBLIC_ASSET_BASE_URL 기반으로 조립

import io
import logging
import uuid
from typing import Optional

import boto3
from botocore.client import Config
from PIL import Image

from .config import get_settings

logger = logging.getLogger(__name__)

_s3 = None


def get_s3():
    global _s3
    if _s3 is None:
        settings = get_settings()
        _s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            # MinIO는 리전 개념이 없지만 SDK가 값을 요구한다.
            region_name="us-east-1",
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
                retries={"max_attempts": 3, "mode": "standard"},
            ),
        )
        logger.info("S3(MinIO) 클라이언트 초기화: %s", settings.s3_endpoint_url)
    return _s3


def _to_square_jpeg(raw: bytes, size: int, quality: int) -> bytes:
    """정사각형 JPEG로 변환한다.

    Gemini에 1:1을 요청하므로 입력은 이미 정사각형이고, 이 경우 **균등 축소**만 일어난다
    (왜곡 없음, 크롭 없음 — 계획 §0-G의 결정).

    입력이 정사각형이 아닌 경우는 API 동작이 바뀐 비정상 상황이다. 이때는 강제 축소로
    인물을 찌그러뜨리는 대신 center-crop으로 정사각형을 만든 뒤 축소한다.
    """
    img = Image.open(io.BytesIO(raw))
    if img.mode != "RGB":
        img = img.convert("RGB")

    w, h = img.size
    if w != h:
        logger.warning(
            "초상화가 정사각형이 아닙니다 (%dx%d) — center-crop 폴백을 적용합니다. "
            "image_config.aspect_ratio 설정을 확인하세요.",
            w,
            h,
        )
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, top + side))

    img = img.resize((size, size), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=quality, optimize=True)
    return out.getvalue()


def upload_portrait(raw_bytes: bytes, key_prefix: str = "portraits") -> str:
    """초상화를 축소해 업로드하고 공개 URL을 반환한다."""
    settings = get_settings()
    key = "%s/%s.jpg" % (key_prefix, uuid.uuid4())

    jpeg = _to_square_jpeg(raw_bytes, settings.portrait_px, settings.portrait_quality)

    get_s3().put_object(
        Bucket=settings.s3_bucket_name,
        Key=key,
        Body=jpeg,
        ContentType="image/jpeg",
        # 키가 UUID로 불변이므로 영구 캐시가 안전하다.
        CacheControl="public, max-age=31536000, immutable",
    )

    url = "%s/%s" % (settings.public_asset_base_url, key)
    logger.info("초상화 업로드 완료: %s (%d bytes)", key, len(jpeg))
    return url


def health() -> Optional[str]:
    """버킷 접근 확인. 정상이면 None, 실패하면 사유 문자열."""
    try:
        get_s3().head_bucket(Bucket=get_settings().s3_bucket_name)
        return None
    except Exception as exc:  # noqa: BLE001 — 헬스체크는 사유만 돌려준다
        return str(exc)
