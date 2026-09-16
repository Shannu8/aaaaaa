import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GevGeminiVoiceController,
  GEMINI_LIVE_FUNCTION_DECLARATIONS,
  extractGeminiToolCalls,
  formatGeminiToolResponse,
  initGevGeminiVoiceCommands,
} from './geminiVoice.js';

test('GEMINI_LIVE_FUNCTION_DECLARATIONS contains all required GEV actions', () => {
  const names = GEMINI_LIVE_FUNCTION_DECLARATIONS.map((tool) => tool.name);
  assert.ok(names.includes('set_layer_visibility'));
  assert.ok(names.includes('fly_to_location'));
  assert.ok(names.includes('zoom_to_globe'));
  assert.ok(names.includes('adjust_camera_zoom'));
  assert.ok(names.includes('set_visual_style'));
  assert.ok(names.includes('set_panel_open'));
  assert.ok(names.includes('track_entity'));
  assert.ok(names.includes('stop_tracking'));
  assert.ok(names.includes('select_nearest_aircraft'));
  assert.ok(names.includes('set_context_mode'));
  assert.ok(names.includes('control_cockpit'));
  assert.ok(names.includes('control_cctv'));
  assert.ok(names.includes('control_radio'));

  const layerVisibilityTool = GEMINI_LIVE_FUNCTION_DECLARATIONS.find((t) => t.name === 'set_layer_visibility');
  assert.equal(layerVisibilityTool.parameters.type, 'OBJECT');
  assert.ok(layerVisibilityTool.parameters.properties.layerId);
  assert.ok(layerVisibilityTool.parameters.properties.enabled);
});

test('extractGeminiToolCalls parses tool calls from various Gemini Live payload formats', () => {
  // Format 1: toolCall.functionCalls array
  const msg1 = {
    toolCall: {
      functionCalls: [
        { id: 'call_1', name: 'set_layer_visibility', args: { layerId: 'local-icebergs', enabled: true } },
      ],
    },
  };
  const calls1 = extractGeminiToolCalls(msg1);
  assert.equal(calls1.length, 1);
  assert.equal(calls1[0].id, 'call_1');
  assert.equal(calls1[0].name, 'set_layer_visibility');
  assert.equal(calls1[0].args.layerId, 'local-icebergs');
  assert.equal(calls1[0].args.enabled, true);

  // Format 2: serverContent.modelTurn.parts with functionCall
  const msg2 = {
    serverContent: {
      modelTurn: {
        parts: [
          { functionCall: { id: 'call_2', name: 'fly_to_location', args: { query: 'Antarctica' } } },
        ],
      },
    },
  };
  const calls2 = extractGeminiToolCalls(msg2);
  assert.equal(calls2.length, 1);
  assert.equal(calls2[0].id, 'call_2');
  assert.equal(calls2[0].name, 'fly_to_location');
  assert.equal(calls2[0].args.query, 'Antarctica');

  // Format 3: Top-level functionCall
  const msg3 = {
    functionCall: { id: 'call_3', name: 'zoom_to_globe', args: {} },
  };
  const calls3 = extractGeminiToolCalls(msg3);
  assert.equal(calls3.length, 1);
  assert.equal(calls3[0].id, 'call_3');
  assert.equal(calls3[0].name, 'zoom_to_globe');

  // Format 4: Malformed / null / empty
  assert.deepEqual(extractGeminiToolCalls(null), []);
  assert.deepEqual(extractGeminiToolCalls({}), []);
  assert.deepEqual(extractGeminiToolCalls({ serverContent: {} }), []);
});

test('formatGeminiToolResponse returns proper Gemini Live toolResponse frame', () => {
  const result = { ok: true, action: 'set_layer_visibility', layerId: 'local-icebergs', enabled: true };
  const frame = formatGeminiToolResponse('call_123', 'set_layer_visibility', result);

  assert.ok(frame.toolResponse);
  assert.ok(Array.isArray(frame.toolResponse.functionResponses));
  assert.equal(frame.toolResponse.functionResponses.length, 1);
  assert.equal(frame.toolResponse.functionResponses[0].id, 'call_123');
  assert.deepEqual(frame.toolResponse.functionResponses[0].response.output, result);
});

test('GevGeminiVoiceController executes GEV action runner and returns tool response over WebSocket', async () => {
  const executedCalls = [];
  const mockRunner = async (name, args) => {
    executedCalls.push({ name, args });
    return { ok: true, action: name, ...args };
  };

  const sentMessages = [];
  const dummyUi = { root: { dataset: {} }, status: {}, detail: {} };
  const controller = new GevGeminiVoiceController({ runner: mockRunner, ui: dummyUi });

  controller.ws = {
    readyState: 1, // WebSocket.OPEN
    send: (msgText) => {
      sentMessages.push(JSON.parse(msgText));
    },
  };

  const incomingToolCallMsg = JSON.stringify({
    toolCall: {
      functionCalls: [
        { id: 'call_abc', name: 'set_layer_visibility', args: { layerId: 'icebergs', enabled: true } },
      ],
    },
  });

  await controller.handleGeminiMessage(incomingToolCallMsg);

  assert.equal(executedCalls.length, 1);
  assert.equal(executedCalls[0].name, 'set_layer_visibility');
  assert.equal(executedCalls[0].args.layerId, 'icebergs');

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].toolResponse.functionResponses[0].id, 'call_abc');
  assert.equal(sentMessages[0].toolResponse.functionResponses[0].response.output.ok, true);
  assert.equal(sentMessages[0].toolResponse.functionResponses[0].response.output.layerId, 'icebergs');
});

