import { GoogleGenAI } from '@google/genai';

export async function callGemini(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not defined in environment variables");
    }

    try {
        const genAI = new GoogleGenAI({ apiKey });
        const model = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
        
        // Optimize prompt to save tokens:
        // 1. Remove leading indentation from each line
        // 2. Replace 3+ newlines with 2 (preserve paragraph separation but reduce excess)
        // 3. Trim the final result
        const optimizedPrompt = prompt
            .replace(/^[ \t]+/gm, '') 
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        const requestParams = {
            model: model,
            contents: [{ parts: [{ text: optimizedPrompt }] }],
        };

        console.log("--- [Gemini API FULL Request] ---");
        console.log(JSON.stringify(requestParams, null, 2));
        console.log("---------------------------------");

        const response = await genAI.models.generateContent(requestParams);

        console.log("--- [Gemini API FULL Response] ---");
        // Log the full response object to see all details including metadata
        console.log(JSON.stringify(response, null, 2));
        console.log("----------------------------------");

        if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts && response.candidates[0].content.parts.length > 0) {
             const text = response.candidates[0].content.parts[0].text;
             if (text) return text;
        }
        
        console.error("Unexpected Gemini API response structure:", response);
        throw new Error("Invalid response structure from Gemini API");

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        throw error;
    }
}

export async function generateImage(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not defined");
    }

    try {
        const genAI = new GoogleGenAI({ apiKey });
        const response = await genAI.models.generateImages({
            model: 'imagen-4.0-fast-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                aspectRatio: "1:1",
            }
        });

        // The response structure for generateImages might return predictions or generatedImages
        // Based on the new SDK, it likely returns 'generatedImages' which contains 'image' (base64)
        // Checking response type dynamically or assuming standard format.
        
        if (response.generatedImages && response.generatedImages.length > 0) {
            const image = response.generatedImages[0].image;
             if (image && image.imageBytes) {
                return image.imageBytes;
            } else if (typeof image === 'string') {
                return image; // Sometimes it might be direct base64 string
            }
        }
        
        console.error("No image data in Imagen response", response);
        throw new Error("No image data in Imagen response");

    } catch (error) {
        console.error("Image Generation Failed:", error);
        throw error;
    }
}
