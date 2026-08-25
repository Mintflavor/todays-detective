# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 의존성을 먼저 설치해 레이어 캐시를 살린다.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# root로 돌리지 않는다.
RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000

# 호스트에 포트를 공개하지 않으므로 0.0.0.0 바인드는 스택 내부 통신용이다.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
