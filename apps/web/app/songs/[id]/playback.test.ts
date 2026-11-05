import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentLine, lineLoopStart, singLines, sungFraction } from './playback.ts';

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

test('timed lines replace their verse, and a verse without lines plays as one line', () => {
  const lyric = (text: string, startTime: number, endTime: number) =>
    ({ original: text, translation: text, transliteration: text, startTime, endTime });
  const lines = singLines([
    { ...lyric('a b', 0, 10), lines: [lyric('a', 0, 4), lyric('b', 5, 10)] },
    lyric('c', 12, 20),
  ]);

  assert.deepEqual(lines.map((line) => [line.original, line.verse, line.n, line.count]), [['a', 0, 0, 2], ['b', 0, 1, 2], ['c', 1, 0, 1]]);
  assert.equal(currentLine(lines, 4.5), 0);
  assert.equal(currentLine(lines, 6), 1);
});

test('the sung part of a line grows from its start to its end', () => {
  assert.equal(sungFraction({ startTime: 10, endTime: 20 }, 5), 0);
  assert.equal(sungFraction({ startTime: 10, endTime: 20 }, 15), 0.5);
  assert.equal(sungFraction({ startTime: 10, endTime: 20 }, 25), 1);
  assert.equal(sungFraction({ startTime: 10, endTime: 10 }, 10), 1);
});
