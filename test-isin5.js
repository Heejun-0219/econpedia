import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const prompt = "What is the 12-character ISIN code for NVIDIA (NVDA)? Respond with ONLY the code.";
  const response = await ai.models.generateContent({
    model: 'gemini-pro-latest',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.1, maxOutputTokens: 100 }
  });
  console.log("TEXT:", response.text);
}
run().catch(console.error);
