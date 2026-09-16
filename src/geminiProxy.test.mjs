import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');

function extract(name) {
  const start = source.search(new RegExp(`(?:export )?(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `${name} must exist`);
  const end = source.indexOf('\n}', start);
  return source.slice(start, end + 2).replace(/^export /, '');
}

function fixture(envVars = {}) {
  const deps = {
    process: { env: { ...envVars } },
    readRequestBodyCapped: async (req) => req.body ? Buffer.from(JSON.stringify(req.body)) : Buffer.from(''),
  };
  const helpers = ['readRequestBodyCapped'].map(extract).join('\n');
  const plugin = new Function(...Object.keys(deps), `${helpers}\n${extract('geminiProxy')}\nreturn geminiProxy();`)(...Object.values(deps));
  let middleware;
  plugin.configureServer({ middlewares: { use(_route, handler) { middleware = handler; } } });
  return {
    async request(url = '/api/gemini', method = 'GET', body = null) {
      const response = {
        status: 200,
        headers: {},
        statusCode: 200,
        setHeader(k, v) { this.headers[k] = v; },
        end(data) { this.body = data; this.status = this.statusCode; },
      };
      await middleware({ url, method, body }, response);
      return response;
    },
  };
}

test('geminiProxy returns 500 when GEMINI_API_KEY is missing', async () => {
  const app = fixture({ GEMINI_API_KEY: '' });
  const res = await app.request('/api/gemini', 'GET');
  assert.equal(res.status, 500);
  const parsed = JSON.parse(res.body);
  assert.match(parsed.error, /GEMINI_API_KEY environment variable is not configured/);
});

test('geminiProxy rejects invalid HTTP methods with 405', async () => {
  const app = fixture({ GEMINI_API_KEY: 'test-key' });
  const res = await app.request('/api/gemini', 'DELETE');
  assert.equal(res.status, 405);
  const parsed = JSON.parse(res.body);
  assert.equal(parsed.error, 'Method Not Allowed');
});
