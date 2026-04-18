import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const prompt = "Find the ISIN (International Securities Identification Number) for 'Apple Inc.' with ticker 'AAPL'. Return ONLY the 12-character ISIN code.";
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.1, maxOutputTokens: 100 }
  });
  console.log("TEXT:", response.text);
}
run().catch(console.error);
