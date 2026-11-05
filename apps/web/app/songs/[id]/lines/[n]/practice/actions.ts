'use server';

import { authenticatedApi } from '../../../../../../auth.ts';
import { audioContentType } from '../../../../../add/upload.ts';

export async function startAttempt(input: { analysisId: string; line: number; contentType: string; bytes: number }) {
  const contentType = audioContentType(input.contentType);
  if (!contentType) return { error: 'This browser records in a format we cannot score yet.' };
  const response = await (await authenticatedApi()).v1['practice-attempts'].$post({ json: {
    analysisId: input.analysisId, firstVerse: input.line, lastVerse: input.line, contentType, bytes: input.bytes,
  } });
  return response.json();
}

export async function scoreAttempt(id: string) {
  const response = await (await authenticatedApi()).v1['practice-attempts'][':id'].score.$post({ param: { id } });
  return response.json();
}

export async function pollAttempt(id: string) {
  const response = await (await authenticatedApi()).v1['practice-attempts'][':id'].$get({ param: { id } });
  return response.json();
}
