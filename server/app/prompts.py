# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import random
from collections.abc import Collection
from dataclasses import dataclass

# ─────────────────────────── 다양성 축 ───────────────────────────
#
# LLM에게 "무작위로 고르세요"라고 맡기면 고르지 않는다. 실측 결과:
#   - crime_type: 살인 4/4  (프롬프트에 "각 유형 20%"라고 써 있었는데도)
#   - 무대: 안개/비 내리는 저택·산장 4/4
#   - 증거 개수: 3개 4/4  ("최대 3개"의 상한에 항상 붙었다)
#   - 범인: id 2  4/4     (아래 스키마 예시가 id 2에 isCulprit: true를 박아뒀다)
#
# 그래서 무작위성은 **서버에서 뽑아 주입한다.** 프롬프트의 예시는 그대로
# 결과에 복사되므로, 예시에 특정 값을 박아두면 그 값이 고정된다.

CRIME_TYPES = ("살인", "방화", "납치", "강도", "절도")

# 저택·산장 클리셰를 벗어난 한국적 생활공간 위주로 구성한다.
#
# 풀 크기가 곧 재플레이 수명이다. 월 상한이 25판이므로 24종이던 시절에는
# 생일 문제로 중복이 거의 확실했다 (실측: 4건 중 연구실 2회 중복).
STAGES = (
    # 방송·제작
    "심야 라디오 생방송 부스와 부조정실",
    "지방 방송국 편집실",
    "웹툰 스튜디오 작업실",
    "영화 촬영 세트장",
    "소극장 무대 뒤 분장실",
    "국악 공연장 연습실",
    "아이돌 팬 사인회 대기실",
    # 연구·산업
    "대학 연구동 실험실",
    "반도체 공장 클린룸 전실",
    "발전소 중앙제어실",
    "조선소 도크 사무동",
    "신문사 인쇄 공장",
    "김치공장 절임실",
    "제빵 공장 새벽 작업장",
    "양조장 발효실",
    "항공사 정비 격납고",
    "태양광 발전소 관리동",
    # 물류·창고
    "대형 물류창고 분류 라인",
    "택배 물류 허브의 상하차장",
    "우체국 소포 분류실",
    "농협 창고와 건조기실",
    "화물 열차 조차장",
    # 의료·돌봄
    "종합병원 야간 당직 병동",
    "대학병원 장례식장 접객실",
    "대형 병원 중앙공급실",
    "요양원 야간 근무실",
    "한의원 침구실과 탕전실",
    "치과 기공소",
    "동물병원 입원실",
    # 상업
    "수산시장 새벽 경매장",
    "꽃 도매시장 새벽 하차장",
    "폐업 직전 백화점 식품관",
    "재개발 철거 직전 상가 건물",
    "대형마트 심야 재고조사 현장",
    "전통시장 떡집과 방앗간",
    "프랜차이즈 치킨집 주방과 배달 대기실",
    "중고차 매매단지 사무실",
    "금은방과 뒷문 작업실",
    "오래된 서점 창고",
    "편의점 야간 근무 카운터",
    "무인 세탁방",
    # 여가
    "24시 목욕탕과 수면실",
    "실내 암벽등반장",
    "실내 스케이트장 정빙기 차고",
    "볼링장 기계실",
    "PC방 심야 흡연실",
    "노래연습장 복도와 기계실",
    "만화방 심야 좌석",
    "실내 사격장 사대와 탄피 회수실",
    "워터파크 폐장 후 기계실",
    "낚시 관리터의 관리실",
    "프로구단 원정 라커룸",
    "컨벤션센터 전시 부스",
    "미술관 수복실과 수장고",
    # 주거·생활
    "고시원 복도와 공용 주방",
    "도심 옥상 텃밭과 공용 창고",
    "반지하 다세대주택 계단과 보일러실",
    "원룸 건물 옥탑과 물탱크실",
    "신축 아파트 모델하우스",
    "노후 아파트 관리사무소와 지하 기계실",
    "셰어하우스 공용 거실",
    # 교통
    "지하철 차량기지 정비고",
    "장거리 야간 고속버스 차고지",
    "산악 케이블카 승강장",
    "공항 수하물 처리 지하층",
    "여객선 터미널 대합실과 창고",
    "고속도로 휴게소 주방과 직원 숙소",
    "시외버스 터미널 매표소",
    # 공공·기타
    "김장 준비 중인 시골 마을회관",
    "초등학교 방과후 급식실",
    "도서관 서고 지하층",
    "법원 기록보관소",
    "세무서 민원실",
    "소방서 대기실과 차고",
    "콜센터 야간 교대 사무실",
    "폐교를 개조한 캠핑장 관리동",
    "온천 관광호텔 보일러실",
    "양식장 관리실과 수조동",
)

