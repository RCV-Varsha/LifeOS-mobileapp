const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('typescript');
const source = ts.transpileModule(readFileSync(resolve(__dirname, '../src/services/apiFetch.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load(request, initial = { accessToken: 'old', refreshToken: 'refresh', user: { id: 'qa' } }) {
  let tokens = initial;
  const module = { exports: {} };
  const mocks = {
    '../config/api': { API_URL: 'http://local.test' },
    './authStorage': { readTokens: async () => tokens, saveTokens: async value => { tokens = value; } },
    './request': { request },
  };
  new Function('exports', 'module', 'require', source)(module.exports, module, name => mocks[name]);
  return { ...module.exports, tokens: () => tokens, setTokens: value => { tokens = value; } };
}
test('caller deadlines are preserved for slow goal generation', async () => {
  const signal = new AbortController().signal;
  const client = load(async (_url, init, timeout) => {
    assert.equal(init.signal, signal); assert.equal(timeout, null); return { status: 200 };
  });
  await client.apiFetch('http://local.test/goals/qa/plan', { method: 'POST', signal });
});

test('file analysis has time to finish without slowing ordinary requests',async()=>{
  const deadlines=[];
  const client=load(async(_url,_init,timeout)=>{deadlines.push(timeout);return{status:200};});
  await client.apiFetch('http://local.test/documents/file/analyze',{method:'POST'});
  await client.apiFetch('http://local.test/workspace/tasks');
  assert.deepEqual(deadlines,[110000,15000]);
});
test('concurrent expired requests share one token refresh and retry with renewed authorization', async () => {
  let refreshes = 0;
  const client = load(async (url, init) => {
    if (url.endsWith('/auth/refresh')) {
      refreshes++; await new Promise(resolve => setTimeout(resolve, 5));
      return { ok: true, json: async () => ({ accessToken: 'new', refreshToken: 'new-refresh', user: { id: 'qa' } }) };
    }
    return { status: init.headers.get('Authorization') === 'Bearer new' ? 200 : 401 };
  });
  const responses = await Promise.all([client.apiFetch('/tasks'), client.apiFetch('/projects')]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]); assert.equal(refreshes, 1);
});
test('a rejected refresh clears the expired local session', async () => {
  const client = load(async url => url.endsWith('/auth/refresh') ? { ok: false, status: 401 } : { status: 401 });
  await assert.rejects(client.apiFetch('/tasks'), /session expired/); assert.equal(client.tokens(), null);
});
test('a refresh arriving after sign-out cannot restore the session', async () => {
  const client = load(async url => {
    if (!url.endsWith('/auth/refresh')) return { status: 401 };
    client.setTokens(null);
    return { ok: true, json: async () => ({ accessToken: 'new', refreshToken: 'new-refresh' }) };
  });
  await assert.rejects(client.apiFetch('/tasks'), /session changed/); assert.equal(client.tokens(), null);
});
