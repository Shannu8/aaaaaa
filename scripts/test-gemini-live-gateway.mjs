import { WebSocket } from 'ws';
import { loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = loadEnv('', path.join(__dirname, '..'), '');

const apiKey = (process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || '').trim();

console.log('=== Antari\'s / God\'s Eye View Gemini Live Gateway Test ===');
console.log('1. Checking GEMINI_API_KEY environment variable...');
console.log('   GEMINI_API_KEY is configured:', Boolean(apiKey));

if (!apiKey) {
  console.log('\n[RESULT] GEMINI_API_KEY is not set in environment or .env file.');
  console.log('To run live Gemini Live API tests, export GEMINI_API_KEY or set it in .env');
  process.exit(0);
}

console.log('\n2. Opening test WebSocket connection to Gemini Multimodal Live API...');
const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;

const ws = new WebSocket(url);
let receivedMessage = false;

const timeout = setTimeout(() => {
  if (!receivedMessage) {
    console.error('\n[TIMEOUT] Gemini Live connection timed out after 10s.');
    ws.close();
    process.exit(1);
  }
}, 10000);

ws.on('open', () => {
  console.log('   Connected to Gemini Live WebSocket successfully!');
  console.log('3. Sending initial setup payload...');
  const setupPayload = {
    setup: {
      model: 'models/gemini-2.0-flash-exp',
      generationConfig: {
        responseModalities: ['TEXT'],
      },
    },
  };
  ws.send(JSON.stringify(setupPayload));
});

ws.on('message', (data) => {
  receivedMessage = true;
  clearTimeout(timeout);
  console.log('\n4. Received response frame from Gemini Live API!');
  console.log('--------------------------------------------------');
  try {
    const parsed = JSON.parse(data.toString());
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log(data.toString().slice(0, 200));
  }
  console.log('--------------------------------------------------');
  console.log('\n[SUCCESS] Gemini Multimodal Live WebSocket Gateway verification passed!');
  ws.close();
  process.exit(0);
});

ws.on('error', (err) => {
  clearTimeout(timeout);
  console.error('\n[ERROR] Gemini Live WebSocket error:', err?.message || err);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  if (!receivedMessage) {
    console.log(`\n[CLOSE] WebSocket closed with code: ${code}, reason: ${reason || 'none'}`);
  }
});
