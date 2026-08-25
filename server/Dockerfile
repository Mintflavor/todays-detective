# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 멀티스테이지. 기본(마지막) 스테이지는 runtime이므로 compose는 target 지정 없이 빌드된다.
#   운영  : docker build .                  → runtime
#   테스트: docker build --target test .     → pytest 포함

FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 의존성을 먼저 설치해 레이어 캐시를 살린다.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd --create-home --uid 10001 appuser


# ── 테스트 스테이지 ──────────────────────────────────────────────
# pytest와 테스트 코드는 운영 이미지에 넣지 않는다.
FROM base AS test

COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY pytest.ini .
COPY tests ./tests

CMD ["pytest"]


# ── 운영 스테이지 (기본) ─────────────────────────────────────────
FROM base AS runtime

# root로 돌리지 않는다.
USER appuser

EXPOSE 8000

# 호스트에 포트를 공개하지 않으므로 0.0.0.0 바인드는 스택 내부 통신용이다.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
