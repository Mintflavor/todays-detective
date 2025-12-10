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
    // const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error("---------- GEMINI API ERROR ----------");
    console.error("Prompt:", body.prompt);
    console.error("Error:", error);
    console.error("--------------------------------------");
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}