# 날씨는 "고립"에만 쓰이지 않는다. 알리바이를 흔드는 생활 조건도 포함한다.
# 폭우·안개·눈보라로 고립시키는 클리셰는 의도적으로 넣지 않는다.
CONDITIONS = (
    # 기상
    "체감 38도의 폭염, 에어컨 실외기 과부하로 정전이 반복됨",
    "폭염 경보로 옥외 작업이 금지되어 전원이 실내에 머물렀음",
    "열대야로 모두 창문을 열어두어 소리가 건물 전체에 퍼졌음",
    "미세먼지 최악, 모두 창문을 닫고 마스크를 쓰고 있었음",
    "황사로 실내 조명을 켜야 할 만큼 어두웠음",
    "첫눈이 내려 사람들이 밖을 구경하러 나갔던 짧은 공백",
    "한파 경보, 수도관이 얼어 단수됨",
    "폭설로 제설 작업 중이라 주차장 차량이 전부 이동돼 있었음",
    "장마 끝 무렵의 습기로 바닥이 미끄럽고 곰팡이 냄새가 배어 있었음",
    "장마철 습기로 전자 출입 장치가 오작동을 반복했음",
    "태풍 예보가 나왔지만 정작 날씨는 맑아 경계가 느슨했음",
    "때 이른 초여름 더위로 냉방을 급히 가동해 소음이 컸음",
    # 설비·점검
    "정기 소방 점검으로 화재경보기가 일시 정지되어 있었음",
    "소방 훈련으로 비상구가 모두 개방돼 있었음",
    "엘리베이터 정기 점검으로 계단만 사용 가능했음",
    "승강기 교체 공사로 화물용 리프트만 가동됐음",
    "야간 단전 공사로 비상등만 켜져 있었음",
    "정전 대비 훈련 중이라 비상 발전기 소음이 계속 울렸음",
    "냉난방 설비 고장으로 특정 구역만 견딜 수 없이 더웠음",
    "상수도 공사로 급수차가 들어와 정문이 막혀 있었음",
    "도색 작업 중이라 페인트 냄새로 다른 냄새를 알 수 없었음",
    "방역 소독 작업으로 특정 층이 두 시간 동안 폐쇄돼 있었음",
    # 기록·통신 공백
    "전산 시스템 정기 교체로 출입 기록이 남지 않는 두 시간이 있었음",
    "CCTV 서버 교체 중이라 하루치 영상이 저장되지 않았음",
    "통신사 장애로 휴대전화가 두 시간 동안 불통이었음",
    "신입 교육 첫날로 출입증이 임시 발급 상태였음",
    # 소음·혼잡
    "인근 공사 소음이 커서 비명이나 파열음을 아무도 구분하지 못했음",
    "지역 축제 불꽃놀이 소음에 모든 소리가 묻혔음",
    "벚꽃 만개 주말, 유동 인구가 평소의 세 배였음",
    "지진 대피 훈련 방송이 오작동해 사람들이 두 번 대피했음",
    # 인력·일정
    "단체 예약이 취소되어 평소보다 인원이 절반이었음",
    "노동조합 파업 첫날로 대체 인력이 배치돼 서로를 잘 몰랐음",
    "결산 마감일이라 전원이 야근 중이었음",
    "명절 연휴 직전이라 대부분이 조기 퇴근했음",
    "납품 차량이 늦어 모두가 한 시간 늦게 식사했음",
    "재고 실사로 모든 물건의 위치가 하루 전과 달랐음",
)

