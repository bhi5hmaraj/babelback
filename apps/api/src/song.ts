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
