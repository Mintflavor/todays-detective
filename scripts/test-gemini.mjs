import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

if (!apiKey) {
  console.error('GEMINI_API_KEY가 설정되지 않았습니다. --env-file=.env 로 실행하세요.');
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey });

async function callGemini(prompt) {
  const optimized = prompt.replace(/^[ \t]+/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  const response = await genAI.models.generateContent({
    model,
    contents: [{ parts: [{ text: optimized }] }],
  });
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 응답에서 텍스트를 추출할 수 없습니다.');
  return text;
}

// ──────────────────────────────────────────────
// STEP 1: 케이스 생성
// ──────────────────────────────────────────────

const CASE_GENERATION_PROMPT = `
당신은 하드보일드 미스터리 소설의 거장입니다.
탐정(플레이어)이 해결해야 할 단편 추리 시나리오를 JSON 포맷으로 생성하세요.

[출력 형식 - 절대 원칙]
- 응답은 반드시 순수 JSON만 출력하세요.
- Markdown 코드 블록(\`\`\`json ... \`\`\`), 주석(//, /* */), 설명 문구를 절대 포함하지 마세요.
- JSON 파싱에 실패하면 게임이 작동하지 않습니다.

[핵심 요구사항]
1. 사실의 일관성: 모든 용의자는 동일한 시공간에 존재했습니다. 공간 구조, 시간의 흐름, 현장 상태는 절대적으로 일치해야 합니다.
2. 범죄 유형의 다양성: 살인, 방화, 납치, 강도, 절도 중 하나를 무작위로 선택하세요. 각 유형의 선택 확률은 20%입니다.
3. 이름 표기: 모든 인물의 이름은 괄호나 영문 병기 없이 순수 한글로만 작성하세요.
4. 범인 지정: suspects 배열의 3명 중 정확히 1명에게만 isCulprit: true를 할당하세요. 나머지 2명은 반드시 isCulprit: false입니다.
5. 범인 필드: isCulprit: true인 용의자에게는 motive(범행 동기)와 trick(트릭) 필드를 반드시 추가하세요.
6. 증거물 제한: evidence_list는 최대 3개까지만 생성하세요. 범인을 직접 특정하는 단서(이름, 주민번호, 이니셜 등)는 금지이며, 간접적이고 정황적인 증거여야 합니다.

[JSON 스키마]

{
  "title": "사건 제목",
  "summary": "탐정에게 전달될 사건 브리핑 (3문장 요약)",
  "crime_type": "살인 또는 방화 또는 납치 또는 강도 또는 절도",
  "world_setting": {
    "location": "사건 현장의 구체적 구조",
    "weather": "날씨와 분위기"
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
      "image_prompt_keywords": "외모 묘사 키워드 (반드시 영어, 콤마 구분)",
      "secret": "숨기고 있는 비밀",
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
      "image_prompt_keywords": "외모 묘사 키워드 (반드시 영어)",
      "secret": "숨기고 있는 비밀",
      "isCulprit": true,
      "motive": "범행 동기",
      "trick": "구체적이고 논리적인 트릭",
      "real_action": "실제 범행 행동",
      "alibi_claim": "거짓 알리바이"
    },
    {
      "id": 3,
      "name": "이름 (순수 한글)",
      "role": "직업 또는 관계",
      "gender": "Male 또는 Female",
      "age": 50,
      "personality": "성격 묘사",
      "image_prompt_keywords": "외모 묘사 키워드 (반드시 영어)",
      "secret": "숨기고 있는 비밀",
      "isCulprit": false,
      "real_action": "실제 행적",
      "alibi_claim": "알리바이"
    }
  ],
  "solution": "사건의 전말 (누가, 왜, 어떻게 범행을 저질렀는지 논리적 해설)"
}

언어: 한국어(Korean)
`;

function generateSuspectPrompt(suspect, world, timeline, evidence) {
  return `
당신은 추리 게임의 용의자 '${suspect.name}'(${suspect.role})입니다.
탐정(플레이어)이 당신을 심문하고 있습니다.

[절대적 사실 - 당신의 기억 속에 명확히 존재합니다]
이 설정은 절대 변하지 않으며, 당신은 이 세계관 안에서만 대답해야 합니다.
1. 장소 구조: ${world.location}
   - 경고: 위 묘사에 없는 방이나 구조를 절대 지어내지 마세요. 모르면 "모른다"고 답하세요.
2. 당시 상황: ${world.weather}
3. 공통 타임라인:
   ${timeline.join('\n   ')}
   (단, 당신이 직접 보지 못한 타인의 은밀한 행동은 모릅니다.)
4. 현장에서 발견된 증거물 (탐정이 언급할 수 있습니다. 이 목록에 없는 증거는 존재하지 않습니다):
   ${evidence.map((e, i) => `${i + 1}. ${e.name}: ${e.description}`).join('\n   ')}

[당신의 설정]
- 성격: ${suspect.personality}
- 비밀: ${suspect.secret} (들키지 않으려 노력하세요)
- 실제 행적: ${suspect.real_action}
- 주장하는 알리바이: ${suspect.alibi_claim}
- 범인 여부: ${suspect.isCulprit ? '당신은 진범입니다. 논리적으로 거짓말을 꾸며내세요.' : '당신은 결백합니다. 사실대로 말하거나 억울해하세요.'}

[대화 지침]
- 답변은 구어체로 자연스럽게, 2문장 이내로 짧게 하세요.
- 탐정이 구체적인 물건/장소를 물어보면 [절대적 사실]에 근거해 답하세요.
- [절대적 사실]에 없는 내용은 상상해서 지어내지 말고 "기억이 안 난다", "모르겠다"고 회피하세요.
`;
}

function generateEvaluationPrompt(truth, culpritName, chosenSuspectName, reasoning, isOverTime) {
  const penaltyInstruction = isOverTime
    ? '\n[중요 페널티]: 탐정이 제한시간(10분)을 초과했습니다. 추리가 완벽하더라도 \'시간 관리\' 점수는 0점이며, 최종 등급은 최대 \'B\'까지만 부여할 수 있습니다.'
    : '탐정은 제한 시간 내에 추리를 완료했습니다. (시간 관리 만점: 10점)';

  return `
[절대 원칙: 사실 왜곡 금지]
당신은 냉철한 판사입니다. 아래 제공된 [사건의 진상]을 유일한 정답으로 간주해야 합니다.
탐정(플레이어)의 추리가 [사건의 진상]과 일치하는지만을 판단하세요.

[사건의 진상 (Ground Truth)]
${truth}

진범: ${culpritName}

[탐정의 추리]
지목한 범인: ${chosenSuspectName}
추리 내용: ${reasoning}

${penaltyInstruction}

[평가 기준 (총 100점)]
1. 범인 지목 (40점): 40점(정확) / 0점(오답)
2. 논리성 & 증거 (30점): 30/20/10/0점
3. 범행 동기 (20점): 20/10/0점
4. 시간 관리 (10점): 10점(제한 내) / 0점(초과)

[등급 체계] S(95~100) / A(85~94) / B(70~84) / C(50~69) / F(0~49)

다음 포맷을 엄격히 지켜주세요:

[JUDGMENT]
(성공 또는 실패)

[GRADE]
(S/A/B/C/F)

[REPORT]
(타자기 스타일 수사 보고서. 경어체. 3~4문장.)

[ADVICE]
(탐정이 놓친 핵심 질문이나 단서 2가지. 완벽한 추리라면 "없음"이라고 출력하세요. 이 섹션은 반드시 출력해야 합니다.)
`;
}

// ──────────────────────────────────────────────
// 실행
// ──────────────────────────────────────────────

function ok(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }
function fail(msg) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`); }
function section(title) { console.log(`\n\x1b[1m=== ${title} ===\x1b[0m`); }

async function main() {
  console.log(`\x1b[36m모델: ${model}\x1b[0m`);

  // ── STEP 1: 케이스 생성 ──
  section('STEP 1: 케이스 생성');
  console.log('  Gemini 호출 중...');
  const rawCase = await callGemini(CASE_GENERATION_PROMPT);

  let caseData;
  try {
    caseData = JSON.parse(rawCase.replace(/```json/g, '').replace(/```/g, '').trim());
    ok('JSON 파싱 성공');
  } catch (e) {
    fail(`JSON 파싱 실패: ${e.message}`);
    console.log('\n--- 원본 응답 ---\n', rawCase.slice(0, 500));
    process.exit(1);
  }

  const requiredFields = ['title', 'summary', 'crime_type', 'world_setting', 'victim_info', 'evidence_list', 'timeline_truth', 'suspects', 'solution'];
  const missing = requiredFields.filter(f => !caseData[f]);
  if (missing.length > 0) {
    fail(`필수 필드 누락: ${missing.join(', ')}`);
  } else {
    ok(`필수 필드 확인 (${requiredFields.join(', ')})`);
  }

  if (!Array.isArray(caseData.suspects) || caseData.suspects.length !== 3) {
    fail(`용의자 수 오류: ${caseData.suspects?.length ?? 0}명 (3명 필요)`);
  } else {
    ok('용의자 3명 확인');
  }

  const culprits = caseData.suspects.filter(s => s.isCulprit === true);
  if (culprits.length !== 1) {
    fail(`isCulprit: true 용의자가 ${culprits.length}명 (정확히 1명 필요)`);
  } else {
    ok(`진범 1명 확인: ${culprits[0].name} (${culprits[0].role})`);
  }

  const culprit = culprits[0];
  if (culprit && (!culprit.motive || !culprit.trick)) {
    fail('진범의 motive 또는 trick 필드 누락');
  } else if (culprit) {
    ok('진범 motive/trick 필드 확인');
  }

  console.log(`\n  제목: ${caseData.title}`);
  console.log(`  범죄 유형: ${caseData.crime_type}`);
  console.log(`  피해자: ${caseData.victim_info?.name}`);

  // ── STEP 2: 용의자 심문 ──
  section('STEP 2: 용의자 심문');
  const testSuspect = caseData.suspects[0];
  console.log(`  대상 용의자: ${testSuspect.name} (${testSuspect.role})`);
  console.log('  Gemini 호출 중...');

  const systemPrompt = generateSuspectPrompt(
    testSuspect,
    caseData.world_setting,
    caseData.timeline_truth,
    caseData.evidence_list,
  );
  const chatPrompt = `${systemPrompt}\n\n[이전 대화]\n없음\n\n탐정: 사건 당일 어디 계셨나요?\n용의자:`;
  const chatReply = await callGemini(chatPrompt);

  ok('용의자 응답 수신');
  console.log(`\n  응답: "${chatReply.trim()}"`);

  // ── STEP 3: 추리 평가 ──
  section('STEP 3: 추리 평가');
  const realCulpritName = culprit?.name ?? '알 수 없음';
  const wrongSuspect = caseData.suspects.find(s => !s.isCulprit);
  const testReasoning = `저는 ${wrongSuspect?.name}이(가) 범인이라고 생각합니다. 현장 증거를 보면 의심스럽습니다.`;
  console.log(`  지목한 범인: ${wrongSuspect?.name} (실제 범인: ${realCulpritName})`);
  console.log('  Gemini 호출 중...');

  const evalPrompt = generateEvaluationPrompt(
    caseData.solution,
    realCulpritName,
    wrongSuspect?.name ?? '미지정',
    testReasoning,
    false,
  );
  const evalResult = await callGemini(evalPrompt);

  const judgment = evalResult.match(/\[JUDGMENT\]\s*([\s\S]*?)(?=\[GRADE\])/)?.[1]?.trim();
  const grade = evalResult.match(/\[GRADE\]\s*([\s\S]*?)(?=\[REPORT\])/)?.[1]?.trim();
  const report = evalResult.match(/\[REPORT\]\s*([\s\S]*?)(?=\[ADVICE\])/)?.[1]?.trim();
  const advice = evalResult.match(/\[ADVICE\]\s*([\s\S]*)/)?.[1]?.trim();

  if (judgment) { ok(`[JUDGMENT] 파싱: ${judgment}`); } else { fail('[JUDGMENT] 파싱 실패'); }
  if (grade) { ok(`[GRADE] 파싱: ${grade}`); } else { fail('[GRADE] 파싱 실패'); }
  if (report) { ok('[REPORT] 파싱 성공'); console.log(`\n  ${report}`); } else { fail('[REPORT] 파싱 실패'); }
  if (advice) { ok('[ADVICE] 파싱 성공'); console.log(`\n  ${advice}`); } else { fail('[ADVICE] 파싱 실패'); }

  section('완료');
  console.log('  모든 단계가 성공적으로 완료되었습니다.\n');
}

main().catch(e => {
  console.error('\n\x1b[31m오류 발생:\x1b[0m', e.message);
  process.exit(1);
});
