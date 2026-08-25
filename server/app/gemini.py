# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# Gemini 호출. lambda/gemini_client.py에서 이식.
#
# 텍스트 경로는 Lambda 코드와 동작이 동일하다 (프롬프트 공백 최적화 포함).
# 이미지 경로는 **완전히 새로 작성**했다 — 계획 §0-F 참조.
#   기존: client.models.generate_images() + GenerateImagesConfig  (Imagen의 predict)
#   현재: client.models.generate_content() + response_modalities=["IMAGE"]
#   이유: gemini-3.1-flash-lite-image는 predict를 지원하지 않는다.
#   종횡비는 image_config로 명시한다. 지정하지 않으면 768x1344 세로 이미지가 온다.

import logging
import re
from typing import Optional

from google import genai
from google.genai import types

from .config import get_settings

logger = logging.getLogger(__name__)

_client: Optional[genai.Client] = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY가 설정되지 않았습니다")
        _client = genai.Client(api_key=settings.gemini_api_key)
        logger.info("Gemini 클라이언트 초기화 완료")
    return _client


def _optimize(prompt: str) -> str:
    """토큰 절약용 공백 정리. Lambda의 동작을 그대로 유지한다.

    1) 각 줄의 선행 들여쓰기 제거
    2) 3줄 이상 연속 개행을 2줄로 (단락 구분은 살린다)
    3) 양끝 트림
    """
    out = re.sub(r"^[ \t]+", "", prompt, flags=re.MULTILINE)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


def call_gemini(prompt: str, model_override: Optional[str] = None) -> str:
    """텍스트 생성. 반환 텍스트를 찾지 못하면 RuntimeError."""
    settings = get_settings()
    model = model_override or settings.gemini_model

    response = get_client().models.generate_content(
        model=model,
        contents=_optimize(prompt),
        # 도구를 쓰지 않는데도 SDK가 매 호출마다 AFC 권고 경고를 로그에 남긴다.
        # 심문은 호출이 잦으므로 로그를 깨끗하게 유지하기 위해 명시적으로 끈다.
        config=types.GenerateContentConfig(
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        ),
    )

    text = getattr(response, "text", None)
    if text:
        return text

    # SDK가 .text를 채우지 못하는 경우(멀티파트 등)를 위한 폴백. Lambda와 동일.
    try:
        parts = response.candidates[0].content.parts
        if parts and parts[0].text:
            return parts[0].text
    except (AttributeError, IndexError):
        pass

    raise RuntimeError("Gemini 응답 구조가 올바르지 않습니다")


def generate_portrait_image(prompt: str) -> bytes:
    """초상화 1장 생성. 원본 JPEG 바이트를 그대로 반환한다.

    1:1 + 1K를 요청하므로 1024x1024가 온다 (§0-F 실측).
    축소는 storage.upload_portrait이 담당한다.
    """
    settings = get_settings()

    response = get_client().models.generate_content(
        model=settings.image_model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            image_config=types.ImageConfig(
                aspect_ratio=settings.image_aspect_ratio,
                image_size=settings.image_size,
            ),
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        ),
    )

    try:
        parts = response.candidates[0].content.parts or []
    except (AttributeError, IndexError) as exc:
        raise RuntimeError("이미지 응답에 candidates가 없습니다") from exc

    for part in parts:
        inline = getattr(part, "inline_data", None)
        if inline is not None and getattr(inline, "data", None):
            return inline.data

    # 안전필터 등으로 이미지가 빠질 수 있다. 호출측에서 아이콘 폴백으로 흡수한다.
    finish = getattr(response.candidates[0], "finish_reason", None)
    raise RuntimeError("이미지 데이터가 없습니다 (finish_reason=%s)" % finish)
