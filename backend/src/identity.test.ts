import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { developmentAuthentication, rejectClientOwnership } from './auth.ts';

const userA = '00000000-0000-4000-8000-000000000001';

async function request(rows: { id: string; status: 'ACTIVE' | 'DISABLED' }[], body?: unknown) {
  const database = { query: async () => ({ rows }) };
  const app = express();
  app.use(express.json());
  app.use(rejectClientOwnership);
  app.use(developmentAuthentication(database as never, userA));
  app.post('/protected', (req, res) => res.json({ user: req.user }));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test address');
  try {
    return await fetch(`http://127.0.0.1:${address.port}/protected`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('current user resolves from server configuration', async () => {
  const response = await request([{ id: userA, status: 'ACTIVE' }]);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).user, { id: userA, status: 'ACTIVE' });
});

test('unknown development identity is rejected', async () => assert.equal((await request([])).status, 401));
test('disabled user is rejected', async () => assert.equal((await request([{ id: userA, status: 'DISABLED' }])).status, 403));
test('client cannot submit an owner identity', async () => assert.equal((await request([{ id: userA, status: 'ACTIVE' }], { ownerId: crypto.randomUUID() })).status, 400));
test('nested user identity is also rejected', async () => assert.equal((await request([{ id: userA, status: 'ACTIVE' }], { input: { user_id: crypto.randomUUID() } })).status, 400));
