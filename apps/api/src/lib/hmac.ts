import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify HMAC-SHA256 signature on an incoming webhook payload.
 * Signature format: "sha256=<hex>"
 * Signed message: raw body only (matches platform dispatcher's signPayload)
 * Timestamp is validated separately for replay protection.
 */
export function verifyHmac(
  body: Buffer,
  signature: string,
  timestamp: string,
  secret: string,
): boolean {
  if (!signature.startsWith('sha256=')) return false;

  // Validate timestamp is within 5 minutes (replay protection)
  const timestampDate = new Date(timestamp);
  const now = new Date();
  const diffMs = Math.abs(now.getTime() - timestampDate.getTime());
  if (diffMs > 5 * 60 * 1000) return false;

  // HMAC is computed over raw body only (matches platform dispatcher)
  const expectedSig = createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  const actualSig = signature.slice(7); // strip "sha256=" prefix

  if (expectedSig.length !== actualSig.length) return false;

  return timingSafeEqual(Buffer.from(expectedSig), Buffer.from(actualSig));
}

/**
 * Verify a platform-issued JWT (HMAC-SHA256 signed, no external library).
 * Returns the decoded payload if valid, null otherwise.
 */
export interface PlatformJwtPayload {
  sub: string;
  email: string;
  org_id: string;
  org_name: string;
  product_id: string;
  iss: string;
  exp: number;
  iat: number;
}

export function verifyPlatformJwt(
  token: string,
  secret: string,
): PlatformJwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;

  let expectedSig: Buffer;
  try {
    expectedSig = createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest();
  } catch {
    return null;
  }

  let actualSig: Buffer;
  try {
    actualSig = Buffer.from(sigB64, 'base64url');
  } catch {
    return null;
  }

  if (actualSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(expectedSig, actualSig)) return null;

  let payload: PlatformJwtPayload;
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8'),
    );
  } catch {
    return null;
  }

  // Validate expiry
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;

  // Validate issuer
  if (payload.iss !== 'onebastion-platform') return null;

  // Validate required fields
  if (
    !payload.sub ||
    !payload.email ||
    !payload.org_id ||
    !payload.org_name ||
    !payload.product_id
  ) {
    return null;
  }

  return payload;
}
