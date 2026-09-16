import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'node:url';
import { loadEnv } from 'vite';

/**
 * Server-side Gemini Live WebSocket Gateway.
 *
 * Mounts at `/api/gemini/live`.
 * Receives WebSocket connection from browser, securely attaches `GEMINI_API_KEY`
 * server-side, and establishes a bidirectional proxy to Google's Gemini Multimodal Live API
 * (`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`).
 *
 * Additionally sends a `setupInfo` message to the client right after connection opens,
 * carrying the non-secret model name and voice name from env so the client can build
 * the correct Gemini setup payload without hardcoded values in the browser bundle.
 *
 * Security:
 * - `GEMINI_API_KEY` stays strictly server-side in `process.env`.
 * - Never sent to browser client or exposed in client logs/defines.
 * - Model and voice strings are non-secret configuration — safe to relay to the client.
 */

/** Default Live model — current GA as of Sep 2026. */
const DEFAULT_LIVE_MODEL = 'gemini-3.8-live';
/** Default voice — clear, neutral; well-suited for a tactical intelligence assistant. */
const DEFAULT_LIVE_VOICE = 'Puck';

/** Load dotenv values once per resolution; best-effort so it never throws. */
function resolveEnv() {
  let loaded = {};
  try {
    loaded = loadEnv('', process.cwd(), '');
  } catch { /* best effort */ }
  return loaded;
}

export function createGeminiLiveGateway({
  apiKeyResolver = () => {
    const loaded = resolveEnv();
    return (process.env.GEMINI_API_KEY || loaded.GEMINI_API_KEY || '').trim();
  },
  modelResolver = () => {
    const loaded = resolveEnv();
    return (process.env.GEMINI_LIVE_MODEL || loaded.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL).trim();
  },
  voiceResolver = () => {
    const loaded = resolveEnv();
    return (process.env.GEMINI_LIVE_VOICE || loaded.GEMINI_LIVE_VOICE || DEFAULT_LIVE_VOICE).trim();
  },
  upstreamWebSocketCtor = WebSocket,
  warn = (...args) => console.warn('[Gemini Live Gateway]', ...args),
  log = (...args) => console.log('[GEMINI]', ...args),
} = {}) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (clientWs, _req) => {
    const apiKey = (apiKeyResolver() || '').trim();
    console.log(`[GEMINI DEBUG] GEMINI_API_KEY present: ${Boolean(apiKey)}`);

    if (!apiKey) {
      warn('Connection refused: GEMINI_API_KEY environment variable is not set.');
      try {
        clientWs.send(JSON.stringify({
          error: 'GEMINI_API_KEY environment variable is not set.',
        }));
        clientWs.close(4001, 'Missing API Key');
      } catch { /* best effort */ }
      return;
    }

    const liveModel = modelResolver() || DEFAULT_LIVE_MODEL;
    const liveVoice = voiceResolver() || DEFAULT_LIVE_VOICE;

    // Normalize model string — always use the full `models/` prefix form.
    const modelId = `models/${liveModel.replace(/^models\//, '')}`;

    // Send non-secret config to the browser client immediately so it can build
    // the correct Gemini Live setup payload without hardcoded values.
    try {
      clientWs.send(JSON.stringify({
        setupInfo: { model: modelId, voice: liveVoice },
      }));
      log(`Client connected — model: ${modelId}, voice: ${liveVoice}`);
    } catch { /* best effort */ }

    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;

    let upstreamWs = null;
    let isClosed = false;
    const clientQueue = [];

    const closeAll = (code = 1000, reason = '') => {
      if (isClosed) return;
      isClosed = true;

      try {
        if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
          clientWs.close(code, reason);
        }
      } catch { /* best effort */ }

      try {
        if (upstreamWs && (upstreamWs.readyState === WebSocket.OPEN || upstreamWs.readyState === WebSocket.CONNECTING)) {
          upstreamWs.close(code, reason);
        }
      } catch { /* best effort */ }
    };

    try {
      upstreamWs = new upstreamWebSocketCtor(geminiUrl);
    } catch (err) {
      warn('Failed to construct upstream WebSocket:', err?.message || err);
      try {
        clientWs.send(JSON.stringify({
          error: 'Failed to connect to Gemini Live service',
          message: err?.message || 'WebSocket creation error',
        }));
      } catch { /* best effort */ }
      closeAll(1011, 'Upstream Error');
      return;
    }

    // Upstream (Gemini) open → flush any messages buffered before it was ready.
    upstreamWs.on('open', () => {
      log('Upstream Gemini connection open');
      while (clientQueue.length > 0 && upstreamWs.readyState === WebSocket.OPEN) {
        const msg = clientQueue.shift();
        upstreamWs.send(msg);
      }
    });

    // Relay: Gemini → Browser Client
    upstreamWs.on('message', (data, isBinary) => {
      if (isClosed) return;
      try {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data, { binary: isBinary });
        }
      } catch (err) {
        warn('Error sending message to client:', err?.message || err);
      }
    });

    upstreamWs.on('error', (err) => {
      warn('Upstream Gemini WebSocket error:', err?.message || err);
      try {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            error: 'Gemini Live service error',
            message: err?.message || 'Upstream Error',
          }));
        }
      } catch { /* best effort */ }
      closeAll(1011, 'Upstream Error');
    });

    upstreamWs.on('close', (code, reason) => {
      log('Upstream connection closed — code:', code);
      closeAll(code, reason ? reason.toString() : 'Upstream Closed');
    });

    // Relay: Browser Client → Gemini
    clientWs.on('message', (data, isBinary) => {
      if (isClosed) return;
      if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
        try {
          upstreamWs.send(data, { binary: isBinary });
        } catch (err) {
          warn('Error sending message to Gemini upstream:', err?.message || err);
        }
      } else if (upstreamWs && upstreamWs.readyState === WebSocket.CONNECTING) {
        clientQueue.push(data);
      }
    });

    clientWs.on('error', (err) => {
      warn('Browser client WebSocket error:', err?.message || err);
      closeAll(1011, 'Client Error');
    });

    clientWs.on('close', (code, reason) => {
      log('Client disconnected — code:', code);
      closeAll(code, reason ? reason.toString() : 'Client Closed');
    });
  });

  return {
    wss,
    attachToHttpServer(httpServer) {
      if (!httpServer) return;
      httpServer.on('upgrade', (request, socket, head) => {
        let pathname = '';
        try {
          pathname = new URL(request.url || '', 'http://localhost').pathname;
        } catch {
          return;
        }

        if (pathname === '/api/gemini/live') {
          wss.handleUpgrade(request, socket, head, (clientWs) => {
            wss.emit('connection', clientWs, request);
          });
        }
      });
    },
  };
}

export function geminiLiveProxy(opts = {}) {
  const gateway = createGeminiLiveGateway(opts);

  return {
    name: 'gemini-live-proxy',
    configureServer(server) {
      gateway.attachToHttpServer(server.httpServer);
    },
    configurePreviewServer(server) {
      gateway.attachToHttpServer(server.httpServer);
    },
  };
}
