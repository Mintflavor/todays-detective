# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 모든 환경변수를 여기 한 곳에서만 정의한다.
# Lambda 시절 os.environ.get(...)이 코드 곳곳에 흩어져 있던 것을 단일 지점으로 모은다.

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # compose가 넘기는 무관한 변수를 무시한다
        case_sensitive=False,
    )

    # ── MongoDB ──────────────────────────────────────────────
    # SCRAM 접속 문자열. Lambda의 authMechanism="MONGODB-AWS"는 쓰지 않는다.
    mongodb_url: str
    mongodb_database: str = "todays_detective"

    # ── Gemini ───────────────────────────────────────────────
    gemini_api_key: str
    gemini_model: str = "gemini-3.6-flash"
    gemini_chat_model: str = ""  # 비면 gemini_model로 폴백 (Lambda 동작과 동일)
    # 더 이상 Imagen이 아니다 — Gemini 이미지 모델이다. (§0-F)
    image_model: str = "gemini-3.1-flash-lite-image"
    # 이 모델은 512 계열을 거부한다. 1K만 사용 가능. (§0-F)
    image_aspect_ratio: str = "1:1"
    image_size: str = "1K"
    # MinIO에 올릴 최종 크기. 1024 정사각형을 균등 축소하므로 왜곡이 없다.
    portrait_px: int = 512
    portrait_quality: int = 80

    # ── 오브젝트 스토리지 (MinIO) ─────────────────────────────
    s3_endpoint_url: str
    s3_bucket_name: str = "todays-detective"
    s3_access_key: str
    s3_secret_key: str
    # 업로드 후 클라이언트에 돌려줄 공개 URL의 접두어.
    # 예: https://cdn.example.com/todays-detective
    public_asset_base_url: str

    # ── 보안 ─────────────────────────────────────────────────
    # 쉼표 구분. api를 외부에 노출하지 않으므로 보통 자기 도메인 하나면 된다. (§3-3)
    allowed_origins: str = ""
    api_key_admin: str = ""
    admin_password: str = ""

    # ── 레이트 리밋 (예산 보호) ───────────────────────────────
    # 실측: 새 사건 생성 159원(초상화 3장이 93%), 심문 0.68원, 평가 4.91원.
    # 신규 한 판 약 171원 → 월 5,000원 한도로 약 29판.
    rate_limit_enabled: bool = True
    # ⚠️ 아래 제한은 모두 **전역**이다. Next rewrite 프록시가 X-Forwarded-For를 전달하지 않아
    #    per-IP 구분이 불가능하다 (실측 확인). 상세는 app/ratelimit.py 참조.
    #
    # 예산 상한의 본체:
    #   25/month x 171원 = 약 4,275원 (월 5,000원의 85%). 나머지는 기록 재생용으로 남긴다.
    #   3/day  = 하루 최대 약 477원. 하루에 한 달치를 태우는 것을 막는다.
    #   2/hour = 순간 폭주 차단.
    rate_limit_start_global: str = "2/hour;3/day;25/month"
    # 아래 둘은 비용이 미미하므로 남용 방어 수준. 한 판 최대 20 AP = 심문 20회.
    rate_limit_chat: str = "60/hour"
    rate_limit_evaluate: str = "15/hour"
    # 관리자 로그인 무차별 대입 방어
    rate_limit_admin_login: str = "30/hour"
    # 비우면 메모리 저장소를 쓴다 — 재시작 시 카운터가 초기화되어 월 상한이 무의미해진다.
    rate_limit_storage_uri: str = ""

    # ── 동작 ─────────────────────────────────────────────────
    log_level: str = Field(default="INFO")

    @field_validator("s3_endpoint_url", "public_asset_base_url")
    @classmethod
    def _strip_trailing_slash(cls, v: str) -> str:
        return v.rstrip("/")

    @property
    def chat_model(self) -> str:
        """Lambda의 `GEMINI_CHAT_MODEL or GEMINI_MODEL` 폴백을 그대로 유지한다."""
        return self.gemini_chat_model or self.gemini_model

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
