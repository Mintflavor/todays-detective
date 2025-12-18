import { Suspect, WorldSetting, CaseData } from '@/app/types/game';

export const CASE_GENERATION_PROMPT = `
당신은 하드보일드 미스터리 소설의 거장입니다.
탐정(플레이어)이 해결해야 할 단편 추리 시나리오를 JSON 포맷으로 생성하세요.

[핵심 요구사항]
1. 사실의 일관성: 모든 용의자는 동일한 시공간에 존재했습니다. 공간 구조, 시간의 흐름, 시신의 상태는 절대적으로 일치해야 합니다.
2. **범죄 유형의 다양성 (매우 중요)**: **살인, 방화, 납치, 강도, 절도** 중 하나를 무작위로 선택하세요. 모든 범죄 유형의 선택 확률은 20% 입니다.
3. 이름 표기: 모든 인물의 이름은 괄호나 영문 병기 없이 **순수 한글**로만 작성하세요. (예: '김철수', '제임스 박')

다음 JSON 스키마를 엄격히 준수하여 응답하세요 (Markdown 코드 블록 없이 순수 JSON만 출력):

{
  "title": "사건 제목 (예: 빗속의 살인자, 사라진 아이, 불타는 저택)",
  "summary": "탐정에게 전달될 사건 브리핑 (3문장 요약)",
  "crime_type": "범죄 유형 (예: 살인, 방화, 납치, 강도, 절도 중 택1)",
  
  "world_setting": {
    "location": "사건 현장의 구체적 구조 (예: 2층 저택, 밀실된 서재, 도심의 펜트하우스, 눈 덮인 산장, 운행 중인 열차, 오래된 극장 대기실 등 다양한 장소와 위치)",
    "weather": "날씨와 분위기 (예: 폭우로 고립됨, 눈보라가 몰아침, 안개가 자욱한 새벽, 찌는 듯한 무더위, 천둥번개가 치는 밤 등 다양한 날씨와 분위기)"
  },

  "victim_info": {
    "name": "피해자 이름 (순수 한글)",
    "damage_details": "직접적인 사인 또는 피해 내용 (예: 흉기에 찔린 자상, 독극물 중독 반응, 화재로 인한 질식, 유괴되어 사라짐, 금고가 털림)",
    "body_condition": "시신 또는 현장의 상태 묘사 (예: 피를 흘리며 쓰러져 있음, 밧줄에 묶인 흔적만 남음, 불에 탄 흔적이 역력함, 방어흔이 있음)",
    "incident_time": "사건 발생 추정 시각 (예: 사망 추정 시각, 화재 발생 시각, 실종 시각)"
  },

  "evidence_list": [
    { "name": "증거물 이름 1", "description": "상세 묘사 (중요: 범인을 특정할 수 있는 직접적 단서(이름, 주민번호, 이니셜 등)는 금지. 간접적이고 정황적인 증거여야 함. 예: 립스틱 자국이 묻은 컵, 타다 만 성냥, 찢어진 편지 조각)" },
    { "name": "증거물 이름 2", "description": "상세 묘사" }
    // (증거물은 최대 3개까지만 생성하세요)
  ],

  "timeline_truth": [
    "19:00 - 사건 발생 2시간 전 상황",
    "20:00 - 사건 발생 직전 상황 (갈등 심화)",
    "20:30 - 사건 발생 추정 시각 및 특이사항 (예: 정전, 소음)",
    "21:00 - 사건 발각"
    // (사건은 하루 24시 중 언제라도 발생할 수 있습니다)
  ],

  "suspects": [
    {
      "id": 1,
      "name": "이름 (순수 한글)",
      "role": "직업 또는 관계",
      "gender": "성별 (Male 또는 Female)",
      "age": "나이 (숫자)",
      "personality": "성격 묘사",
      "image_prompt_keywords": "외모 묘사 키워드 (반드시 영어로 작성, 콤마로 구분. 예: Short hair, glasses, sharp eyes, wearing a suit)",
      "secret": "숨기고 있는 비밀 (범인이 아니더라도 의심 살만한 행동)",
      "isCulprit": false, // 중요: AI는 이들 중 단 한 명에게만 isCulprit: true를 할당해야 합니다.
      "real_action": "timeline_truth에 따른 실제 행적",
      "alibi_claim": "탐정에게 주장할 알리바이"
    },
    {
      "id": 2,
      "name": "이름 (순수 한글)",
      "role": "직업/관계",
      "gender": "...",
      "age": 30,
      "personality": "...",
      "image_prompt_keywords": "...",
      "secret": "...",
      // 범인일 경우 motive와 trick 필드가 추가되어야 합니다.
      // "motive": "범행 동기",
      // "trick": "world_setting과 evidence_list를 활용한 구체적이고 논리적인 트릭",
      "real_action": "실제 범행 행동",
      "alibi_claim": "거짓 알리바이"
    },
    {
      "id": 3,
      "name": "이름 (순수 한글)",
      "role": "직업/관계",
      "gender": "...",
      "age": 40,
      "personality": "...",
      "image_prompt_keywords": "...",
      "secret": "...",
      "isCulprit": false, // 중요: AI는 이들 중 단 한 명에게만 isCulprit: true를 할당해야 합니다.
      "real_action": "...",
      "alibi_claim": "..."
    }
  ],
  "solution": "사건의 전말 (누가, 왜, 어떻게 범행을 저질렀는지 논리적 해설. 이 내용은 게임이 끝날 때까지 절대 변하면 안 됩니다.)"
}

언어: 한국어(Korean)
`;

