import { CaseData } from "@/app/types/game";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export interface ScenarioListItem {
  _id: string;
  title: string;
  summary: string;
  crime_type: string;
  created_at: string;
}



export async function getScenarios(page: number = 1, limit: number = 10, crimeType?: string): Promise<ScenarioListItem[]> {
  let url = `${API_BASE_URL}/scenarios/?page=${page}&limit=${limit}`;
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
  const response = await fetch(`/api/game/scenario/${id}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error("Failed to fetch scenario detail");
  }
  return response.json();
}

export async function getScenarioDetailFull(id: string): Promise<CaseData> {
  const response = await fetch(`${API_BASE_URL}/scenarios/${id}`);
  if (!response.ok) {
    throw new Error("Failed to fetch scenario detail");
  }
  const data = await response.json();
  return data.case_data;
}

export async function deleteScenario(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/scenarios/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Failed to delete scenario: ${response.statusText}`);
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
  const response = await fetch('/api/game/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || '피드백 전송에 실패했습니다.');
  }
}

export async function getFeedbacks(page: number = 1, limit: number = 10): Promise<FeedbackItem[]> {
  const response = await fetch(`${API_BASE_URL}/feedbacks/?page=${page}&limit=${limit}`);
  if (!response.ok) {
    throw new Error('Failed to fetch feedbacks');
  }
  return response.json();
}

export async function deleteFeedback(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/feedbacks/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Failed to delete feedback: ${response.statusText}`);
  }
}

