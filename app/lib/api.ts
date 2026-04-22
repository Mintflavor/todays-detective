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