TIME_FRAMES = (
    "이른 아침 출근 준비 시간",
    "주말 오전 한적한 시간",
    "점심 교대 시간",
    "늦은 오후 퇴근 직전",
    "저녁 회식이 끝난 직후",
    "야간 마감 정리 시간",
    "자정 무렵",
    "한밤중 순찰 사이의 공백",
    "새벽 근무 교대 시간",
    "동트기 직전",
)


@dataclass(frozen=True)
class CaseSpec:
    """이번 생성에 지정한 조건. 생성 결과를 검증·교정할 때 다시 쓴다."""

    crime_type: str
    stage: str
    condition: str
    time_frame: str
    culprit_id: int
    evidence_count: int
    prompt: str

    def storable(self) -> dict[str, object]:
        """DB에 남겨도 되는 필드만 골라 준다.

        **`culprit_id`와 `prompt`는 절대 포함하지 않는다.** 범인 id는 정답 그 자체이고,
        프롬프트에는 그 id가 적혀 있다. 무대·조건·시간대·범죄 유형·증거 개수는
        플레이어가 브리핑에서 이미 보는 정보이므로 저장해도 스포일러가 아니다.

        저장 목적은 두 가지다 — 최근 사용 회피(중복 무대 방지)와 사후 감사.
        """
        return {
            "stage": self.stage,
            "condition": self.condition,
            "time_frame": self.time_frame,
            "crime_type": self.crime_type,
            "evidence_count": self.evidence_count,
        }


def _pick_avoiding(
    r: random.Random | object, pool: tuple[str, ...], recent: Collection[str]
) -> str:
    """최근에 쓴 항목을 뺀 나머지에서 고른다.

    풀을 키워도 생일 문제로 중복이 남는다 (78종에 월 25판이면 3~4회).
    최근 사용분을 제외하면 그 창 안에서는 중복이 0이 된다.

    제외하면 남는 것이 없을 때는 **전체 풀로 되돌린다.** 사건 생성을 막는 것보다
    무대가 겹치는 편이 낫다.
    """
    fresh = [x for x in pool if x not in recent]
    return r.choice(fresh or list(pool))  # type: ignore[union-attr]


def build_case_spec(
    rng: random.Random | None = None,
    *,
    recent_stages: Collection[str] = (),
    recent_conditions: Collection[str] = (),
) -> CaseSpec:
    """사건 생성 조건을 뽑고 프롬프트까지 만든다.

    `recent_*`에 최근 사용분을 넘기면 그 항목을 피해서 고른다. 비워두면 전체 풀에서
    고른다 — 이 함수는 DB를 모른다. 최근 이력 조회는 호출부(라우터)의 책임이다.

    `rng`를 넘기면 결정적으로 동작한다 (테스트용).
    """
    r = rng or random
    values = {
        "crime_type": r.choice(CRIME_TYPES),
        "stage": _pick_avoiding(r, STAGES, recent_stages),
        "condition": _pick_avoiding(r, CONDITIONS, recent_conditions),
        "time_frame": r.choice(TIME_FRAMES),
        "culprit_id": r.randint(1, 3),
        "evidence_count": r.randint(2, 4),
    }
    # 헤더만 format 대상이다. 스키마 본문은 JSON 중괄호가 많아 format을 태우지 않는다.
    prompt = CASE_GENERATION_HEADER.format(**values) + CASE_SCHEMA_BODY
    return CaseSpec(prompt=prompt, **values)


def build_case_prompt(rng: random.Random | None = None) -> str:
    """프롬프트 문자열만 필요할 때. 조건까지 필요하면 build_case_spec을 쓴다."""
    return build_case_spec(rng).prompt


