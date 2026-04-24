# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import io
import os
import uuid

import boto3
from PIL import Image

_s3_client = None


def _get_s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3", region_name=os.environ.get("AWS_REGION", "ap-northeast-2")
        )
    return _s3_client


def _resize_to_jpeg(raw, size=512, quality=80):
    img = Image.open(io.BytesIO(raw))
    if img.mode != "RGB":
        img = img.convert("RGB")
    img = img.resize((size, size))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=quality)
    return out.getvalue()


def upload_portrait(raw_bytes):
    bucket = os.environ.get("S3_BUCKET_NAME")
    if not bucket:
        raise RuntimeError("S3_BUCKET_NAME is not configured")
    region = os.environ.get("AWS_REGION", "ap-northeast-2")
    key = f"portraits/{uuid.uuid4()}.jpg"
    jpeg = _resize_to_jpeg(raw_bytes)
    _get_s3().put_object(
        Bucket=bucket,
        Key=key,
        Body=jpeg,
        ContentType="image/jpeg",
        CacheControl="public, max-age=31536000, immutable",
    )
    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
