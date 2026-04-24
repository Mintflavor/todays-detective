# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import base64
import os
import re

from google import genai
from google.genai import types

_client = None


def _get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        _client = genai.Client(api_key=api_key)
    return _client


def call_gemini(prompt, model_override=None):
    client = _get_client()
    model = model_override or os.environ.get("GEMINI_MODEL", "gemini-2.0-flash-exp")

    optimized = re.sub(r"^[ \t]+", "", prompt, flags=re.MULTILINE)
    optimized = re.sub(r"\n{3,}", "\n\n", optimized).strip()

    response = client.models.generate_content(model=model, contents=optimized)

    text = getattr(response, "text", None)
    if text:
        return text

    try:
        parts = response.candidates[0].content.parts
        if parts and parts[0].text:
            return parts[0].text
    except (AttributeError, IndexError):
        pass

    raise RuntimeError("Invalid response structure from Gemini API")


def generate_image(prompt):
    client = _get_client()
    imagen_model = os.environ.get("IMAGEN_MODEL", "imagen-4.0-fast-generate-001")
    response = client.models.generate_images(
        model=imagen_model,
        prompt=prompt,
        config=types.GenerateImagesConfig(number_of_images=1, aspect_ratio="1:1"),
    )

    if not response.generated_images:
        raise RuntimeError("No image data in Imagen response")

    image = response.generated_images[0].image
    image_bytes = getattr(image, "image_bytes", None)
    if image_bytes is not None:
        return image_bytes

    if isinstance(image, str):
        return base64.b64decode(image)

    raise RuntimeError("No image data in Imagen response")