CASE_GENERATION_HEADER = """
당신은 하드보일드 미스터리 소설의 거장입니다.
탐정(플레이어)이 해결해야 할 단편 추리 시나리오를 JSON 포맷으로 생성하세요.

[이번 사건의 지정 조건 - 반드시 그대로 따르세요]
- 범죄 유형: {crime_type}
- 무대: {stage}
- 당시 조건: {condition}
- 시간대: {time_frame}
- 범인: suspects 배열에서 **id {culprit_id}** 인 인물 (이 인물만 isCulprit: true)
- evidence_list 개수: 정확히 {evidence_count}개

[금지된 클리셰]
아래 설정은 이미 과도하게 사용되었습니다. 절대 사용하지 마세요.
- 폭우/안개/눈보라로 고립된 저택·산장·별장
- 외부와 연락이 끊긴 외딴 섬이나 산속 펜션
위에 지정된 무대와 조건을 그대로 사용하고, 날씨를 고립 장치로 쓰지 마세요.

[출력 형식 - 절대 원칙]
- 응답은 반드시 순수 JSON만 출력하세요.
- Markdown 코드 블록(```json ... ```), 주석(//, /* */), 설명 문구를 절대 포함하지 마세요.
- JSON 파싱에 실패하면 게임이 작동하지 않습니다.

[핵심 요구사항]
1. 사실의 일관성: 모든 용의자는 동일한 시공간에 존재했습니다. 공간 구조, 시간의 흐름, 현장 상태는 절대적으로 일치해야 합니다.
2. 범죄 유형: 위 [지정 조건]의 crime_type을 그대로 사용하세요. 직접 고르지 마세요.
3. 이름 표기: 모든 인물의 이름은 괄호나 영문 병기 없이 순수 한글로만 작성하세요.
4. 범인 지정: [지정 조건]에 명시된 id의 용의자에게만 isCulprit: true를 할당하세요. 나머지 2명은 반드시 isCulprit: false입니다. 정확히 1명만 true여야 합니다.
5. 범인 필드: 아래 스키마 예시의 suspects는 세 명 모두 isCulprit: false로 적혀 있습니다.
   [지정 조건]의 범인 id에 해당하는 인물만 isCulprit을 true로 바꾸고, 그 인물에게만 아래 두 필드를 추가하세요.
   "motive": "범행 동기",
   "trick": "world_setting과 evidence_list를 활용한 구체적이고 논리적인 트릭"
   isCulprit은 반드시 JSON boolean(true/false)이어야 합니다. 문자열로 쓰지 마세요.
6. 증거물 개수: evidence_list는 [지정 조건]에 명시된 개수를 정확히 지키세요. 범인을 직접 특정하는 단서(이름, 주민번호, 이니셜 등)는 금지이며, 간접적이고 정황적인 증거여야 합니다.
"""