test('REGRESSION: starting Gemini Live does NOT immediately call stop and stays active', async () => {
  let stopCalled = false;

  const dummyUi = {
    root: { dataset: {} },
    status: { textContent: '' },
    detail: { textContent: '' },
    button: { addEventListener: () => {}, removeEventListener: () => {} },
  };

  const controller = new GevGeminiVoiceController({ ui: dummyUi });
  const originalStop = controller.stop.bind(controller);
  controller.stop = (opts) => {
    stopCalled = true;
    return originalStop(opts);
  };

  // Mock global navigator.mediaDevices.getUserMedia
  const originalGetUserMedia = globalThis.navigator?.mediaDevices?.getUserMedia;
  if (!globalThis.navigator) globalThis.navigator = {};
  globalThis.navigator.mediaDevices = {
    getUserMedia: async () => ({
      getTracks: () => [{ stop: () => {} }],
    }),
  };

  // Mock global WebSocket
  class MockWebSocket {
    constructor() {
      this.readyState = 0; // CONNECTING
      setTimeout(() => {
        this.readyState = 1; // OPEN
        if (this.onopen) this.onopen();
      }, 10);
    }
    send() {}
    close() {
      if (this.onclose) this.onclose({ code: 1000, reason: 'Normal' });
    }
  }
  const originalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = MockWebSocket;

  try {
    const startPromise = controller.start();
    assert.equal(controller.status, 'connecting');
    assert.equal(controller.isActive(), true);

    await startPromise;
    // Wait for onopen 50ms setupInfo timeout
    await new Promise((res) => setTimeout(res, 80));

    assert.equal(stopCalled, false);
    assert.equal(controller.status, 'listening');
    assert.equal(controller.isActive(), true);

    // Verify session ONLY stops on explicit call
    controller.stop();
    assert.equal(stopCalled, true);
    assert.equal(controller.status, 'idle');
    assert.equal(controller.isActive(), false);
  } finally {
    if (originalGetUserMedia) globalThis.navigator.mediaDevices.getUserMedia = originalGetUserMedia;
    if (originalWebSocket) globalThis.WebSocket = originalWebSocket;
  }
});

test('REGRESSION: normal Gemini turnComplete does NOT stop the Live session', async () => {
  const dummyUi = { root: { dataset: {} }, status: {}, detail: {} };
  const controller = new GevGeminiVoiceController({ ui: dummyUi });
  controller.setStatus('listening', 'GEMINI LIVE ACTIVE');

  let stopCalled = false;
  controller.stop = () => { stopCalled = true; };

  const turnCompleteMsg = JSON.stringify({
    serverContent: {
      modelTurn: { parts: [{ text: 'Response finished' }] },
      turnComplete: true,
    },
  });

  await controller.handleGeminiMessage(turnCompleteMsg);

  assert.equal(stopCalled, false);
  assert.equal(controller.status, 'listening');
  assert.equal(controller.isActive(), true);
});

test('REGRESSION: initGevGeminiVoiceCommands cleans up previous instances to prevent duplicate listeners', () => {
  let stopCalled = false;
  globalThis.window = globalThis;
  globalThis.__gevGeminiVoiceController = {
    stop: () => { stopCalled = true; },
  };

  const dummyUi = {
    root: { dataset: {} },
    status: { textContent: '' },
    detail: { textContent: '' },
    button: { addEventListener: () => {}, removeEventListener: () => {} },
  };

  const ctrl = initGevGeminiVoiceCommands({ ui: dummyUi });

  assert.equal(stopCalled, true);
  assert.equal(globalThis.__gevGeminiVoiceController, ctrl);
});

