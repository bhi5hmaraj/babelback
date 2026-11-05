'use server';

import { revalidatePath } from 'next/cache';
import { authenticatedApi } from '../../auth.ts';

export async function deleteEntry(form: FormData) {
  const id = form.get('id');
  if (typeof id !== 'string') throw new Error('Choose a song to remove.');
  const response = await (await authenticatedApi()).v1.library[':id'].$delete({ param: { id } });
  if (!response.ok) throw new Error('Could not remove this song. Please try again.');
  revalidatePath('/library');
}