CASE_SCHEMA_BODY = """
[JSON 스키마]

{
  "title": "사건 제목",
  "summary": "탐정에게 전달될 사건 브리핑 (3문장 요약)",
  "crime_type": "살인 또는 방화 또는 납치 또는 강도 또는 절도",
  "world_setting": {
    "location": "[지정 조건]의 무대를 구체적 공간 구조로 서술 (방/층/출입구/사각지대)",
    "weather": "[지정 조건]의 당시 조건을 현장 묘사로 서술"
  },
  "victim_info": {
    "name": "피해자 이름 (순수 한글)",
    "damage_details": "직접적인 사인 또는 피해 내용",
    "body_condition": "시신 또는 현장의 상태 묘사",
    "incident_time": "사건 발생 추정 시각"
  },
  "evidence_list": [
    { "name": "증거물 이름", "description": "상세 묘사 (간접적, 정황적 증거)" }
  ],
  "timeline_truth": [
    "HH:MM - 상황 묘사",
    "HH:MM - 사건 발생 직전 상황",
    "HH:MM - 사건 발생 추정 시각 및 특이사항",
    "HH:MM - 사건 발각"
  ],
  "suspects": [
    {
      "id": 1,
      "name": "이름 (순수 한글)",
      "role": "직업 또는 관계",
      "gender": "Male 또는 Female",
      "age": 30,
      "personality": "성격 묘사",
      "image_prompt_keywords": "외모 묘사 키워드 (반드시 영어, 콤마 구분. 예: Short hair, glasses, sharp eyes, wearing a suit)",
      "secret": "숨기고 있는 비밀 (범인이 아니더라도 의심받을 만한 행동)",
      "isCulprit": false,
      "real_action": "timeline_truth에 따른 실제 행적",
      "alibi_claim": "탐정에게 주장할 알리바이"
    },
    {
      "id": 2,
      "name": "이름 (순수 한글)",
      "role": "직업 또는 관계",
      "gender": "Male 또는 Female",
      "age": 40,
      "personality": "성격 묘사",
      "image_prompt_keywords": "외모 묘사 키워드 (반드시 영어, 콤마 구분. 예: Short hair, glasses, sharp eyes, wearing a suit)",
      "secret": "숨기고 있는 비밀 (범인이 아니더라도 의심받을 만한 행동)",
      "isCulprit": false,
      "real_action": "timeline_truth에 따른 실제 행적",
      "alibi_claim": "탐정에게 주장할 알리바이"
    },
    {
      "id": 3,
      "name": "이름 (순수 한글)",
      "role": "직업 또는 관계",
      "gender": "Male 또는 Female",
      "age": 50,
      "personality": "성격 묘사",
      "image_prompt_keywords": "외모 묘사 키워드 (반드시 영어, 콤마 구분. 예: Short hair, glasses, sharp eyes, wearing a suit)",
      "secret": "숨기고 있는 비밀 (범인이 아니더라도 의심받을 만한 행동)",
      "isCulprit": false,
      "real_action": "timeline_truth에 따른 실제 행적",
      "alibi_claim": "탐정에게 주장할 알리바이"
    }
  ],
  "solution": "사건의 전말 (누가, 왜, 어떻게 범행을 저질렀는지 육하원칙을 따른 논리적 해설과 범행 동기를 설명. 게임이 끝날 때까지 절대 변하지 않는 유일한 정답입니다.)"
}

언어: 한국어(Korean)
"""


def generate_portrait_prompt(suspect):
    base = (
        "Grayscale Korean manhwa style illustration, clean digital linework, "
        "webtoon aesthetic, monochromatic shading with screentones, "
        "expressive character design, front-facing gaze, white background, "
        "high quality character portrait, solo portrait, only one person, single character"
    )
    age = suspect.get("age", 30)
    gender = suspect.get("gender", "Unknown")
    role = suspect.get("role", "")
    personality = suspect.get("personality", "")
    keywords = suspect.get("image_prompt_keywords", "")
    return f"{base}, {age} year old {gender} {role}, {personality} expression, {keywords}"


def generate_suspect_prompt(suspect, world, timeline, evidence):
    evidence_lines = "\n   ".join(
        f"{i + 1}. {e.get('name', '')}: {e.get('description', '')}"
        for i, e in enumerate(evidence or [])
    )
    timeline_text = "\n   ".join(timeline or [])
    is_culprit = suspect.get("isCulprit", False)
    culprit_hint = (
        "당신은 진범입니다. 논리적으로 거짓말을 꾸며내세요."
        if is_culprit
        else "당신은 결백합니다. 사실대로 말하거나 억울해하세요."
    )

    return f"""
당신은 추리 게임의 용의자 '{suspect.get("name", "")}'({suspect.get("role", "")})입니다.
탐정(플레이어)이 당신을 심문하고 있습니다.

[절대적 사실 - 당신의 기억 속에 명확히 존재합니다]
이 설정은 절대 변하지 않으며, 당신은 이 세계관 안에서만 대답해야 합니다.
1. 장소 구조: {world.get("location", "")}
   - 경고: 위 묘사에 없는 방이나 구조를 절대 지어내지 마세요. 모르면 "모른다"고 답하세요.
2. 당시 상황: {world.get("weather", "")}
3. 공통 타임라인:
   {timeline_text}
   (단, 당신이 직접 보지 못한 타인의 은밀한 행동은 모릅니다.)
4. 현장에서 발견된 증거물 (탐정이 언급할 수 있습니다. 이 목록에 없는 증거는 존재하지 않습니다):
   {evidence_lines}

[당신의 설정]
- 성격: {suspect.get("personality", "")}
- 비밀: {suspect.get("secret", "")} (들키지 않으려 노력하세요)
- 실제 행적: {suspect.get("real_action", "")}
- 주장하는 알리바이: {suspect.get("alibi_claim", "")}
- 범인 여부: {culprit_hint}

[대화 지침]
- 답변은 구어체로 자연스럽게, 2문장 이내로 짧게 하세요.
- 탐정이 구체적인 물건/장소를 물어보면 [절대적 사실]에 근거해 답하세요.
- [절대적 사실]에 없는 내용은 상상해서 지어내지 말고 "기억이 안 난다", "모르겠다"고 회피하세요.
"""


