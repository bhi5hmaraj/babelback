import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './db.ts';
import { settings } from './schema.ts';

const count = (label: string) => z.coerce.number().int().min(0).describe(label);

// The admin form renders one input per field, in this order, labelled by its description.
export const settingsForm = z.object({
  practiceScoreCredits: count('Credits to score a practice attempt'),
  analysisCredits: count('Credits to analyse an upload or add a language'),
  youtubeImportCredits: count('Credits to add a YouTube song'),
  signupGrantCredits: count('Credits granted on sign-up'),
  maxSongSeconds: count('Longest song accepted, in seconds'),
  maxUploadMb: count('Largest upload accepted, in MB'),
});

export type Settings = z.infer<typeof settingsForm>;

export async function getSettings(db: Pick<Db, 'select'>): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (!row) throw new Error('The settings row is missing. Run the migrations.');
  return row;
}

export async function saveSettings(db: Db, values: Settings) {
  await db
    .update(settings)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(settings.id, 1));
}
