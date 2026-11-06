/**
 * Bearer token authentication with SHA-256 hashing and timing-safe comparison.
 */

/**
 * Hash a secret value with SHA-256.
 */
export async function hashSecret(secret: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return await crypto.subtle.digest('SHA-256', encoder.encode(secret));
}

/**
 * Timing-safe comparison of two hashes.
 * Both hashes must be the same length (they should be, post-SHA-256).
 */
export async function timingSafeCompare(expected: ArrayBuffer, actual: ArrayBuffer): Promise<boolean> {
  // Both should be 32 bytes (SHA-256), but verify
  if (expected.byteLength !== actual.byteLength) {
    return false;
  }

  const expectedView = new Uint8Array(expected);
  const actualView = new Uint8Array(actual);

  let result = 0;
  for (let i = 0; i < expectedView.length; i++) {
    result |= expectedView[i] ^ actualView[i];
  }

  return result === 0;
}

/**
 * Verify a Bearer token against the stored secret.
 * Extracts the token from "Bearer <token>" format, hashes it, and compares with secret hash.
 */
export async function verifyBearer(authHeader: string | null, ghostSecret: string | undefined): Promise<boolean> {
  if (!authHeader || !ghostSecret) {
    return false;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return false;
  }

  const token = match[1];

  try {
    const expectedHash = await hashSecret(ghostSecret);
    const actualHash = await hashSecret(token);
    return await timingSafeCompare(expectedHash, actualHash);
  } catch (e) {
    return false;
  }
}

/**
 * Extract Bearer token from Authorization header.
 */
export function extractBearer(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Generate an origin-bound proof using HMAC-SHA256.
 * Used to verify the Worker knows the secret without sending the secret first.
 */
export async function verifyProof(secret: string, origin: string, nonce: string): Promise<string> {
  const encoder = new TextEncoder();
  const message = `ghost-verify:${origin}:${nonce}`;
  
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  
  // Convert to lowercase hex
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
