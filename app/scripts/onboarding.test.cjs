const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ONBOARDING_KEY, readOnboarding, completeOnboarding, nextPage, previousPage, withDeadline } = require('../src/entry/onboardingState.ts');

function store(initial = null) {
  const values = new Map(initial === null ? [] : [[ONBOARDING_KEY, initial]]);
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
  };
}

test('fresh installation shows onboarding without writing a preference', async () => {
  const storage = store();
  assert.equal(await readOnboarding(storage), false);
  assert.equal(storage.values.size, 0);
});
test('Get started and Skip persist completion across a new read', async () => {
  for (const action of ['Get started', 'Skip']) {
    const storage = store();
    await completeOnboarding(storage);
    assert.equal(await readOnboarding(storage), true, action);
    assert.equal(storage.values.size, 1);
  }
});
test('unknown or incomplete preferences do not bypass onboarding', async () => {
  for (const value of ['', 'false', 'started', 'true']) assert.equal(await readOnboarding(store(value)), false);
});
test('failed persistence rejects before the entry layer can navigate', async () => {
  const storage = store();
  storage.setItem = async () => { throw new Error('disk unavailable'); };
  await assert.rejects(completeOnboarding(storage), /disk unavailable/);
  assert.equal(await readOnboarding(storage), false);
});
test('storage failures remain distinguishable from first launch', async () => {
  await assert.rejects(readOnboarding({ getItem: async () => { throw Error('read failed'); } }), /read failed/);
});
test('Next and Back stay within all four pages', () => {
  let page = 0;
  for (const expected of [1, 2, 3, 3]) { page = nextPage(page); assert.equal(page, expected); }
  for (const expected of [2, 1, 0, 0]) { page = previousPage(page); assert.equal(page, expected); }
});
test('an unresponsive local store does not hold the splash indefinitely', async () => {
  await assert.rejects(withDeadline(new Promise(() => {}), 10), /timed out/);
  assert.equal(await withDeadline(Promise.resolve(true), 100), true);
});
