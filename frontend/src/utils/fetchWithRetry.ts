// Resilient fetch helper.
//
// Why this exists: the Emergent preview backend lives in a Kubernetes pod
// that gets restarted by the platform (idle eviction / quota cycling).
// During the ~30–90s cold-start, GET /api/templates returns network
// errors or 502/503 from the ingress. Without any retry, the home screen
// renders a broken state until the next poll (8 s) — which is what the
// user kept hitting.
//
// This wrapper retries idempotent GETs with capped exponential backoff,
// so the app silently rides through the cold-start window instead.

type FetchInit = RequestInit & { timeoutMs?: number };

interface RetryOptions {
  /** Total attempts including the first. Default 4 (≈ 9 s of retry). */
  retries?: number;
  /** Initial back-off in ms. Default 600. */
  baseDelayMs?: number;
  /** Cap on the back-off in ms. Default 4000. */
  maxDelayMs?: number;
  /** Per-attempt timeout in ms. Default 12_000. */
  timeoutMs?: number;
}

function shouldRetry(status: number | null): boolean {
  // Retry network failures (status === null) and the transient 5xx /
  // 408 / 429 family. 4xx (except 408/429) are deterministic and not
  // worth retrying.
  if (status === null) return true;
  if (status === 408 || status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** GET-style fetch with retry + per-attempt timeout. Safe to use only for
 *  idempotent requests (we do NOT retry POST/PATCH/DELETE here). */
export async function fetchWithRetry(
  url: string,
  init: FetchInit = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? 4;
  const base = opts.baseDelayMs ?? 600;
  const cap = opts.maxDelayMs ?? 4000;
  const timeoutMs = init.timeoutMs ?? opts.timeoutMs ?? 12_000;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      if (!shouldRetry(res.status) || attempt === retries - 1) {
        return res; // non-retryable or final attempt
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      clearTimeout(timer);
      lastError = e;
      if (!shouldRetry(null) || attempt === retries - 1) throw e;
    }
    // Exponential backoff with small jitter to avoid thundering herd.
    const delay = Math.min(cap, base * 2 ** attempt) + Math.random() * 200;
    await sleep(delay);
  }
  // Should be unreachable, but TS needs a return path.
  throw lastError ?? new Error("fetchWithRetry exhausted");
}
