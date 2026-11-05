import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uploadError } from './upload.ts';

test('upload rejects empty, non-audio and oversized files before sending bytes', () => {
  assert.ok(uploadError({ size: 0, type: 'audio/mpeg' }, 1));
  assert.ok(uploadError({ size: 100, type: 'text/plain' }, 1));
  assert.ok(uploadError({ size: 1024 * 1024 + 1, type: 'audio/mpeg' }, 1));
  assert.equal(uploadError({ size: 1024 * 1024, type: 'audio/mpeg' }, 1), null);
});
