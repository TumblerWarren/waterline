import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export interface Identity {
  subject: string;
  token: string;
}
export function issuerFor(domain: string): string {
  if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) || domain.includes('..'))
    throw new HttpError(503, 'Sign-in is not configured.');
  return `https://${domain}/`;
}
export async function authenticate(
  request: Request,
  domain: string,
  audience: string,
  key?: JWTVerifyGetKey,
): Promise<Identity> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 12_000)
    throw new HttpError(401, 'Please sign in.');
  if (!audience) throw new HttpError(503, 'Sign-in is not configured.');
  const issuer = issuerFor(domain);
  const token = authorization.slice(7);
  try {
    const { payload } = await jwtVerify(
      token,
      key ?? createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`)),
      {
        issuer,
        audience,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'iat'],
      },
    );
    if (!payload.sub) throw new Error('Missing subject');
    return { subject: payload.sub, token };
  } catch {
    throw new HttpError(401, 'Your session is invalid or has expired. Please sign in again.');
  }
}
export async function verifiedEmail(identity: Identity, domain: string): Promise<string> {
  const response = await fetch(`${issuerFor(domain)}userinfo`, {
    headers: { Authorization: `Bearer ${identity.token}` },
  });
  if (!response.ok) throw new HttpError(403, 'Verify your email before joining a household.');
  const profile = await response.json<{ sub?: string; email?: string; email_verified?: boolean }>();
  if (
    profile.sub !== identity.subject ||
    profile.email_verified !== true ||
    typeof profile.email !== 'string'
  ) {
    throw new HttpError(403, 'Verify your email before joining a household.');
  }
  return profile.email.toLowerCase();
}
