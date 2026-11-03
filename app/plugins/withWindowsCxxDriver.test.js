const { test } = require('node:test');
const assert = require('node:assert/strict');
const { patchGradle } = require('./withWindowsCxxDriver');
const source = `buildscript { repositories { google() } }
apply plugin: "expo-root-project"
apply plugin: "com.facebook.react.rootproject"
`;

test('registers the flag before root plugins can evaluate the app', () => {
  const result = patchGradle(source);
  assert.ok(result.indexOf('finalizeDsl') < result.indexOf('apply plugin: "expo-root-project"'));
  assert.ok(result.indexOf('finalizeDsl') < result.indexOf('apply plugin: "com.facebook.react.rootproject"'));
  assert.ok(result.includes("['com.android.application', 'com.android.library']"));
});

test('repeated generation does not duplicate or relocate the hook', () => {
  const result = patchGradle(source);
  assert.equal(patchGradle(result), result);
  assert.equal(patchGradle(result.replace(/\n/g, '\r\n')), result);
});

test('migrates the previously appended hook before root plugins', () => {
  const result = patchGradle(source);
  const start = result.indexOf('// LifeOS:');
  const end = result.indexOf('apply plugin: "expo-root-project"');
  const oldLayout = source + '\n' + result.slice(start, end);
  assert.equal(patchGradle(oldLayout), result);
});

test('fails visibly when the expected root plugins are missing', () => {
  assert.throws(() => patchGradle('buildscript {}'), /Could not locate/);
});
