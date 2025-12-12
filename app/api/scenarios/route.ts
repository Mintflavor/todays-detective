import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 백엔드로 직접 요청 (슬래시를 명시적으로 포함)
    const response = await fetch(`${BACKEND_URL}/scenarios/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    // 백엔드 응답을 그대로 반환
    return NextResponse.json(data, { status: response.status });
    
  } catch (error) {
    console.error("Proxy Error:", error);
    return NextResponse.json({ error: "Failed to proxy request" }, { status: 500 });
  }
}