export const generatePortraitPrompt = (suspect: Suspect) => {
  const basePrompt = "Grayscale Korean manhwa style illustration, clean digital linework, webtoon aesthetic, monochromatic shading with screentones, expressive character design, front-facing gaze, white background, high quality character portrait, solo portrait, only one person, single character";
  const charDetails = `${suspect.age || 30} year old ${suspect.gender || 'Unknown'} ${suspect.role}`;
  const expression = `${suspect.personality} expression`;
  // Use image_prompt_keywords if available (needs to be added to Suspect interface if strict typing used here, or handled loosely)
  // Since Suspect interface is in game.ts, we should update it or cast here.
  // Assuming suspect object passed here comes from the raw JSON generation which includes 'image_prompt_keywords'.
  const keywords = (suspect as any).image_prompt_keywords || ""; 

  return `${basePrompt}, ${charDetails}, ${expression}, ${keywords}`;
};

export const generateSuspectPrompt = (suspect: Suspect, world: WorldSetting, timeline: string[]) => `
당신은 추리 게임의 용의자 '${suspect.name}'(${suspect.role})입니다.
탐정(플레이어)이 당신을 심문하고 있습니다.

[절대적 사실 - 당신의 기억 속에 명확히 존재합니다]
이 설정은 절대 변하지 않으며, 당신은 이 세계관 안에서만 대답해야 합니다.
1. 장소 구조: ${world.location}
   - 경고: 위 묘사에 없는 방이나 구조를 절대 지어내지 마세요. 모르면 "모른다"고 답하세요.
2. 당시 상황: ${world.weather}
3. 공통 타임라인:
   ${timeline.join('\n')}
   (단, 당신이 직접 보지 못한 타인의 은밀한 행동은 모릅니다.)

[당신의 설정]
- 성격: ${suspect.personality}
- 비밀: ${suspect.secret} (들키지 않으려 노력하세요)
- 실제 행적: ${suspect.real_action}
- 주장하는 알리바이: ${suspect.alibi_claim}
- 범인 여부: ${suspect.isCulprit ? "당신은 진범입니다. 논리적으로 거짓말을 꾸며내세요." : "당신은 결백합니다. 사실대로 말하거나 억울해하세요."}

[대화 지침]
- 답변은 구어체로 자연스럽게, 2문장 이내로 짧게 하세요.
- 탐정이 구체적인 물건/장소를 물어보면 [절대적 사실]에 근거해 답하세요.
- [절대적 사실]에 없는 내용은 상상해서 지어내지 말고 "기억이 안 난다", "모르겠다"고 회피하세요.
`;

export const generateEvaluationPrompt = (
  truth: string, 
  culpritName: string, 
  chosenSuspectName: string, 
  reasoning: string, 
  isOverTime: boolean
) => {
  const penaltyInstruction = isOverTime 
      ? "\n[중요 페널티]: 탐정이 제한시간(10분)을 초과했습니다. 추리가 완벽하더라도 '시간 관리' 점수는 0점이며, 최종 등급은 최대 'B'까지만 부여할 수 있습니다." 
      : "탐정은 제한 시간 내에 추리를 완료했습니다. (시간 관리 만점: 10점)";

  return `
      [절대 원칙: 사실 왜곡 금지]
      당신은 냉철한 판사입니다. 아래 제공된 [사건의 진상]을 유일한 정답으로 간주해야 합니다.
      AI가 생성한 것이라도, 기존에 설정된 사건의 진상과 다른 내용을 새로 창조해내지 마십시오.
      탐정(플레이어)의 추리가 [사건의 진상]과 일치하는지만을 판단하세요.

      [사건의 진상 (Ground Truth)]
      ${truth}
      
      진범: ${culpritName}

      [탐정의 추리]
      지목한 범인: ${chosenSuspectName}
      추리 내용: ${reasoning}

      ${penaltyInstruction}

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
         - 10점: 제한 시간(10분) 내 완료.
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
      (탐정이 완벽한 추리를 했다면 조언할 필요는 없습니다.)
    `;
};