test('GevGeminiVoiceController handles malformed / unknown tool calls and runner errors gracefully', async () => {
  const mockFailingRunner = async (name) => {
    if (name === 'unknown_tool') {
      throw new Error('Unknown GEV action: unknown_tool');
    }
    throw new Error('Runner failure');
  };

  const sentMessages = [];
  const dummyUi = { root: { dataset: {} }, status: {}, detail: {} };
  const controller = new GevGeminiVoiceController({ runner: mockFailingRunner, ui: dummyUi });

  controller.ws = {
    readyState: 1,
    send: (msgText) => {
      sentMessages.push(JSON.parse(msgText));
    },
  };

  const unknownToolCallMsg = JSON.stringify({
    toolCall: {
      functionCalls: [
        { id: 'call_err', name: 'unknown_tool', args: {} },
      ],
    },
  });

  await controller.handleGeminiMessage(unknownToolCallMsg);

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].toolResponse.functionResponses[0].id, 'call_err');
  assert.equal(sentMessages[0].toolResponse.functionResponses[0].response.output.ok, false);
  assert.match(sentMessages[0].toolResponse.functionResponses[0].response.output.error, /Unknown GEV action/);
});

test('GevGeminiVoiceController initializes with idle status and updates status UI states', () => {
  const dummyUi = {
    root: { dataset: {} },
    status: { textContent: '' },
    detail: { textContent: '' },
    errorDetail: { textContent: '' },
  };

  const controller = new GevGeminiVoiceController({ ui: dummyUi });
  assert.equal(controller.status, 'idle');
  assert.equal(dummyUi.status.textContent, 'OFF');

  controller.setStatus('connecting', 'Connecting...');
  assert.equal(controller.status, 'connecting');
  assert.equal(dummyUi.status.textContent, 'CONNECTING');

  controller.setStatus('listening', 'GEMINI LIVE ACTIVE');
  assert.equal(controller.status, 'listening');
  assert.equal(dummyUi.status.textContent, 'GEMINI LIVE');

  controller.setStatus('speaking', 'GEMINI SPEAKING...');
  assert.equal(controller.status, 'speaking');
  assert.equal(dummyUi.status.textContent, 'SPEAKING');

  controller.setStatus('executing', 'EXECUTING ACTION...');
  assert.equal(controller.status, 'executing');
  assert.equal(dummyUi.status.textContent, 'EXECUTING');

  controller.setStatus('disconnected', 'Session disconnected');
  assert.equal(controller.status, 'disconnected');
  assert.equal(dummyUi.status.textContent, 'DISCONNECTED');
});

test('GevGeminiVoiceController processes text and inline audio messages', async () => {
  let receivedText = '';
  let receivedAudio = null;

  const controller = new GevGeminiVoiceController({
    ui: { root: { dataset: {} }, status: {}, detail: {} },
    onTextResponse: (txt) => { receivedText += txt; },
    onAudioResponse: (audio) => { receivedAudio = audio; },
  });

  const sampleResponse = JSON.stringify({
    serverContent: {
      modelTurn: {
        parts: [
          { text: 'Hello from Gemini!' },
          { inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAAA' } },
        ],
      },
      turnComplete: true,
    },
  });

  await controller.handleGeminiMessage(sampleResponse);
  assert.equal(receivedText, 'Hello from Gemini!');
  assert.ok(receivedAudio);
  assert.equal(receivedAudio.mimeType, 'audio/pcm;rate=24000');
});

test('GevGeminiVoiceController handles cleanup safely', () => {
  const dummyUi = {
    root: { dataset: {} },
    status: { textContent: '' },
    detail: { textContent: '' },
  };

  const controller = new GevGeminiVoiceController({ ui: dummyUi });
  controller.cleanup();
  assert.equal(controller.isStreaming, false);
  assert.equal(controller.ws, null);
  assert.equal(controller.stream, null);
  assert.equal(controller.activeAudioSources.length, 0);
});

test('REGRESSION: connection remains active after setupComplete message is received', async () => {
  const dummyUi = { root: { dataset: {} }, status: {}, detail: {} };
  const controller = new GevGeminiVoiceController({ ui: dummyUi });
  controller.setStatus('listening', 'GEMINI LIVE ACTIVE');

  let stopCalled = false;
  controller.stop = () => { stopCalled = true; };

  const setupCompleteMsg = JSON.stringify({ setupComplete: {} });
  await controller.handleGeminiMessage(setupCompleteMsg);

  assert.equal(stopCalled, false);
  assert.equal(controller.status, 'listening');
  assert.equal(controller.isActive(), true);
});

test('REGRESSION: explicit stop disconnects WebSocket and releases microphone media tracks', () => {
  let tracksStopped = false;
  const mockTrack = {
    stop: () => { tracksStopped = true; },
  };
  let wsClosed = false;
  const mockWs = {
    readyState: 1, // OPEN
    close: () => { wsClosed = true; },
  };

  const dummyUi = { root: { dataset: {} }, status: {}, detail: {} };
  const controller = new GevGeminiVoiceController({ ui: dummyUi });
  controller.stream = { getTracks: () => [mockTrack] };
  controller.ws = mockWs;
  controller.setStatus('listening', 'GEMINI LIVE');

  controller.stop();

  assert.equal(tracksStopped, true, 'microphone tracks must be stopped');
  assert.equal(wsClosed, true, 'WebSocket must be closed');
  assert.equal(controller.status, 'idle');
  assert.equal(controller.isActive(), false);
});
