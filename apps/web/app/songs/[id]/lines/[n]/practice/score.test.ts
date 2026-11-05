import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreSummary } from './score.ts';

const scores = (value: number, tip: string) => ({
  pronunciationAccuracyScore: value, timingAlignmentScore: value, vocalClarityScore: value,
  feedback: { positive: ['Nice'], improvementAreas: [tip] },
});
const score = { overallScore: 78.4, ...scores(50, 'Overall tip'), verseScores: [{ verseNumber: 3, ...scores(90.6, 'Verse tip'), userAttemptTranscription: 'what I sang' }] };

test('the summary shows the practised verse and compares with the best so far', () => {
  const summary = scoreSummary(score, 3, 85);
  assert.equal(summary.overall, 78);
  assert.equal(summary.label, 'Getting there');
  assert.equal(summary.note, 'Your best on this verse is 85');
  assert.deepEqual(summary.bars.map((bar) => bar.value), [91, 91, 91]);
  assert.equal(summary.tip, 'Verse tip');
  assert.equal(summary.heard, 'what I sang');
  assert.equal(scoreSummary(score, 4, null).tip, 'Overall tip');
});
