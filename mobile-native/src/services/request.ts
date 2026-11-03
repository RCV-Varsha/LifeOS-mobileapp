// Use the basic AbortController API supported by React Native/Hermes.
// AbortSignal.timeout is available in Node but not on every Android runtime.
export async function request(input: string, init: RequestInit = {}, timeoutMs: number | null = 15000): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort);
  const timer = timeoutMs === null ? null : setTimeout(abort, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    if (timer !== null) clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}
