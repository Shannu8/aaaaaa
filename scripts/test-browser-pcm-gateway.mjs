import { WebSocket } from 'ws';
import { loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = loadEnv('', path.join(__dirname, '..'), '');

const apiKey = (process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || '').trim();

console.log('=== Antari\'s / God\'s Eye View Phase 2 Browser PCM Streamer Test ===');
console.log('1. Checking GEMINI_API_KEY environment variable...');
console.log('   GEMINI_API_KEY configured:', Boolean(apiKey));

if (!apiKey) {
  console.log('\n[RESULT] GEMINI_API_KEY is not set in environment or .env file.');
  console.log('To run live PCM streaming tests against Gemini Live API, export GEMINI_API_KEY or set it in .env');
  process.exit(0);
}

// Generate 0.5s of 16kHz sine wave audio (440 Hz) converted to 16-bit PCM base64
function generateTestPcmBase64() {
  const sampleRate = 16000;
  const duration = 0.5;
  const numSamples = sampleRate * duration;
  const buffer = new ArrayBuffer(numSamples * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t);
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(i * 2, int16, true);
  }

  return Buffer.from(buffer).toString('base64');
}

console.log('\n2. Simulating browser WebSocket client connecting to /api/gemini/live...');
const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;

const ws = new WebSocket(url);
let receivedResponse = false;

const timeout = setTimeout(() => {
  if (!receivedResponse) {
    console.error('\n[TIMEOUT] Live PCM test connection timed out.');
    ws.close();
    process.exit(1);
  }
}, 12000);

ws.on('open', () => {
  console.log('   Connected to Gemini Live service!');
  console.log('3. Sending setup frame...');
  ws.send(JSON.stringify({
    setup: {
      model: 'models/gemini-2.0-flash-exp',
      generationConfig: {
        responseModalities: ['TEXT'],
      },
    },
  }));

  console.log('4. Streaming simulated 16kHz Int16 PCM audio chunk...');
  const base64Pcm = generateTestPcmBase64();
  ws.send(JSON.stringify({
    realtimeInput: {
      mediaChunks: [
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64Pcm,
        },
      ],
    },
  }));
});

ws.on('message', (data) => {
  receivedResponse = true;
  clearTimeout(timeout);
  console.log('\n5. Response received from Gemini Live after PCM audio input!');
  console.log('--------------------------------------------------');
  try {
    const parsed = JSON.parse(data.toString());
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log(data.toString().slice(0, 200));
  }
  console.log('--------------------------------------------------');
  console.log('\n[SUCCESS] Browser PCM Audio Streaming to Gemini Live verified successfully!');
  ws.close();
  process.exit(0);
});

ws.on('error', (err) => {
  clearTimeout(timeout);
  console.error('\n[ERROR] Gemini Live PCM stream error:', err?.message || err);
  process.exit(1);
});
