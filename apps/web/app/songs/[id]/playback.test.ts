import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentLine, lineLoopStart } from './playback.ts';

const verses = [{ startTime: 5, endTime: 10 }, { startTime: 14, endTime: 20 }];

test('current line follows seeking and holds during instrumental gaps', () => {
  assert.equal(currentLine(verses, 0), 0);
  assert.equal(currentLine(verses, 12), 0);
  assert.equal(currentLine(verses, 14), 1);
  assert.equal(currentLine(verses, 21), 1);
  assert.equal(currentLine(verses, 6), 0);
});

test('loop restarts at the selected line boundary, including skipped time updates', () => {
  assert.equal(lineLoopStart(verses[0], 9.9), null);
  assert.equal(lineLoopStart(verses[0], 10), 5);
  assert.equal(lineLoopStart(verses[0], 15), 5);
  assert.equal(lineLoopStart(undefined, 15), null);
  assert.equal(lineLoopStart({ startTime: 5, endTime: 5 }, 5), null);
});
