# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# Phase 2-B 검증. api 컨테이너 안에서 실행한다.
#   python verify_2b.py            → 무료 검증만 (SDK 필드, MinIO 업로드, 프롬프트 조립)
#   python verify_2b.py --text     → 짧은 Gemini 텍스트 호출 1회 추가 (소액 과금)
# 이미지 생성은 호출하지 않는다 — 응답 형태는 §0-F에서 이미 실측 확인했다.

import sys

print("=" * 68)
print("1) google-genai 버전과 types.ImageConfig 필드명 (무료)")
print("=" * 68)
import google.genai as genai  # noqa: E402
from google.genai import types  # noqa: E402

print("  google-genai:", getattr(genai, "__version__", "(버전 정보 없음)"))
fields = list(types.ImageConfig.model_fields.keys())
print("  ImageConfig 필드:", fields)
for want in ("aspect_ratio", "image_size"):
    print("   %s %s" % ("✓" if want in fields else "✗", want))

cfg = types.GenerateContentConfig(
    response_modalities=["IMAGE"],
    image_config=types.ImageConfig(aspect_ratio="1:1", image_size="1K"),
)
print("  구성 객체 조립 OK:", cfg.image_config)

print()
print("=" * 68)
print("2) 프롬프트 조립 (무료)")
print("=" * 68)
from app import prompts  # noqa: E402

suspect = {
    "id": 2,
    "name": "김서준",
    "role": "집사",
    "gender": "Male",
    "age": 47,
    "personality": "침착하지만 눈을 잘 마주치지 않는",
    "image_prompt_keywords": "slicked back hair, thin mustache, black butler uniform",
    "secret": "고용주의 유언장을 미리 열어봤다",
    "isCulprit": True,
    "real_action": "22:10에 서재로 들어갔다",
    "alibi_claim": "주방에서 은식기를 닦고 있었다",
}
p = prompts.generate_portrait_prompt(suspect)
print("  초상화 프롬프트 (%d자):" % len(p))
print("   ", p[:150], "...")

sp = prompts.generate_suspect_prompt(
    suspect,
    {"location": "2층 저택의 밀실 서재", "weather": "폭우로 고립됨"},
    ["21:00 - 만찬 종료", "22:10 - 서재 불이 꺼짐", "23:00 - 시신 발견"],
    [{"name": "젖은 우산", "description": "현관에 놓인 아직 마르지 않은 우산"}],
)
print("  심문 프롬프트 %d자, '진범입니다' 포함: %s" % (len(sp), "진범입니다" in sp))
ep = prompts.generate_evaluation_prompt("진상 텍스트", "김서준", "이하늘", "집사가 범인이다", True)
print("  평가 프롬프트 %d자, 시간초과 페널티 포함: %s" % (len(ep), "최대 'B'까지만" in ep))

print()
print("=" * 68)
print("3) MinIO 업로드 (무료 — 저장해둔 1024 이미지 재사용)")
print("=" * 68)
from app import storage  # noqa: E402
from app.config import get_settings  # noqa: E402

s = get_settings()
print("  엔드포인트:", s.s3_endpoint_url)
print("  버킷      :", s.s3_bucket_name)
print("  공개 접두어:", s.public_asset_base_url)

raw = open("/tmp/sample_1k.jpg", "rb").read()
print("  입력      : %d bytes" % len(raw))
url = storage.upload_portrait(raw)
print("  반환 URL  :", url)

# 업로드된 객체를 다시 읽어 크기를 확인한다.
import io  # noqa: E402

from PIL import Image  # noqa: E402

key = url.split(s.public_asset_base_url + "/", 1)[1]
obj = storage.get_s3().get_object(Bucket=s.s3_bucket_name, Key=key)
body = obj["Body"].read()
im = Image.open(io.BytesIO(body))
print("  업로드본  : %s %s, %d bytes" % (im.format, im.size, len(body)))
print("  ContentType :", obj["ContentType"])
print("  CacheControl:", obj.get("CacheControl"))
print("  %s 512x512 정사각형" % ("✓" if im.size == (512, 512) else "✗"))

if "--text" in sys.argv:
    print()
    print("=" * 68)
    print("4) Gemini 텍스트 호출 1회 (소액 과금)")
    print("=" * 68)
    from app import gemini  # noqa: E402

    out = gemini.call_gemini("한 단어로만 답하세요: 대한민국의 수도는?")
    print("  모델 :", s.gemini_model)
    print("  응답 :", out.strip()[:80])
    print("  공백 최적화 확인:", repr(gemini._optimize("  a\n\n\n\n  b  ")))
