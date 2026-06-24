// Shared helpers for working with download / preview URLs.
// (Kept tiny and platform-agnostic so it can be imported from anywhere.)

/**
 * Convert Google Drive share/view URLs to direct-streamable URLs.
 *  - https://drive.google.com/file/d/<ID>/view?usp=...
 *  - https://drive.google.com/open?id=<ID>
 *  - https://drive.google.com/uc?id=<ID>
 *  - https://docs.google.com/... with `id` query param
 *
 * Anything else is returned unchanged.
 */
export function resolveMediaUrl(input: string): string {
  if (!input) return input;
  const trimmed = input.trim();

  const m1 = trimmed.match(
    /https?:\/\/(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/,
  );
  if (m1?.[1]) {
    return `https://drive.google.com/uc?export=download&id=${m1[1]}`;
  }
  if (/https?:\/\/(?:drive|docs)\.google\.com\//.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const id = u.searchParams.get("id");
      if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
    } catch {
      /* not parseable */
    }
  }
  return trimmed;
}

/** True if the string is a plain http(s) URL. */
export function isHttpUrl(s: string): boolean {
  if (!s) return false;
  return /^https?:\/\//i.test(s.trim());
}
