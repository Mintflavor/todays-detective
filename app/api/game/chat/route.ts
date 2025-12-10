import { NextResponse } from 'next/server';
import { callGemini } from '../lib/gemini';
import { generateSuspectPrompt } from '../lib/prompts';
import { CaseData } from '@/app/types/game';

const PYTHON_BACKEND_URL = 'https://mintflavor.ddns.net:8001'; 

export async function POST(req: Request) {
  try {
    const { scenarioId, suspectId, message, history } = await req.json();

    if (!scenarioId || suspectId === undefined || !message) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // 1. Fetch full case data from Python Backend
    const scenarioResponse = await fetch(`${PYTHON_BACKEND_URL}/scenarios/${scenarioId}`);
    
    if (!scenarioResponse.ok) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    const scenarioData = await scenarioResponse.json();
    const caseData: CaseData = scenarioData.case_data;

    // 2. Find target suspect
    const suspect = caseData.suspects.find(s => s.id === suspectId);
    if (!suspect) {
      return NextResponse.json({ error: 'Suspect not found' }, { status: 404 });
    }

    // 3. Construct Prompt (Server-side)
    // We use the full case data here, including secrets and culprit status!
    const worldSetting = caseData.world_setting;

    // Note: The original `interrogateSuspect` in useGeminiClient used `caseTimelineTruth`
    // Ensure your CaseData has this or extract it from `caseData.timeline` if it exists.
    // For now, I'll assume caseData.timeline is what we want.
    const timeline = caseData.timeline_truth || []; 
    // Convert timeline objects to strings if necessary, or adjust generateSuspectPrompt to accept objects
    const timelineStrings = Array.isArray(timeline) ? timeline : [];

    const systemPrompt = generateSuspectPrompt(suspect, worldSetting, timelineStrings);
    const fullPrompt = `${systemPrompt}\n\n[이전 대화]\n${history}\n\n탐정: ${message}\n용의자:`;

    // 4. Call Gemini
    const reply = await callGemini(fullPrompt);

    // 5. Return only the reply
    return NextResponse.json({ reply });

  } catch (error) {
    console.error("Chat Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
