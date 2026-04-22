// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL;

export async function POST(req: Request) {
  try {
    const { content, scenarioId, grade, gameResult } = await req.json();

    if (typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: '피드백 내용이 비어있습니다.' }, { status: 400 });
    }

    const trimmed = content.trim();
    if (trimmed.length > 300) {
      return NextResponse.json({ error: '피드백은 최대 300자까지 입력할 수 있습니다.' }, { status: 400 });
    }

    let gameResultPayload: Record<string, unknown> | null = null;
    if (gameResult && typeof gameResult === 'object') {
      gameResultPayload = {
        scenario_title: gameResult.scenarioTitle ?? null,
        selected_suspect_id:
          typeof gameResult.selectedSuspectId === 'number' ? gameResult.selectedSuspectId : null,
        selected_suspect_name: gameResult.selectedSuspectName ?? null,
        reasoning: typeof gameResult.reasoning === 'string' ? gameResult.reasoning : null,
        is_correct: typeof gameResult.isCorrect === 'boolean' ? gameResult.isCorrect : null,
        grade: gameResult.grade ?? null,
        culprit_name: gameResult.culpritName ?? null,
        report: typeof gameResult.report === 'string' ? gameResult.report : null,
        advice: typeof gameResult.advice === 'string' ? gameResult.advice : null,
        time_taken: typeof gameResult.timeTaken === 'string' ? gameResult.timeTaken : null,
      };
    }

    const res = await fetch(`${BACKEND_URL}/feedbacks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: trimmed,
        scenario_id: scenarioId || null,
        grade: grade || null,
        game_result: gameResultPayload,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Feedback save error:', errText);
      return NextResponse.json({ error: '피드백 저장에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Feedback route error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
