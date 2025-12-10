import { NextResponse } from 'next/server';
import { callGemini } from '../lib/gemini';
import { generateEvaluationPrompt } from '../lib/prompts';
import { CaseData } from '@/app/types/game';

const PYTHON_BACKEND_URL = 'https://mintflavor.ddns.net:8001'; 

export async function POST(req: Request) {
  try {
    const { scenarioId, deductionData } = await req.json();
    const { culpritName, reasoning, isOverTime } = deductionData;

    if (!scenarioId || !culpritName || !reasoning) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // 1. Fetch full case data (Truth)
    const scenarioResponse = await fetch(`${PYTHON_BACKEND_URL}/scenarios/${scenarioId}`);
    
    if (!scenarioResponse.ok) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    const scenarioData = await scenarioResponse.json();
    const caseData: CaseData = scenarioData.case_data;

    // 2. Extract Truth
    // Assuming caseData has a 'solution' field or similar with the full truth
    const truth = caseData.solution || "No solution provided in case data.";
    
    // Find real culprit name
    const realCulprit = caseData.suspects.find(s => s.isCulprit);
    const realCulpritName = realCulprit ? realCulprit.name : "Unknown";

    // 3. Construct Evaluation Prompt
    const evalPrompt = generateEvaluationPrompt(truth, realCulpritName, culpritName, reasoning, isOverTime);

    // 4. Call Gemini
    const evalResult = await callGemini(evalPrompt);

    // 5. Parse Result (Server-side parsing)
    const grade = evalResult.match(/[\[]GRADE[^\]]*[\]]\s*(.*)/)?.[1] || "F";
    const report = evalResult.match(/[\[]REPORT[^\]]*[\]]\s*([\s\S]*?)(?=[\[]ADVICE[^\]]*[\]]|$)/)?.[1]?.trim() || "보고서 생성 실패";
    const advice = evalResult.match(/[\[]ADVICE[^\]]*[\]]\s*([\s\S]*)/)?.[1]?.trim() || "조언을 불러올 수 없습니다.";
    const isCorrect = (realCulpritName.trim() === culpritName.trim());

    // 6. Return Evaluation Result
    return NextResponse.json({
        isCorrect,
        report,
        advice,
        grade,
        truth, // Now it's safe to reveal the truth as the game is over
        culpritName: realCulpritName
    });

  } catch (error) {
    console.error("Evaluation Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
