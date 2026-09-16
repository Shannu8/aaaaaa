/**
 * Gemini Live Voice Client for Antari's / God's Eye View.
 *
 * Connects to the local server-side WebSocket proxy gateway (`/api/gemini/live`),
 * captures browser microphone audio, converts samples to 16kHz 16-bit Mono PCM,
 * streams base64 PCM frames to Gemini Live API, decodes 24kHz Int16 Mono PCM
 * voice responses from Gemini, and schedules gapless WebAudio playback.
 * Integrates Gemini Live function/tool calling with the existing Antari's GEV action system.
 *
 * Security:
 * - NEVER contains or exposes `GEMINI_API_KEY`.
 * - Connects strictly to same-origin `/api/gemini/live` endpoint.
 * - Model and voice names are received from the server's setupInfo message (non-secret config).
 */

import { createGevActionRunner } from './gevActions.js';

/**
 * Client-side defaults for Gemini Live — used only if the server's setupInfo
 * message is not received before the WebSocket opens (should not happen in normal
 * operation; purely a defensive fallback).
 *
 * Current GA model as of Sep 2026: gemini-3.8-live
 * Voice: Puck — clear, neutral voice well-suited for tactical intelligence.
 */
export const GEMINI_LIVE_DEFAULTS = Object.freeze({
  MODEL: 'models/gemini-3.8-live',
  VOICE: 'Puck',
});

/**
 * Compact system instruction for the ANTARIS / God's Eye View context.
 * Injected into every Gemini Live session setup payload.
 */
const GEV_SYSTEM_INSTRUCTION = `You are ANTARIS — an AI spatial intelligence assistant embedded in God's Eye View, a real-time 3D globe and intelligence console.

You can see and control:
- A photorealistic 3D Cesium globe showing planet Earth
- Live data layers: aircraft flights, military flights, ships/vessels (AIS), satellites, earthquakes, active fires, icebergs, traffic cameras (CCTV), internet radio, bikeshare stations
- Camera navigation: fly to locations, zoom, track moving entities
- Visual styles: normal, retro, surveillance, thermal, anime, noir, snow
- UI panels: data layers, locations, styles, filters, CCTV, radio
- Cockpit tracking mode for aircraft and vessels

Be concise, precise, and tactical in your responses. When the operator asks you to perform a map action, call the appropriate tool immediately — do not narrate what you are about to do, just do it and confirm the result briefly.

If you are unsure of current layer state or camera position, acknowledge that and offer to help with what you can.`;

