import { friendlyError, supabase } from './supabase';

let inflight: Promise<string> | null = null;

/**
 * Creates (or returns) the private sample company for the signed-in anonymous
 * user. Safe to call more than once at a time: callers share one request.
 */
export function ensureDemoWorkspace(): Promise<string> {
  if (!inflight) {
    inflight = (async () => {
      const { data, error } = await supabase.rpc('create_demo_workspace');
      if (error) throw new Error(friendlyError(error.message));
      return data as string;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Signs in anonymously and builds the demo workspace. Call refresh() afterwards. */
export async function startDemo(): Promise<void> {
  const { error } = await supabase.auth.signInAnonymously({ options: { data: { demo: true } } });
  if (error) {
    if (/anonymous/i.test(error.message)) throw new Error('The demo workspace is not available right now. Please try again later.');
    throw new Error(error.message);
  }
  await ensureDemoWorkspace();
}

export const DEMO_TITLE = 'Fleet preview · Temporary demo access';
