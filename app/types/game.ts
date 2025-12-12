export interface Suspect {
  id: number;
  name: string;
  role: string;
  gender?: 'Male' | 'Female' | 'Unknown';
  age?: number;
  portraitImage?: string; // Base64 string
  image_prompt_keywords?: string;
  personality: string;
  secret: string;
  isCulprit: boolean;
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
  timeline_truth: string[];
  victim_info: VictimInfo;
  evidence_list: Evidence[];
  suspects: Suspect[];
  solution: string;
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
