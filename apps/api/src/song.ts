import { z } from 'zod';

const timedText = z.object({
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
});

export const line = z.object({
  original: z.string(),
  translation: z.string(),
  transliteration: z.string(),
  startTime: z.number(),
  endTime: z.number(),
});

// New fields stay optional so analyses saved before them still parse.
export const verse = z.object({
  verseNumber: z.number().int(),
  original: z.string(),
  translation: z.string(),
  transliteration: z.string(),
  transliterationSegments: z.array(timedText).optional(),
  translationSegments: z.array(timedText).optional(),
  lines: z.array(line).optional(),
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

const score = () => z.number().min(0).max(100);

const scores = {
  pronunciationAccuracyScore: score(),
  timingAlignmentScore: score(),
  vocalClarityScore: score(),
  feedback,
  userAttemptTranscription: z.string().optional(),
};

export const singingScore = z.object({
  overallScore: score(),
  ...scores,
  verseScores: z.array(z.object({ verseNumber: z.number().int(), ...scores })),
});

export type SingingScore = z.infer<typeof singingScore>;