def generate_evaluation_prompt(truth, culprit_name, chosen_suspect_name, reasoning, is_over_time):
    penalty = (
        "\n[중요 페널티]: 탐정이 제한시간(20분)을 초과했습니다. 추리가 완벽하더라도 '시간 관리' 점수는 0점이며, 최종 등급은 최대 'B'까지만 부여할 수 있습니다."
        if is_over_time
        else "탐정은 제한 시간 내에 추리를 완료했습니다. (시간 관리 만점: 10점)"
    )
    return f"""
[절대 원칙: 사실 왜곡 금지]
당신은 냉철한 판사입니다. 아래 제공된 [사건의 진상]을 유일한 정답으로 간주해야 합니다.
AI가 생성한 것이라도, 기존에 설정된 사건의 진상과 다른 내용을 새로 창조해내지 마십시오.
탐정(플레이어)의 추리가 [사건의 진상]과 일치하는지만을 판단하세요.

[사건의 진상 (Ground Truth)]
{truth}

진범: {culprit_name}

[탐정의 추리]
지목한 범인: {chosen_suspect_name}
추리 내용: {reasoning}

{penalty}

[평가 기준 (총 100점)]
1. 범인 지목 (40점)
   - 40점: 진범을 정확히 지목함.
   - 0점: 엉뚱한 용의자를 지목함.

2. 논리성 & 증거 (30점)
   - 30점: 핵심 트릭과 알리바이 모순을 구체적 증거로 논리적 설명.
   - 20점: 트릭은 간파했으나 구체적 증거 제시 부족.
   - 10점: 심증에 의존하거나 논리적 비약 심함.
   - 0점: 근거 없음 또는 모순.

3. 범행 동기 (20점)
   - 20점: 범행 동기를 정확히 파악.
   - 10점: 동기를 짐작했으나 구체적 내용 부족/틀림.
   - 0점: 동기 언급 없음 또는 오판.

4. 시간 관리 (10점)
   - 10점: 제한 시간(20분) 내 완료.
   - 0점: 제한 시간 초과.

[등급 체계]
- S (95~100점)
- A (85~94점)
- B (70~84점)
- C (50~69점)
- F (0~49점)

위 내용을 바탕으로 탐정을 평가해주세요.
다음 포맷을 엄격히 지켜주세요:

[JUDGMENT]
(성공 또는 실패 - 진범을 맞췄으면 성공)

[GRADE]
(S/A/B/C/F)

[REPORT]
(탐정에게 보내는 타자기 스타일의 수사 보고서 본문. 경어체 사용. 3~4문장.)

[ADVICE]
(탐정이 놓친 핵심 질문이나 단서 2가지. "아쉬운 점: ~를 물어봤어야 했다, ~을 생각해야 했다." 형식으로 구체적으로.)
(탐정이 완벽한 추리를 했다면 "없음"이라고 출력하세요. 이 섹션은 반드시 출력해야 합니다.)
(탐정이 추리에 실패했다면 범인의 이름 등 스포일러가 될 수 있는 내용은 절대 포함하지 마세요.)
"""
