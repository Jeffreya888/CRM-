/** True for "no connection" failures, which are retried later; anything else is a real error. */
export function isOfflineError(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e ?? '');
  return /network request failed|failed to fetch|load failed|networkerror|internet connection|timed? ?out|fetch failed|ENOTFOUND|ECONNREFUSED/i.test(msg)
    || ((e as any)?.name === 'TypeError' && /fetch/i.test(msg));
}