export const GEMINI_LIVE_FUNCTION_DECLARATIONS = [
  {
    name: 'set_layer_visibility',
    description: 'Show or hide a data layer on the map (e.g. flights, planes, military, vessels, ships, satellites, earthquakes, fires, local-firms, icebergs, traffic, cctv, radio, bikeshare).',
    parameters: {
      type: 'OBJECT',
      properties: {
        layerId: {
          type: 'STRING',
          description: 'Layer ID or alias e.g. "flights", "military", "vessels", "satellites", "earthquakes", "fires", "icebergs", "traffic", "cctv", "radio", "bikeshare".',
        },
        enabled: {
          type: 'BOOLEAN',
          description: 'True to show/enable the layer, false to hide/disable.',
        },
      },
      required: ['layerId', 'enabled'],
    },
  },
  {
    name: 'fly_to_location',
    description: 'Fly camera to a specified location, landmark, city, or region on Earth (e.g. Antarctica, Antarctic Peninsula, New York, San Francisco, Tokyo).',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Location, city, landmark, or region name query (e.g. "Antarctica", "Antarctic Peninsula").',
        },
        locationId: {
          type: 'STRING',
          description: 'Optional preset location identifier (e.g. antarctica, nyc, sf, dc, tokyo).',
        },
        latitude: {
          type: 'NUMBER',
          description: 'Latitude coordinate.',
        },
        longitude: {
          type: 'NUMBER',
          description: 'Longitude coordinate.',
        },
      },
    },
  },
  {
    name: 'zoom_to_globe',
    description: 'Reset camera view to full global view of Earth.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'adjust_camera_zoom',
    description: 'Zoom the camera in or out.',
    parameters: {
      type: 'OBJECT',
      properties: {
        direction: {
          type: 'STRING',
          description: '"in" or "out"',
          enum: ['in', 'out'],
        },
        amount: {
          type: 'STRING',
          description: '"little", "medium", or "lot"',
          enum: ['little', 'medium', 'lot'],
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'set_visual_style',
    description: 'Set map visual style mode.',
    parameters: {
      type: 'OBJECT',
      properties: {
        style: {
          type: 'STRING',
          description: 'Style mode: "normal", "retro", "surveillance", "thermal", "anime", "noir", "snow"',
          enum: ['normal', 'retro', 'surveillance', 'thermal', 'anime', 'noir', 'snow'],
        },
      },
      required: ['style'],
    },
  },
  {
    name: 'set_panel_open',
    description: 'Open or close a specific UI side panel.',
    parameters: {
      type: 'OBJECT',
      properties: {
        panelId: {
          type: 'STRING',
          description: 'Panel ID or alias e.g., "data", "layers", "locations", "styles", "filters", "cctv", "radio".',
        },
        open: {
          type: 'BOOLEAN',
          description: 'True to open, false to close.',
        },
      },
      required: ['panelId', 'open'],
    },
  },
  {
    name: 'track_entity',
    description: 'Track camera onto a specific aircraft, ship/vessel, or satellite by callsign, name, or ICAO code.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Callsign, vessel name, satellite name, or identifier to track.',
        },
        layerId: {
          type: 'STRING',
          description: 'Optional layer hint e.g., "flights", "military", "ais-live-vessels", "satellites".',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'stop_tracking',
    description: 'Stop camera tracking of current entity.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'select_nearest_aircraft',
    description: 'Find and select the nearest aircraft to a location.',
    parameters: {
      type: 'OBJECT',
      properties: {
        locationQuery: {
          type: 'STRING',
          description: 'Place name or query to find nearest aircraft near.',
        },
        layerId: {
          type: 'STRING',
          description: 'Layer filter: "flights" or "military".',
        },
      },
    },
  },
  {
    name: 'set_context_mode',
    description: 'Set context mode focus.',
    parameters: {
      type: 'OBJECT',
      properties: {
        mode: {
          type: 'STRING',
          description: 'Mode name: "off", "contacts", "flights", "space-missions".',
        },
      },
      required: ['mode'],
    },
  },
  {
    name: 'control_cockpit',
    description: 'Control cockpit tracking mode.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'Action: "enter", "exit", "next", "previous", "status".',
        },
        targetLayer: {
          type: 'STRING',
          description: 'Target layer: "flights", "military", "ais-live-vessels".',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'control_cctv',
    description: 'Control traffic cameras / CCTV overlay.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'Action e.g. "enable", "disable", "next", "previous".',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'control_radio',
    description: 'Control internet radio playback.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'Action: "play", "pause", "stop", "next", "previous".',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'show_data_layers_menu',
    description: 'Show and focus data layers menu panel.',
    parameters: {
      type: 'OBJECT',
      properties: {
        layerId: {
          type: 'STRING',
          description: 'Optional layer to highlight.',
        },
      },
    },
  },
  {
    name: 'calculate_maritime_route',
    description: 'Calculate an obstacle-aware Antarctic maritime route around icebergs, land, and sea ice.',
    parameters: {
      type: 'OBJECT',
      properties: {
        mode: {
          type: 'STRING',
          description: 'Routing mode: "shortest", "low_ice", "balanced", "lowest_risk".',
          enum: ['shortest', 'low_ice', 'balanced', 'lowest_risk'],
        },
        start_lat: { type: 'NUMBER', description: 'Start latitude' },
        start_lon: { type: 'NUMBER', description: 'Start longitude' },
        dest_lat: { type: 'NUMBER', description: 'Destination latitude' },
        dest_lon: { type: 'NUMBER', description: 'Destination longitude' },
      },
    },
  },
  {
    name: 'get_voyage_guidance',
    description: 'Get real-time voyage guidance including next waypoint, true bearing, compass direction, distance, heading error, and ETA.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
];

export function extractGeminiToolCalls(msg) {
  if (!msg || typeof msg !== 'object') return [];
  const calls = [];

  if (Array.isArray(msg.toolCall?.functionCalls)) {
    for (const fc of msg.toolCall.functionCalls) {
      if (fc && fc.name) {
        calls.push({
          id: fc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: fc.name,
          args: fc.args || {},
        });
      }
    }
  } else if (msg.toolCall?.name) {
    calls.push({
      id: msg.toolCall.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: msg.toolCall.name,
      args: msg.toolCall.args || {},
    });
  }

  if (Array.isArray(msg.serverContent?.modelTurn?.parts)) {
    for (const part of msg.serverContent.modelTurn.parts) {
      if (part?.functionCall?.name) {
        const fc = part.functionCall;
        calls.push({
          id: fc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: fc.name,
          args: fc.args || {},
        });
      }
    }
  }

  if (msg.functionCall?.name) {
    calls.push({
      id: msg.functionCall.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: msg.functionCall.name,
      args: msg.functionCall.args || {},
    });
  }

  return calls;
}

export function formatGeminiToolResponse(callId, name, result) {
  return {
    toolResponse: {
      functionResponses: [
        {
          response: {
            output: result && typeof result === 'object' ? result : { ok: true, result },
          },
          id: callId,
        },
      ],
    },
  };
}

function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof window !== 'undefined' && typeof window.btoa === 'function'
    ? window.btoa(binary)
    : Buffer.from(buffer).toString('base64');
}

function pcmInt16ToFloat32(base64Data) {
  let binaryString = '';
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    binaryString = window.atob(base64Data);
  } else {
    binaryString = Buffer.from(base64Data, 'base64').toString('binary');
  }
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const dataView = new DataView(bytes.buffer);
  const numSamples = Math.floor(len / 2);
  const float32 = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const int16 = dataView.getInt16(i * 2, true);
    float32[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7FFF;
  }
  return float32;
}

function parseSampleRateFromMimeType(mimeType, defaultRate = 24000) {
  if (!mimeType) return defaultRate;
  const match = mimeType.match(/rate=(\d+)/i);
  return match ? parseInt(match[1], 10) : defaultRate;
}

function getOrCreateVoiceControlUI() {
  let root = typeof document !== 'undefined' ? document.getElementById('gev-voice-control') : null;
  if (!root && typeof document !== 'undefined') {
    root = document.createElement('div');
    root.id = 'gev-voice-control';
    root.dataset.status = 'idle';
    root.dataset.speaker = 'idle';
    root.innerHTML = `
      <div class="gev-voice-heading">
        <div class="gev-voice-kicker">GEMINI AI AGENT</div>
        <div id="gev-voice-status">OFF</div>
        <div class="gev-voice-cost">
          <span id="gev-voice-cost-value" class="gev-voice-cost-value" data-level="ok" title="Gemini Live Multimodal API">GEMINI 2.5</span>
        </div>
      </div>
      <button id="gev-voice-button" type="button" aria-label="Gemini Voice control" aria-describedby="gev-voice-help">
        <span class="gev-mic-orbit"><img src="/mic.svg" alt="" /></span>
        <span class="gev-mic-label">ON/OFF</span>
      </button>
      <div class="gev-voice-visualizer" aria-hidden="true">
        ${Array.from({ length: 15 }, (_, index) => `<span style="--bar:${index}"></span>`).join('')}
      </div>
      <div class="gev-voice-readout">
        <div id="gev-voice-detail">GEMINI LIVE STANDBY</div>
      </div>
      <div id="gev-voice-help" class="gev-voice-help-tray" role="tooltip">
        <span class="gev-voice-help-kicker">GEMINI VOICE CONTROL</span>
        <span class="gev-voice-help-detail">Tap mic to speak to Gemini Live</span>
      </div>
      <div class="gev-voice-error-tray" role="alert" aria-live="assertive">
        <div class="gev-voice-error-header">
          <span>GEMINI VOICE ERROR</span>
          <button class="gev-voice-error-dismiss" type="button">DISMISS</button>
        </div>
        <div id="gev-voice-error-detail"></div>
        <div class="gev-voice-error-hint">Check microphone permission and GEMINI_API_KEY setup.</div>
      </div>
    `;
    const commandDock = document.getElementById('command-dock');
    if (commandDock) {
      commandDock.appendChild(root);
    } else {
      document.body.appendChild(root);
    }
  }

  root?.querySelector?.('.gev-voice-error-dismiss')?.addEventListener('click', () => {
    root.classList.add('error-dismissed');
  });

  return {
    root,
    button: root?.querySelector?.('#gev-voice-button'),
    buttonLabel: root?.querySelector?.('.gev-mic-label'),
    status: root?.querySelector?.('#gev-voice-status'),
    detail: root?.querySelector?.('#gev-voice-detail'),
    helpDetail: root?.querySelector?.('.gev-voice-help-detail'),
    errorDetail: root?.querySelector?.('#gev-voice-error-detail'),
    costValue: root?.querySelector?.('#gev-voice-cost-value'),
  };
}

export class GevGeminiVoiceController {
  constructor({ runner = null, ui = null, onTextResponse = null, onAudioResponse = null } = {}) {
    this.runner = runner;
    this.ui = ui || getOrCreateVoiceControlUI();
    this.onTextResponse = onTextResponse;
    this.onAudioResponse = onAudioResponse;

    this.ws = null;
    this.stream = null;
    this.audioContext = null;
    this.audioSource = null;
    this.processor = null;

    // WebAudio Output Playback state
    this.playbackAudioContext = null;
    this.activeAudioSources = [];
    this.nextPlaybackStartTime = 0;

    // Config received from server's setupInfo message.
    // Populated before the Gemini setup payload is sent.
    this._serverModel = null;
    this._serverVoice = null;

    this.status = 'idle';
    this.isStreaming = false;
    this.startEpoch = 0;

    this.buttonHandler = () => {
      console.log('[GEMINI DEBUG] Voice button clicked');
      if (this.isActive()) this.stop();
      else this.start();
    };

    if (this.ui?.button) {
      // Defensively clear existing listener before adding to avoid accumulation
      this.ui.button.removeEventListener('click', this.buttonHandler);
      this.ui.button.addEventListener('click', this.buttonHandler);
    }

    this.setStatus('idle', 'GEMINI LIVE STANDBY');
  }

  isActive() {
    return this.status !== 'idle' && this.status !== 'error' && this.status !== 'disconnected';
  }

  setStatus(status, detailText = '') {
    this.status = status;
    if (this.ui?.root) {
      this.ui.root.dataset.status = status;
      this.ui.root.classList?.remove?.('error-dismissed');
    }
    if (this.ui?.status) {
      this.ui.status.textContent = status === 'listening' ? 'GEMINI LIVE'
        : status === 'speaking' ? 'SPEAKING'
          : status === 'executing' ? 'EXECUTING'
            : status === 'connecting' ? 'CONNECTING'
              : status === 'disconnected' ? 'DISCONNECTED'
                : status === 'error' ? 'ERROR'
                  : 'OFF';
    }
    if (this.ui?.detail && detailText) {
      this.ui.detail.textContent = detailText;
    }
    if (status === 'error' && this.ui?.errorDetail && detailText) {
      this.ui.errorDetail.textContent = detailText;
    }
  }

  abandonStart(epoch) {
    if (epoch === this.startEpoch) return false;
    this.cleanup();
    return true;
  }

  async start() {
    console.log('[GEMINI DEBUG] connectGemini() called');
    if (this.isActive()) return;

    const epoch = ++this.startEpoch;
    this.setStatus('connecting', 'Connecting to Gemini Live Gateway...');

    // Initialize both input mic AudioContext and playback AudioContext during user gesture stack
    try {
      const AudioCtx = (typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : globalThis.AudioContext);
      if (AudioCtx) {
        if (!this.audioContext || this.audioContext.state === 'closed') {
          this.audioContext = new AudioCtx({ sampleRate: 16000 });
        }
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume().catch(() => {});
        }
        console.log('[GEMINI DEBUG] Input AudioContext state:', this.audioContext.state);

        if (!this.playbackAudioContext || this.playbackAudioContext.state === 'closed') {
          this.playbackAudioContext = new AudioCtx({ sampleRate: 24000 });
        }
        if (this.playbackAudioContext.state === 'suspended') {
          await this.playbackAudioContext.resume().catch(() => {});
        }
        console.log('[GEMINI DEBUG] Playback AudioContext state:', this.playbackAudioContext.state);
      }
    } catch (err) {
      console.warn('[GEMINI DEBUG] AudioContext init warning:', err);
    }

    try {
      // 1. Request microphone permissions
      console.log('[GEMINI DEBUG] Requesting microphone');
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (this.abandonStart(epoch)) {
        localStream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = localStream;
      console.log('[GEMINI DEBUG] Microphone permission granted');
      console.log('[GEMINI DEBUG] Microphone stream active');

      // 2. Establish WebSocket connection to /api/gemini/live
      console.log('[GEMINI DEBUG] Connecting...');
      const isHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:';
      const host = typeof window !== 'undefined' && window.location?.host ? window.location.host : 'localhost:4173';
      const protocol = isHttps ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${host}/api/gemini/live`;
      const localWs = new WebSocket(wsUrl);
      this.ws = localWs;

      localWs.onopen = async () => {
        if (this.abandonStart(epoch)) return;
        console.log('[GEMINI DEBUG] Gemini session connected');
        this.setStatus('connecting', 'Receiving session config from gateway...');
        
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (this.abandonStart(epoch)) return;

        // Use model/voice from server setupInfo if received; fall back to defaults.
        const model = this._serverModel || GEMINI_LIVE_DEFAULTS.MODEL;
        const voice = this._serverVoice || GEMINI_LIVE_DEFAULTS.VOICE;

        this.setStatus('listening', 'GEMINI LIVE · AUDIO STREAMING (16kHz PCM)');
        console.log(`[GEMINI] Sending setup payload — model: ${model}, voice: ${voice}`);

        const setupPayload = {
          setup: {
            model,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voice,
                  },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: GEV_SYSTEM_INSTRUCTION }],
            },
            tools: [
              {
                functionDeclarations: GEMINI_LIVE_FUNCTION_DECLARATIONS,
              },
            ],
          },
        };
        try {
          localWs.send(JSON.stringify(setupPayload));
          console.log('[GEMINI] Setup payload sent — starting microphone capture');
        } catch (err) {
          console.error('[Gemini Voice] Failed to send setup payload:', err);
        }

        // Start 16kHz PCM microphone audio capture
        await this.startPcmAudioCapture();
        console.log('[GEMINI] Microphone capture started — session active');
      };

      localWs.onmessage = (event) => {
        if (this.startEpoch !== epoch) return;
        this.handleGeminiMessage(event.data);
      };

      localWs.onerror = (err) => {
        if (this.startEpoch !== epoch) return;
        console.error('[Gemini Voice] WebSocket error:', err);
        this.setStatus('error', 'Gemini Live WebSocket connection error');
        this.cleanup();
      };

      localWs.onclose = (event) => {
        if (this.startEpoch !== epoch) return;
        console.log('[GEMINI TRACE] SESSION_CLOSED');
        if (this.status !== 'idle' && this.status !== 'error') {
          const reason = event.reason || (event.code === 4001 ? 'GEMINI_API_KEY missing in server .env' : 'Session ended');
          this.setStatus('disconnected', `Gemini Live disconnected: ${reason}`);
        }
        this.cleanup();
      };

    } catch (err) {
      if (this.startEpoch !== epoch) return;
      console.error('[Gemini Voice] Failed to start voice session:', err);
      this.setStatus('error', err?.message || 'Microphone or connection failed');
      this.stop({ preserveStatus: true });
    }
  }

  async startPcmAudioCapture() {
    if (!this.stream) return;

    try {
      const AudioCtx = (typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : globalThis.AudioContext);
      if (!AudioCtx) return;

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx({ sampleRate: 16000 });
      }
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch(() => {});
      }

      this.audioSource = this.audioContext.createMediaStreamSource(this.stream);

      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      let pcmFrameCounter = 0;

      this.processor.onaudioprocess = (evt) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const float32Samples = evt.inputBuffer.getChannelData(0);

        // VAD RMS speech detection
        let sum = 0;
        for (let i = 0; i < float32Samples.length; i++) {
          sum += float32Samples[i] * float32Samples[i];
        }
        const rms = Math.sqrt(sum / float32Samples.length);
        if (rms > 0.02) {
          if (!this._isUserSpeaking) {
            this._isUserSpeaking = true;
            console.log('[GEMINI TRACE] USER_SPEECH_START');
          }
          this._lastSpeechTime = Date.now();
        } else if (this._isUserSpeaking && Date.now() - (this._lastSpeechTime || 0) > 1200) {
          this._isUserSpeaking = false;
          console.log('[GEMINI TRACE] USER_SPEECH_END');
        }

        const pcmBuffer = floatTo16BitPCM(float32Samples);
        const base64Pcm = arrayBufferToBase64(pcmBuffer);

        pcmFrameCounter++;
        if (pcmFrameCounter % 20 === 1) {
          console.log('[GEMINI TRACE] AUDIO_FRAME_SENT');
          console.log('[GEMINI DEBUG] Microphone PCM data flowing');
          console.log('[GEMINI DEBUG] Sending microphone audio');
        }

        const mediaFrame = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: 'audio/pcm;rate=16000',
                data: base64Pcm,
              },
            ],
          },
        };

        try {
          this.ws.send(JSON.stringify(mediaFrame));
        } catch (err) {
          console.warn('[Gemini Voice] Failed to send PCM chunk:', err);
        }
      };

      this.audioSource.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
      this.isStreaming = true;
    } catch (err) {
      console.error('[Gemini Voice] Failed to initialize PCM audio capture:', err);
    }
  }

  async handleGeminiMessage(rawText) {
    try {
      const msg = JSON.parse(rawText);

      if (msg.setupInfo) {
        this._serverModel = msg.setupInfo.model || null;
        this._serverVoice = msg.setupInfo.voice || null;
        console.log('[GEMINI] setupInfo received —', msg.setupInfo.model, '/', msg.setupInfo.voice);
        return;
      }

      console.log('[GEMINI TRACE] GEMINI_MESSAGE_RECEIVED');
      console.log('[GEMINI DEBUG] Gemini response received');

      if (msg.setupComplete) {
        console.log('[GEMINI DEBUG] Gemini setup complete');
      }

      // ── Interruption / VAD speech signals ───────────────────────────────────
      if (msg.serverContent?.interrupted) {
        console.log('[GEMINI TRACE] USER_SPEECH_START');
        console.log('[GEMINI TRACE] USER_SPEECH_END');
        console.log('[GEMINI] User interruption — stopping playback');
        this.stopPlayback();
        if (this.status === 'speaking' || this.status === 'executing') {
          this.setStatus('listening', 'GEMINI LIVE · AUDIO STREAMING (16kHz PCM)');
        }
      }

      // ── Model turn (text + audio) ─────────────────────────────────────────────
      if (msg.serverContent?.modelTurn?.parts) {
        console.log('[GEMINI TRACE] MODEL_CONTENT_RECEIVED');
        for (const part of msg.serverContent.modelTurn.parts) {
          if (part.text) {
            console.log('[GEMINI DEBUG] Gemini response text:', part.text);
            if (this.onTextResponse) this.onTextResponse(part.text);
          }
          if (part.inlineData) {
            const { mimeType, data } = part.inlineData;
            if (data && (mimeType?.includes('audio/pcm') || mimeType?.includes('audio/'))) {
              console.log('[GEMINI TRACE] MODEL_AUDIO_RECEIVED');
              console.log('[GEMINI DEBUG] Gemini audio received');
              this.playPcmChunk(data, mimeType);
            }
            if (this.onAudioResponse) this.onAudioResponse(part.inlineData);
          }
        }
      }

      // ── Tool / Function calls ────────────────────────────────────────────────
      const toolCalls = extractGeminiToolCalls(msg);
      if (toolCalls.length > 0) {
        for (const call of toolCalls) {
          console.log('[GEMINI DEBUG] Gemini tool call received:', call.name);
          console.log('[GEMINI] Tool call:', call.name, call.args);
          this.setStatus('executing', `Executing action: ${call.name}...`);

          let result;
          try {
            if (typeof this.runner === 'function') {
              result = await this.runner(call.name, call.args || {});
            } else {
              result = { ok: false, error: 'No GEV action runner registered' };
            }
          } catch (err) {
            console.error(`[GEMINI] Tool execution failed for ${call.name}:`, err);
            result = { ok: false, error: err?.message || String(err) };
          }

          console.log('[GEMINI] Tool result:', call.name, result?.ok);
          const responseMsg = formatGeminiToolResponse(call.id, call.name, result);

          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(responseMsg));
          }

          if (this.status === 'executing') {
            this.setStatus('listening', 'GEMINI LIVE · AUDIO STREAMING (16kHz PCM)');
          }
        }
      }

      // ── Turn complete ────────────────────────────────────────────────────────
      if (msg.serverContent?.turnComplete) {
        console.log('[GEMINI TRACE] TURN_COMPLETE');
        console.log('[GEMINI] Turn complete — staying connected and listening');
      }

      // ── Error from Gemini ─────────────────────────────────────────────────────
      if (msg.error) {
        console.error('[GEMINI DEBUG] Gemini response error:', msg.error);
        const errMsg = msg.error.message || (typeof msg.error === 'string' ? msg.error : String(msg.error));
        this.setStatus('error', errMsg);
      }
    } catch {
      /* binary frame or non-JSON payload — ignore silently */
    }
  }

  async playPcmChunk(base64Data, mimeType) {
    const sampleRate = parseSampleRateFromMimeType(mimeType, 24000);
    console.log('[GEMINI DEBUG] Audio decoding');
    const float32Samples = pcmInt16ToFloat32(base64Data);
    if (!float32Samples.length) return;

    if (!this.playbackAudioContext) {
      const AudioCtx = (typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : globalThis.AudioContext);
      if (!AudioCtx) return;
      this.playbackAudioContext = new AudioCtx({ sampleRate });
    }

    if (this.playbackAudioContext.state === 'suspended') {
      console.log('[GEMINI DEBUG] AudioContext is suspended — resuming');
      await this.playbackAudioContext.resume().catch(() => {});
    }

    const audioBuffer = this.playbackAudioContext.createBuffer(1, float32Samples.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32Samples);

    const source = this.playbackAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.playbackAudioContext.destination);

    const currentTime = this.playbackAudioContext.currentTime;
    if (this.nextPlaybackStartTime < currentTime) {
      this.nextPlaybackStartTime = currentTime;
    }

    console.log('[GEMINI TRACE] PLAYBACK_STARTED');
    console.log('[GEMINI DEBUG] Audio playback started');
    source.start(this.nextPlaybackStartTime);
    this.nextPlaybackStartTime += audioBuffer.duration;

    this.activeAudioSources.push(source);
    this.setStatus('speaking', 'GEMINI SPEAKING...');

    source.onended = () => {
      const idx = this.activeAudioSources.indexOf(source);
      if (idx !== -1) this.activeAudioSources.splice(idx, 1);

      if (this.activeAudioSources.length === 0 && this.status === 'speaking') {
        this.setStatus('listening', 'GEMINI LIVE · AUDIO STREAMING (16kHz PCM)');
      }
    };
  }

  stopPlayback() {
    for (const source of this.activeAudioSources) {
      try { source.stop(); } catch { /* best effort */ }
      try { source.disconnect(); } catch { /* best effort */ }
    }
    this.activeAudioSources = [];
    this.nextPlaybackStartTime = 0;

    if (this.playbackAudioContext) {
      try { this.playbackAudioContext.close(); } catch { /* best effort */ }
      this.playbackAudioContext = null;
    }
  }

  cleanup() {
    this.isStreaming = false;
    this.stopPlayback();

    if (this.processor) {
      try { this.processor.disconnect(); } catch { /* best effort */ }
      this.processor = null;
    }

    if (this.audioSource) {
      try { this.audioSource.disconnect(); } catch { /* best effort */ }
      this.audioSource = null;
    }

    if (this.audioContext) {
      try { this.audioContext.close(); } catch { /* best effort */ }
      this.audioContext = null;
    }

    if (this.stream) {
      try {
        this.stream.getTracks().forEach((track) => track.stop());
      } catch { /* best effort */ }
      this.stream = null;
    }

    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      try {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      } catch { /* best effort */ }
    }
  }

  stop(options = {}) {
    const { preserveStatus = false, removeUi = false } = options;
    this.startEpoch++;
    this.cleanup();
    if (removeUi && this.ui?.button && this.buttonHandler) {
      this.ui.button.removeEventListener('click', this.buttonHandler);
      this.buttonHandler = null;
    }
    if (!preserveStatus) {
      this.setStatus('idle', 'GEMINI LIVE STANDBY');
    }
  }
}

export function initGevGeminiVoiceCommands({
  viewer,
  styleManager,
  dataManager,
  sceneDirector = null,
  annotations = null,
  runner = null,
  ui = null,
} = {}) {
  const win = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (win && win.__gevGeminiVoiceController && typeof win.__gevGeminiVoiceController.stop === 'function') {
    win.__gevGeminiVoiceController.stop({ removeUi: true });
  }

  const actionRunner = runner || (viewer ? createGevActionRunner({
    viewer,
    styleManager,
    dataManager,
    sceneDirector,
    annotations,
  }) : null);

  const controller = new GevGeminiVoiceController({ runner: actionRunner, ui });
  if (win) {
    win.__gevGeminiVoiceController = controller;
  }
  return controller;
}
