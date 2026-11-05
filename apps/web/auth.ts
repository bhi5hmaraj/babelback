import { auth } from '@clerk/nextjs/server';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { api } from './api.ts';

export function clerkEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

export const sessionToken = cache(async () => {
  if (!clerkEnabled()) return null;
  return (await auth()).getToken();
});

export async function authenticatedApi() {
  const token = await sessionToken();
  if (!token) redirect('/sign-in');
  return api(token);
}

export const account = cache(async () => {
  const token = await sessionToken();
  if (!token) return null;
  const response = await api(token).v1.me.$get();
  if (!response.ok) throw new Error('Could not load your account. Please try again.');
  return (await response.json()).user;
});
