import type { useClerk } from '@clerk/react';
import { getClientEnv } from './env';

type ClerkInstance = ReturnType<typeof useClerk>;

export const CLERK_PUBLISHABLE_KEY =
  getClientEnv('VITE_CLERK_PUBLISHABLE_KEY') || getClientEnv('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing required environment variable: VITE_CLERK_PUBLISHABLE_KEY');
}

// Registered once by AuthContext's AuthBridge (the only place inside the
// <ClerkProvider> tree that calls useClerk()), so plain service modules
// (authApi, profileApi, ErrorBoundary) can drive sign-in/sign-up/sign-out
// imperatively without needing to be React components themselves.
let clerkInstance: ClerkInstance | null = null;

export function setClerkInstance(instance: ClerkInstance | null) {
  clerkInstance = instance;
}

export async function getClerk(): Promise<ClerkInstance> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (clerkInstance) {
      return clerkInstance;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Clerk is not ready yet. Please try again in a moment.');
}
