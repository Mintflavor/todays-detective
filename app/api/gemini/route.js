import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    // 1. 프론트엔드에서 보낸 프롬프트를 받음
    const { prompt } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY; // 서버에 숨겨진 키 사용

    if (!apiKey) {
      return NextResponse.json({ error: 'API Key not configured' }, { status: 500 });
    }

    // 2. Google Gemini API 호출
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();

    // 3. 결과를 프론트엔드로 전달
    return NextResponse.json(data);
    
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}