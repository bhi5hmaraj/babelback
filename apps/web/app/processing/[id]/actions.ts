'use server';

import { authenticatedApi } from '../../../auth.ts';

export async function pollJob(id: string) {
  const response = await (await authenticatedApi()).v1.jobs[':id'].$get({ param: { id } });
  return response.json();
}
