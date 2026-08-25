# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 초상화 리사이즈 회귀 테스트. 네트워크를 쓰지 않는 순수 함수만 검증한다.
#
# 계획 §0-G의 결정: Gemini에 1:1을 요청하므로 입력이 정사각형이고, 축소는 균등하다.
# 비정사각형이 오는 경우는 API 동작이 바뀐 비정상 상황이며 center-crop으로 폴백한다.

import io

import pytest
from PIL import Image

from app.config import get_settings
from app.storage import _to_square_jpeg


def make_jpeg(w: int, h: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (128, 128, 128)).save(buf, format="JPEG")
    return buf.getvalue()


def size_of(raw: bytes) -> tuple[int, int]:
    return Image.open(io.BytesIO(raw)).size


class TestSquareInput:
    """정상 경로 — Gemini가 1:1 + 1K로 1024x1024를 준다."""

    def test_1024_downscales_to_512(self):
        assert size_of(_to_square_jpeg(make_jpeg(1024, 1024), 512, 80)) == (512, 512)

    def test_output_is_jpeg(self):
        out = _to_square_jpeg(make_jpeg(1024, 1024), 512, 80)
        assert Image.open(io.BytesIO(out)).format == "JPEG"

    def test_output_is_rgb(self):
        assert Image.open(io.BytesIO(_to_square_jpeg(make_jpeg(512, 512), 512, 80))).mode == "RGB"

    def test_smaller_input_upscaled(self):
        assert size_of(_to_square_jpeg(make_jpeg(256, 256), 512, 80)) == (512, 512)

    def test_size_reduced(self):
        raw = make_jpeg(1024, 1024)
        assert len(_to_square_jpeg(raw, 512, 80)) < len(raw)


class TestNonSquareFallback:
    """비정상 경로 — 왜곡시키지 않고 center-crop한다."""

    @pytest.mark.parametrize("w,h", [(768, 1344), (1344, 768), (1024, 512)])
    def test_result_is_square(self, w, h):
        assert size_of(_to_square_jpeg(make_jpeg(w, h), 512, 80)) == (512, 512)

    def test_crop_is_centered(self):
        """세로 이미지의 중앙이 남아야 한다. 위/아래가 아니다."""
        img = Image.new("RGB", (100, 300), (0, 0, 0))
        # 중앙 100x100 구간만 흰색으로 칠한다
        for y in range(100, 200):
            for x in range(100):
                img.putpixel((x, y), (255, 255, 255))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=100)

        out = Image.open(io.BytesIO(_to_square_jpeg(buf.getvalue(), 100, 100)))
        center = out.getpixel((50, 50))
        assert center[0] > 200, "중앙 크롭이 아니라 다른 영역이 남았다 (px=%s)" % (center,)

    def test_warns_on_non_square(self, caplog):
        import logging

        with caplog.at_level(logging.WARNING, logger="app.storage"):
            _to_square_jpeg(make_jpeg(768, 1344), 512, 80)
        # LogRecord.message는 포매팅 전 값일 수 있다. getMessage()가 % 적용본을 준다.
        assert any("정사각형이 아닙니다" in r.getMessage() for r in caplog.records)
        assert any("768x1344" in r.getMessage() for r in caplog.records)

    def test_no_warning_on_square(self, caplog):
        import logging

        with caplog.at_level(logging.WARNING, logger="app.storage"):
            _to_square_jpeg(make_jpeg(1024, 1024), 512, 80)
        assert not caplog.records


class TestGrayscaleAndAlpha:
    def test_grayscale_converted(self):
        buf = io.BytesIO()
        Image.new("L", (1024, 1024), 128).save(buf, format="JPEG")
        out = _to_square_jpeg(buf.getvalue(), 512, 80)
        assert Image.open(io.BytesIO(out)).mode == "RGB"

    def test_rgba_png_converted(self):
        """JPEG로 저장하려면 알파 채널을 없애야 한다 (안 하면 예외)."""
        buf = io.BytesIO()
        Image.new("RGBA", (1024, 1024), (10, 20, 30, 128)).save(buf, format="PNG")
        out = _to_square_jpeg(buf.getvalue(), 512, 80)
        assert Image.open(io.BytesIO(out)).mode == "RGB"


class TestSettingsDefaults:
    """§0-F/§0-G의 결정이 설정 기본값에 반영돼 있는지."""

    def test_aspect_ratio_is_square(self):
        assert get_settings().image_aspect_ratio == "1:1"

    def test_image_size_is_1k(self):
        """이 모델은 512 계열을 거부한다. 1K여야 한다."""
        assert get_settings().image_size == "1K"

    def test_portrait_px(self):
        assert get_settings().portrait_px == 512
