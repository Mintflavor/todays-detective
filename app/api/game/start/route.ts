import { NextResponse } from 'next/server';
import { callGemini } from '../lib/gemini';
import { CASE_GENERATION_PROMPT } from '../lib/prompts';
import { CaseData } from '@/app/types/game';

// Python Backend URL (Adjust if your backend is running elsewhere)
const PYTHON_BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST() {
  try {
    // 1. Generate case using Gemini
    const resultText = await callGemini(CASE_GENERATION_PROMPT);
    
    // 2. Parse JSON
    let caseData: CaseData;
    try {
      caseData = JSON.parse(resultText.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) {
      console.error("JSON Parse Error:", e);
      return NextResponse.json({ error: 'Failed to parse generated case data' }, { status: 500 });
    }

    // 3. Save to Python Backend
    // Note: Assuming your Python backend accepts the exact structure of CaseData in the `case_data` field
    const saveResponse = await fetch(`${PYTHON_BACKEND_URL}/scenarios/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: caseData.title,
        summary: caseData.summary,
        crime_type: caseData.crime_type || "Unknown", // Handle optional field
        case_data: caseData
      })
    });

    if (!saveResponse.ok) {
      console.error("Backend Save Error:", await saveResponse.text());
      return NextResponse.json({ error: 'Failed to save scenario to backend' }, { status: 500 });
    }

    const savedScenario = await saveResponse.json();
    const scenarioId = savedScenario._id;

    // 4. Sanitize Data for Client (Remove spoilers)
    const sanitizedCaseData = {
      ...caseData,
      // Remove sensitive fields
      solution: undefined,
      truth: undefined, // If truth is a top-level field
      suspects: caseData.suspects.map(suspect => ({
        ...suspect,
        isCulprit: undefined,
        secret: undefined, // Or keep secret if it's not the ultimate truth, but usually safe to hide until revealed
        real_action: undefined,
        motive: undefined,
        trick: undefined
      }))
    };

    // 5. Return sanitized data + scenarioId
    return NextResponse.json({
      scenarioId: scenarioId,
      caseData: sanitizedCaseData
    });

  } catch (error) {
    console.error("Game Start Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
