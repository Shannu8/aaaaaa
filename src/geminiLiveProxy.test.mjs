import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createGeminiLiveGateway } from './geminiLiveProxy.mjs';

class MockWebSocket extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 1; // OPEN
    this.sentMessages = [];
    this.closedCode = null;
    this.closedReason = null;
  }

  send(data, options) {
    this.sentMessages.push({ data, options });
  }

  close(code, reason) {
    this.closedCode = code;
    this.closedReason = reason;
    this.readyState = 3; // CLOSED
    this.emit('close', code, reason);
  }
}

test('Gemini Live Gateway refuses connection when GEMINI_API_KEY is missing', () => {
  const logs = [];
  const gateway = createGeminiLiveGateway({
    apiKeyResolver: () => '',
    warn: (...args) => logs.push(args.join(' ')),
  });

  const clientWs = new MockWebSocket('ws://localhost/api/gemini/live');
  gateway.wss.emit('connection', clientWs, {});

  assert.equal(clientWs.sentMessages.length, 1);
  const parsed = JSON.parse(clientWs.sentMessages[0].data);
  assert.match(parsed.error, /GEMINI_API_KEY environment variable is not set/);
  assert.equal(clientWs.closedCode, 4001);
  assert.ok(logs.some((l) => l.includes('Connection refused')));
});

test('Gemini Live Gateway connects to upstream and relays messages', () => {
  let createdUpstream = null;
  class DummyUpstreamWs extends MockWebSocket {
    constructor(url) {
      super(url);
      createdUpstream = this;
    }
  }

  const gateway = createGeminiLiveGateway({
    apiKeyResolver: () => 'test-gemini-key-12345',
    upstreamWebSocketCtor: DummyUpstreamWs,
  });

  const clientWs = new MockWebSocket('ws://localhost/api/gemini/live');
  gateway.wss.emit('connection', clientWs, {});

  assert.ok(createdUpstream);
  assert.match(createdUpstream.url, /generativelanguage\.googleapis\.com/);
  assert.match(createdUpstream.url, /key=test-gemini-key-12345/);

  // The gateway sends a setupInfo message immediately on connection (non-secret config).
  assert.equal(clientWs.sentMessages.length, 1, 'setupInfo must be sent immediately on connect');
  const setupInfo = JSON.parse(clientWs.sentMessages[0].data);
  assert.ok(setupInfo.setupInfo, 'first message must be a setupInfo object');
  assert.ok(setupInfo.setupInfo.model, 'setupInfo must include a model field');
  assert.ok(setupInfo.setupInfo.voice, 'setupInfo must include a voice field');

  // Send message from client -> upstream (buffered, upstream is not yet OPEN in mock)
  // In the mock, upstream is immediately OPEN (readyState=1), so it passes directly.
  clientWs.emit('message', Buffer.from('hello gemini'), false);
  assert.equal(createdUpstream.sentMessages.length, 1);
  assert.equal(createdUpstream.sentMessages[0].data.toString(), 'hello gemini');

  // Send message from upstream -> client
  createdUpstream.emit('message', Buffer.from('hello client'), false);
  assert.equal(clientWs.sentMessages.length, 2, 'client must have received setupInfo + relayed message');
  assert.equal(clientWs.sentMessages[1].data.toString(), 'hello client');

  // Client closes -> upstream closes
  clientWs.emit('close', 1000, 'done');
  assert.equal(createdUpstream.readyState, 3);
});
