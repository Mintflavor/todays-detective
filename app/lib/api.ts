// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import { CaseData } from "@/app/types/game";
import { adminHeaders } from "./adminAuth";
import { API_BASE, errorMessage, readJson } from "./http";

// same-origin 프록시. NEXT_PUBLIC_API_URL은 빌드 타임에 번들에 박히므로 쓰지 않는다.
const API_BASE_URL = API_BASE;

export interface ScenarioListItem {
  _id: string;
  title: string;
  summary: string;
  crime_type: string;
  created_at: string;
}



export async function getScenarios(page: number = 1, limit: number = 10, crimeType?: string): Promise<ScenarioListItem[]> {
  let url = `${API_BASE_URL}/scenarios?page=${page}&limit=${limit}`;
  if (crimeType && crimeType !== "ALL") {
    url += `&crime_type=${encodeURIComponent(crimeType)}`;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch scenarios");
  }
  return response.json();
}

export async function getScenarioDetail(id: string): Promise<CaseData> {
  const response = await fetch(`${API_BASE_URL}/api/game/scenario/${id}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error("Failed to fetch scenario detail");
  }
  return response.json();
}

/** ⚠️ 정화되지 않은 원본을 받는다 (solution, isCulprit 포함). 관리자 전용. */
export async function getScenarioDetailFull(id: string): Promise<CaseData> {
  const response = await fetch(`${API_BASE_URL}/scenarios/${id}`, {
    headers: adminHeaders(),
  });
  if (!response.ok) {
    throw new Error(errorMessage(await readJson(response), "Failed to fetch scenario detail"));
  }
  const data = await response.json();
  return data.case_data;
}

export async function deleteScenario(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/scenarios/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });

  if (!response.ok) {
    throw new Error(errorMessage(await readJson(response), `Failed to delete scenario: ${response.statusText}`));
  }
}

export interface FeedbackGameResult {
  scenarioTitle?: string;
  selectedSuspectId?: number | null;
  selectedSuspectName?: string | null;
  reasoning?: string;
  isCorrect?: boolean;
  grade?: string;
  culpritName?: string;
  report?: string;
  advice?: string;
  timeTaken?: string;
}

export interface FeedbackItem {
  _id: string;
  content: string;
  scenario_id?: string | null;
  grade?: string | null;
  created_at: string;
  game_result?: FeedbackGameResult | null;
}

export interface SubmitFeedbackPayload {
  content: string;
  scenarioId?: string;
  grade?: string;
  gameResult?: FeedbackGameResult;
}

export async function submitFeedback(payload: SubmitFeedbackPayload): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/game/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(errorMessage(await readJson(response), '피드백 전송에 실패했습니다.'));
  }
}

export async function getFeedbacks(page: number = 1, limit: number = 10): Promise<FeedbackItem[]> {
  const response = await fetch(`${API_BASE_URL}/feedbacks?page=${page}&limit=${limit}`, {
    headers: adminHeaders(),
  });
  if (!response.ok) {
    throw new Error(errorMessage(await readJson(response), 'Failed to fetch feedbacks'));
  }
  return response.json();
}

export async function deleteFeedback(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/feedbacks/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  if (!response.ok) {
    throw new Error(errorMessage(await readJson(response), `Failed to delete feedback: ${response.statusText}`));
  }
}

export interface QAMessage {
  role: 'user' | 'model' | 'assistant';
  content: string;
}

export interface AskQuestionPayload {
  scenarioId: string;
  question: string;
  history?: QAMessage[];
}

export async function askCaseQuestion(payload: AskQuestionPayload): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/game/qa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(errorMessage(await readJson(response), '수석 분석관과의 통신에 실패했습니다.'));
  }

  const data = await response.json();
  return data.answer;
}


