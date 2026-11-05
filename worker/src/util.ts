/**
 * Utility functions: RRF fusion, human-readable durations, etc.
 */

/**
 * Reciprocal Rank Fusion (RRF) combines two ranked lists (BM25 and vector results).
 * @param bm25Results - Array of {id, score} from BM25 search (lower scores are better)
 * @param vectorResults - Array of {id, score} from vector search (higher scores are better)
 * @param k - RRF constant (default 60)
 * @returns Fused ranking as {id, rrf_score}[] (higher scores better)
 */
export function rrf(
  bm25Results: Array<{id: string; score: number}>,
  vectorResults: Array<{id: string; score: number}>,
  k: number = 60
): Array<{id: string; score: number}> {
  const scores = new Map<string, number>();

  // BM25: lower is better, so invert rank
  bm25Results.forEach((result, index) => {
    const rrfScore = 1 / (k + index + 1);
    scores.set(result.id, (scores.get(result.id) ?? 0) + rrfScore);
  });

  // Vector: higher is better, use rank directly
  vectorResults.forEach((result, index) => {
    const rrfScore = 1 / (k + index + 1);
    scores.set(result.id, (scores.get(result.id) ?? 0) + rrfScore);
  });

  return Array.from(scores.entries())
    .map(([id, score]) => ({id, score}))
    .sort((a, b) => b.score - a.score);
}

/**
 * Format milliseconds as human-readable duration (e.g., "4m 12s").
 */
export function humanReadableDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * SHA-256 hash as lowercase hex string.
 */
export async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract page ID from URL (first 16 hex chars of sha256(normalised URL)).
 */
export async function pageIdFromUrl(url: string): Promise<string> {
  const hash = await sha256Hex(url);
  return hash.slice(0, 16);
}

/**
 * Normalize URL: lowercase host, drop hash, drop utm params, drop trailing /.
 */
export function normaliseUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Lowercase the hostname
    parsed.hostname = parsed.hostname.toLowerCase();

    // Drop fragment
    parsed.hash = '';

    // Remove common tracking and credential-like query params
    const params = new URLSearchParams(parsed.search);
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref_src',
      'token', 'access_token', 'auth', 'key', 'code', 'session', 'sid', 'password'
    ];
    trackingParams.forEach(p => params.delete(p));

    parsed.search = params.toString();

    // Drop trailing / except for root
    let pathname = parsed.pathname;
    if (pathname !== '/' && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname;

    return parsed.toString();
  } catch (e) {
    // If URL parsing fails, return as-is
    return url;
  }
}
