import type { pollAttempt } from './actions.ts';

type Attempt = Extract<Awaited<ReturnType<typeof pollAttempt>>, { attempt: unknown }>['attempt'];
export type Score = NonNullable<Attempt['score']>;

// The verse's own scores when the model returned them, the overall ones otherwise.
export function scoreSummary(score: Score, verseNumber: number, best: number | null) {
  const forVerse = score.verseScores.find((verse) => verse.verseNumber === verseNumber) ?? score;
  const overall = Math.round(score.overallScore);
  return {
    overall,
    label: overall >= 80 ? 'Close to the singer' : overall >= 60 ? 'Getting there' : 'Keep at it',
    note: best === null || overall >= best ? 'Your best on this verse so far' : `Your best on this verse is ${Math.round(best)}`,
    bars: [
      { label: 'Pronunciation', value: Math.round(forVerse.pronunciationAccuracyScore) },
      { label: 'Timing', value: Math.round(forVerse.timingAlignmentScore) },
      { label: 'Clarity', value: Math.round(forVerse.vocalClarityScore) },
    ],
    tip: forVerse.feedback.improvementAreas[0] ?? forVerse.feedback.positive[0] ?? score.feedback.improvementAreas[0] ?? '',
    heard: forVerse.userAttemptTranscription ?? score.userAttemptTranscription ?? '',
  };
}
