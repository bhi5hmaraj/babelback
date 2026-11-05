import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readAppearance } from './theme.ts';

function values(theme: string, accent: string) {
  return { get: (name: string) => ({ value: name === 'theme' ? theme : accent }) };
}

test('appearance keeps an account colour and rejects CSS in cookie values', () => {
  assert.deepEqual(readAppearance(values('day', '#bada55')), { theme: 'day', accent: '#bada55' });
  assert.deepEqual(readAppearance(values('__proto__', 'red;display:none')), { theme: 'night', accent: undefined });
});
