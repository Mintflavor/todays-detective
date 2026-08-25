// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

export interface Suspect {
  id: number;
  name: string;
  role: string;
  gender?: 'Male' | 'Female' | 'Unknown';
  age?: number;
  portraitImage?: string; // S3/MinIO URL (구 데이터는 Base64 문자열)
  image_prompt_keywords?: string;
  personality: string;
  // 아래 두 필드는 서버 정화본에 **존재하지 않는다** (SPOILER_SUSPECT_FIELDS).
  // 관리자 화면이 원본을 직접 조회할 때만 채워진다.
  secret?: string;
  isCulprit?: boolean;
  real_action?: string;
  alibi_claim?: string;
  motive?: string;
  trick?: string;
}

export interface VictimInfo {
  name: string;
  damage_details: string; // e.g., cause of death or stolen items
  body_condition: string; // e.g., body state or scene state
  incident_time: string; // e.g., time of death or time of theft
}

export interface Evidence {
  name: string;
  description: string;
}

export interface WorldSetting {
  location: string;
  weather: string;
}

export interface CaseData {
  title: string;
  summary: string;
  crime_type: string; // e.g., "Murder", "Theft", "Arson"
  world_setting: WorldSetting;
  // 서버 정화본에 없다 (SPOILER_TOP_FIELDS). 관리자 원본 조회에서만 채워진다.
  timeline_truth?: string[];
  victim_info: VictimInfo;
  evidence_list: Evidence[];
  suspects: Suspect[];
  // 서버 정화본에 없다. 추리 평가 응답의 Evaluation.truth로만 노출된다.
  solution?: string;
  scenarioId?: string; // Add scenarioId
  caseNumber?: string;
}

export interface ChatMessage {
  role: 'user' | 'ai' | 'system' | 'note';
  text: string;
}

export interface ChatLogs {
  [key: number]: ChatMessage[];
}

export interface DeductionInput {
  culpritId: number | null;
  reasoning: string;
}

export interface Evaluation {
  isCorrect: boolean;
  report: string; // 타자기 보고서 본문
  advice: string; // 수사 보완점 (힌트)
  grade: string;
  truth: string;
  culpritName: string;
  culpritImage?: string; // Add portrait image of the culprit
  timeTaken: string;
  caseNumber?: string;
}

export type GamePhase = 'intro' | 'load_menu' | 'tutorial' | 'loading' | 'briefing' | 'investigation' | 'deduction' | 'resolution';
export type LoadingType = 'case' | 'deduction';
