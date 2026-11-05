import { z } from 'zod';

const timedText = z.object({
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
});

export const verse = z.object({
  verseNumber: z.number().int(),
  original: z.string(),
  translation: z.string(),
  transliteration: z.string(),
  transliterationSegments: z.array(timedText).optional(),
  translationSegments: z.array(timedText).optional(),
  meaning: z.string(),
  startTime: z.number(),
  endTime: z.number(),
});

export const songData = z.object({
  title: z.string(),
  originalLanguage: z.string(),
  summary: z.string(),
  detailedAnalysis: z.string(),
  verses: z.array(verse),
});

export type SongData = z.infer<typeof songData>;

const feedback = z.object({
  positive: z.array(z.string()),
  improvementAreas: z.array(z.string()),
});

const scores = {
  pronunciationAccuracyScore: z.number(),
  timingAlignmentScore: z.number(),
  vocalClarityScore: z.number(),
  feedback,
  userAttemptTranscription: z.string().optional(),
};

export const singingScore = z.object({
  overallScore: z.number(),
  ...scores,
  verseScores: z.array(z.object({ verseNumber: z.number().int(), ...scores })),
});

export type SingingScore = z.infer<typeof singingScore>;
