import { CaseData } from "@/app/types/game";

const API_BASE_URL = "/server";

export interface ScenarioListItem {
  _id: string;
  title: string;
  summary: string;
  crime_type: string;
  created_at: string;
}

export async function saveScenario(caseData: CaseData) {
  // Use local API route to proxy request and avoid CORS/Redirect issues
  const response = await fetch(`/api/scenarios`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: caseData.title,
      summary: caseData.summary,
      crime_type: caseData.crime_type,
      case_data: caseData,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to save scenario");
  }

  return response.json();
}

export async function getScenarios(page: number = 1, limit: number = 10): Promise<ScenarioListItem[]> {
  const response = await fetch(`${API_BASE_URL}/scenarios/?page=${page}&limit=${limit}`);
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
