import { WebSocket } from 'ws';

const ws = new WebSocket('ws://localhost:4173/api/gemini/live');

ws.on('open', () => {
  console.log('Connected to gateway');
  const setupPayload = {
    setup: {
      model: 'models/gemini-2.5-flash-native-audio-latest',
      generationConfig: {
        responseModalities: ['AUDIO'],
      },
    },
  };
  ws.send(JSON.stringify(setupPayload));
  console.log('Sent setup payload');
});

let pcmInterval = null;

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Received:', Object.keys(msg));
  if (msg.setupComplete) {
    console.log('Setup complete! Starting 16kHz PCM stream...');
    const silentPcm = Buffer.alloc(4096 * 2).toString('base64');
    pcmInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: 'audio/pcm;rate=16000',
                data: silentPcm,
              },
            ],
          },
        }));
      }
    }, 250);
  }
});

ws.on('close', (code, reason) => {
  console.log(`Gateway closed code ${code}: ${reason.toString()}`);
  if (pcmInterval) clearInterval(pcmInterval);
  process.exit(0);
});

ws.on('error', (err) => console.error('Error:', err.message));

setTimeout(() => {
  console.log('SUCCESS: PCM audio streaming session stable for 6s!');
  if (pcmInterval) clearInterval(pcmInterval);
  ws.close();
}, 6000);
