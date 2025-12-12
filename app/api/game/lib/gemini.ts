import { CaseData, Evaluation } from '@/app/types/game';

// Define the interface for the Gemini API response
interface GeminiResponse {
    candidates: {
        content: {
            parts: {
                text: string;
            }[];
        };
    }[];
}

export async function callGemini(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-preview-09-2025";

    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not defined in environment variables");
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Gemini API Error:", errorData);
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
        }

        const data: GeminiResponse = await response.json();
        
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
             return data.candidates[0].content.parts[0].text;
        } else {
             console.error("Unexpected Gemini API response structure:", data);
             throw new Error("Invalid response structure from Gemini API");
        }

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        throw error;
    }
}
