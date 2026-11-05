'use server';

import { authenticatedApi } from '../../auth.ts';
import type { InferRequestType } from 'hono/client';
import type { api } from '../../api.ts';
import { audioContentType } from './upload.ts';

type AnalysisInput = InferRequestType<ReturnType<typeof api>['v1']['analyses']['$post']>['json'];

export async function createUpload(input: { title: string; contentType: string; bytes: number }) {
  const contentType = audioContentType(input.contentType);
  if (!contentType) return { error: 'This audio type is not supported.' };
  const response = await (await authenticatedApi()).v1.uploads.$post({ json: { ...input, contentType } });
  return response.json();
}

export async function completeUpload(id: string) {
  const response = await (await authenticatedApi()).v1.uploads[':id'].complete.$post({ param: { id } });
  return response.json();
}

export async function analyzeUpload(assetId: string, language: AnalysisInput['language'], idempotencyKey: string) {
  const response = await (await authenticatedApi()).v1.analyses.$post({ json: { assetId, language, karaoke: false, idempotencyKey } });
  return response.json();
}
