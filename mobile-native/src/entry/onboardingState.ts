export const ONBOARDING_KEY = 'lifeos.onboarding.completed.v1';
const COMPLETE = 'complete';

export interface OnboardingStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}

export async function readOnboarding(storage: OnboardingStorage): Promise<boolean> {
  return (await storage.getItem(ONBOARDING_KEY)) === COMPLETE;
}

export async function completeOnboarding(storage: OnboardingStorage): Promise<void> {
  await storage.setItem(ONBOARDING_KEY, COMPLETE);
}

export function previousPage(page: number): number {
  return Math.max(0, page - 1);
}

export function nextPage(page: number): number {
  return Math.min(3, page + 1);
}

export async function withDeadline<T>(operation: Promise<T>, milliseconds = 5000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Local storage timed out')), milliseconds); }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

