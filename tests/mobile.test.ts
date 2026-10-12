import { describe, expect, it } from 'vitest';
import {
  androidAppId,
  apiBase,
  isMobileCallback,
  mobileCallback,
  mobileInvitation,
} from '../shared/mobile';
import { preflight, withCors } from '../worker/cors';

describe('Android links and API configuration', () => {
  const domain = 'example.auth0.com';
  const callback = mobileCallback(domain);
  it('accepts only the configured app callback host and exact path', () => {
    expect(isMobileCallback(`${callback}?code=abc&state=xyz`, domain)).toBe(true);
    expect(isMobileCallback(`${callback}/other?code=abc`, domain)).toBe(false);
    expect(isMobileCallback(mobileCallback('attacker.example'), domain)).toBe(false);
    expect(isMobileCallback(`https://${domain}/android/${androidAppId}/callback`, domain)).toBe(
      false,
    );
  });
  it('matches the official native SDK custom-domain callback', () => {
    expect(mobileCallback('auth.devbuildtool.com')).toBe(
      'com.waterline.household://auth.devbuildtool.com/android/com.waterline.household/callback',
    );
    expect(
      isMobileCallback(`${androidAppId}://${domain}/capacitor/${androidAppId}/callback`, domain),
    ).toBe(false);
  });
  it('validates native invitation tokens without treating unrelated links as invitations', () => {
    const token = 'a'.repeat(64);
    expect(mobileInvitation(`${androidAppId}://join?token=${token}`)).toBe(token);
    expect(mobileInvitation(`${androidAppId}://join?token=wrong`)).toBeNull();
    expect(mobileInvitation(`${androidAppId}://attacker?token=${token}`)).toBeNull();
    expect(mobileInvitation(`https://join?token=${token}`)).toBeNull();
  });
  it('requires a configured HTTPS cloud origin for native API requests', () => {
    expect(apiBase('', false)).toBe('');
    expect(() => apiBase('', true)).toThrow();
    expect(apiBase('https://waterline.example/', true)).toBe('https://waterline.example');
    for (const value of [
      'http://waterline.example',
      'https://waterline.example/path',
      'https://user:pass@waterline.example',
      'https://waterline.example?token=secret',
    ])
      expect(() => apiBase(value, true)).toThrow();
  });
});
describe('Android API CORS', () => {
  const options = (origin: string, method = 'POST', headers = 'Authorization,Content-Type') =>
    new Request('https://waterline.example/api/settings', {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': headers,
      },
    });
  it('allows the Android local origin without allowing wildcard credentials', () => {
    const response = preflight(options('https://localhost'));
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost');
    expect(response.headers.has('Access-Control-Allow-Credentials')).toBe(false);
  });
  it('rejects other origins, methods and headers', () => {
    expect(preflight(options('https://attacker.example')).status).toBe(403);
    expect(preflight(options('https://localhost', 'TRACE')).status).toBe(403);
    expect(preflight(options('https://localhost', 'POST', 'X-Unapproved')).status).toBe(403);
  });
  it('adds CORS to authenticated errors so Android can explain them', () => {
    const response = withCors(
      options('https://localhost'),
      Response.json({ error: 'Sign in' }, { status: 401 }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost');
  });
});
