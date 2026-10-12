import { beforeAll, describe, expect, it, vi } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
import { authenticate, issuerFor, verifiedEmail } from '../worker/auth';

const domain = 'household.example.auth0.com';
const audience = 'https://waterline.example/api';
let pair: Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async () => {
  pair = await generateKeyPair('RS256');
});
async function signed(overrides: Record<string, unknown> = {}) {
  return new SignJWT({
    sub: 'auth0|owner',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 120,
    iss: issuerFor(domain),
    aud: audience,
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .sign(pair.privateKey);
}
const request = (token: string) =>
  new Request('https://waterline.example/api/household', {
    headers: { authorization: `Bearer ${token}` },
  });
describe('Auth0 access token verification', () => {
  it('accepts a valid signed API token', async () => {
    const token = await signed();
    expect(
      await authenticate(request(token), domain, audience, async () => pair.publicKey),
    ).toEqual({ subject: 'auth0|owner', token });
  });
  it.each([
    ['wrong audience', { aud: 'another-api' }],
    ['wrong issuer', { iss: 'https://attacker.example/' }],
    ['expired token', { exp: 1 }],
    ['missing subject', { sub: undefined }],
    ['missing expiry', { exp: undefined }],
  ])('rejects %s', async (_, claims) => {
    await expect(
      authenticate(request(await signed(claims)), domain, audience, async () => pair.publicKey),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('rejects a forged signature', async () => {
    const other = await generateKeyPair('RS256');
    await expect(
      authenticate(request(await signed()), domain, audience, async () => other.publicKey),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('rejects tokens signed with another algorithm', async () => {
    const token = await new SignJWT({ sub: 'owner' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('a-secret-long-enough-for-testing-only'));
    await expect(
      authenticate(request(token), domain, audience, async () => pair.publicKey),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('fails closed when authentication is not configured', async () => {
    await expect(authenticate(request('anything'), '', '')).rejects.toMatchObject({ status: 503 });
    await expect(
      authenticate(new Request('https://waterline.example/api/household'), domain, audience),
    ).rejects.toMatchObject({ status: 401 });
  });
  it.each(['http://tenant.auth0.com', 'tenant.auth0.com/path', 'tenant..auth0.com', 'localhost'])(
    'rejects malformed issuer %s',
    (value) => {
      expect(() => issuerFor(value)).toThrow();
    },
  );
});
describe('invitation email verification', () => {
  it.each([
    { sub: 'auth0|owner', email: 'owner@example.com', email_verified: false },
    { sub: 'auth0|other', email: 'owner@example.com', email_verified: true },
  ])('rejects an unverified or mismatched profile', async (profile) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(profile)),
    );
    try {
      await expect(
        verifiedEmail({ subject: 'auth0|owner', token: 'access' }, domain),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
