/**
 * Network failures (no answer at all, as opposed to an HTTP error). The API
 * sleeps on Render's free plan and takes up to a minute to boot, and it is
 * briefly away during a deploy; a request in that window fails with the
 * browser's raw "Failed to fetch" (Chrome), "Load failed" (Safari/iPhone)
 * or "NetworkError when attempting to fetch resource." (Firefox). That text
 * reached the login screen right after a successful Clerk sign-in.
 */
export const NETWORK_ERROR_MESSAGE =
  'Nu ne-am putut conecta la server. Dacă aplicația n-a fost folosită de ceva vreme, serverul pornește în până la un minut — încearcă din nou.';

const NETWORK_TEXT = /failed to fetch|load failed|networkerror|network request failed|network connection was lost|the internet connection appears to be offline|signal is aborted|aborted/i;

export function isNetworkError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const { name, message, status } = error as { name?: string; message?: string; status?: number };
  if (status === 0) return true; // ApiError for "no answer"
  if (name === 'AbortError') return true; // our own request timeout
  return (name === 'TypeError' || name === 'Error') && NETWORK_TEXT.test(String(message ?? ''));
}

/**
 * Runs `fn`, retrying only network failures after each delay (and after
 * `beforeRetry`, e.g. waking the server). Anything else is thrown at once.
 */
export async function retryOnNetworkError<T>(
  fn: () => Promise<T>,
  {
    delaysMs = [1_500, 4_000, 8_000],
    beforeRetry,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  }: { delaysMs?: number[]; beforeRetry?: () => Promise<unknown>; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!isNetworkError(error) || attempt >= delaysMs.length) throw error;
      await sleep(delaysMs[attempt]);
      if (beforeRetry) await beforeRetry();
    }
  }
}
