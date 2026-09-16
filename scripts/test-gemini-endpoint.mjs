import { GoogleGenAI } from '@google/genai';
import { loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = loadEnv('', path.join(__dirname, '..'), '');

// Respect process.env first, then dotenv file
const apiKey = (process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || '').trim();

console.log('=== Antari\'s / God\'s Eye View Gemini Integration Test ===');
console.log('1. Checking GEMINI_API_KEY environment variable...');
console.log('   GEMINI_API_KEY is configured:', Boolean(apiKey));

if (!apiKey) {
  console.log('\n[RESULT] GEMINI_API_KEY is not set in environment or .env file.');
  console.log('To run this test with live Gemini responses, export GEMINI_API_KEY or set it in .env');
  process.exit(0);
}

console.log('\n2. Sending test prompt to Google Gemini API...');
const prompt = 'Give me a short situational summary of Antarctica.';
console.log(`   Prompt: "${prompt}"`);

try {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  console.log('\n3. Response received successfully from Gemini!');
  console.log('--------------------------------------------------');
  console.log(response.text);
  console.log('--------------------------------------------------');
  console.log('\n[SUCCESS] Gemini endpoint integration verified successfully!');
} catch (err) {
  console.error('\n[ERROR] Failed to reach Gemini API:', err?.message || err);
  process.exit(1);
}
