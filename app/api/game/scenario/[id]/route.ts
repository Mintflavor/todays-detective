// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const res = await fetch(`${BACKEND_URL}/scenarios/${id}`);
  if (!res.ok) {
    return NextResponse.json({ error: 'Scenario not found' }, { status: res.status });
  }

  const scenarioData = await res.json();
  const caseData = scenarioData.case_data;

  if (!caseData) {
    return NextResponse.json({ error: 'Invalid scenario data' }, { status: 500 });
  }

  const sanitized = {
    ...caseData,
    solution: undefined,
    timeline_truth: undefined,
    suspects: (caseData.suspects || []).map((s: Record<string, unknown>) => ({
      ...s,
      isCulprit: undefined,
      secret: undefined,
      real_action: undefined,
      motive: undefined,
      trick: undefined,
    })),
  };

  return NextResponse.json(sanitized);
}
