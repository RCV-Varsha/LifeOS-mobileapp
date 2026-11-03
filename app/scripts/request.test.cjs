const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('typescript');
const source = ts.transpileModule(readFileSync(resolve(__dirname, '../src/services/request.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load(fetch) {
  const module = { exports: {} };
  // No AbortSignal static APIs are available in this simulated mobile runtime.
  new Function('exports', 'module', 'fetch', 'AbortSignal', source)(module.exports, module, fetch, undefined);
  return module.exports.request;
}
test('mobile request works without AbortSignal.timeout and preserves request options', async () => {
  const response = { ok: true };
  const request = load(async (url, init) => {
    assert.equal(url, '/tasks'); assert.equal(init.method, 'POST');
    assert.equal(init.body, 'payload'); assert.equal(init.signal.aborted, false);
    return response;
  });
  assert.equal(await request('/tasks', { method: 'POST', body: 'payload' }), response);
});
test('a stalled mobile request is aborted at its deadline', async () => {
  const request = load((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  await assert.rejects(request('/tasks', {}, 10), /aborted/);
});
test('caller cancellation is forwarded and pre-aborted signals stay aborted', async () => {
  const controller = new AbortController();
  const request = load(async (_url, init) => {
    controller.abort(); assert.equal(init.signal.aborted, true); return { ok: true };
  });
  await request('/tasks', { signal: controller.signal });
  await request('/tasks', { signal: controller.signal });
});
test('completed requests remove the caller abort listener', async () => {
  const controller = new AbortController(); let requestSignal;
  const request = load(async (_url, init) => { requestSignal = init.signal; return { ok: true }; });
  await request('/tasks', { signal: controller.signal });
  controller.abort(); assert.equal(requestSignal.aborted, false);
});
