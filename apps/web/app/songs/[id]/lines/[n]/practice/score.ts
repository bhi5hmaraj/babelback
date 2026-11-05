import type { pollAttempt } from './actions.ts';

type Attempt = Extract<Awaited<ReturnType<typeof pollAttempt>>, { attempt: unknown }>['attempt'];
export type Score = NonNullable<Attempt['score']>;

// The line's own scores when the model returned them, the overall ones otherwise.
export function scoreSummary(score: Score, line: number, best: number | null) {
  const forLine = score.verseScores.find((verse) => verse.verseNumber === line) ?? score;
  const overall = Math.round(score.overallScore);
  return {
    overall,
    label: overall >= 80 ? 'Close to the singer' : overall >= 60 ? 'Getting there' : 'Keep at it',
    note: best === null || overall >= best ? 'Your best on this line so far' : `Your best on this line is ${Math.round(best)}`,
    bars: [
      { label: 'Pronunciation', value: Math.round(forLine.pronunciationAccuracyScore) },
      { label: 'Timing', value: Math.round(forLine.timingAlignmentScore) },
      { label: 'Clarity', value: Math.round(forLine.vocalClarityScore) },
    ],
    tip: forLine.feedback.improvementAreas[0] ?? forLine.feedback.positive[0] ?? score.feedback.improvementAreas[0] ?? '',
  };
}
