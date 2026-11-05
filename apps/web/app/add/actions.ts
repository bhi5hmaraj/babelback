'use server';

import { authenticatedApi } from '../../auth.ts';

export async function createUpload(input: { title: string; contentType: string; bytes: number }) {
  const response = await (await authenticatedApi()).v1.uploads.$post({ json: input });
  return response.json();
}

export async function completeUpload(id: string) {
  const response = await (await authenticatedApi()).v1.uploads[':id'].complete.$post({ param: { id } });
  return response.json();
}

export async function analyzeUpload(assetId: string, language: string, idempotencyKey: string) {
  const response = await (await authenticatedApi()).v1.analyses.$post({ json: { assetId, language, idempotencyKey } });
  return response.json();
}
