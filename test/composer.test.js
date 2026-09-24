import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCubicBezier, normalizeCaptions } from '../src/composer.js';

test('evaluateCubicBezier: validates easing curve boundary points and inflection', () => {
  assert.equal(evaluateCubicBezier(0), 0);
  assert.equal(evaluateCubicBezier(1), 1);
  const mid = evaluateCubicBezier(0.5);
  assert.ok(mid > 0 && mid < 1, `mid should be between 0 and 1, got ${mid}`);
});

test('normalizeCaptions: normalizes seconds and milliseconds formats accurately', () => {
  const input = [
    { startSec: 0, endSec: 3, text: 'Prueba en segundos', animation: 'pop' },
    { startMs: 3000, endMs: 6500, text: 'Prueba en milisegundos', animation: 'slide_up' },
  ];

  const normalized = normalizeCaptions(input);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].startSec, 0);
  assert.equal(normalized[0].endSec, 3);
  assert.equal(normalized[0].text, 'Prueba en segundos');
  assert.equal(normalized[0].animation, 'pop');

  assert.equal(normalized[1].startSec, 3.0);
  assert.equal(normalized[1].endSec, 6.5);
  assert.equal(normalized[1].text, 'Prueba en milisegundos');
  assert.equal(normalized[1].animation, 'slide_up');
});
