import assert from 'node:assert/strict';

const origin = process.argv[2];
if (!origin || new URL(origin).protocol !== 'https:')
  throw new Error('Provide the deployed HTTPS backend origin.');
const check = async (path, options, status) => {
  const result = await fetch(new URL(path, origin), options);
  assert.equal(result.status, status, path);
  return result;
};
const health = await check('/api/health', {}, 200);
assert.equal((await health.json()).service, 'waterline');
assert.equal(health.headers.get('cache-control'), 'no-store');
await check('/', {}, 404);
await check('/api/household', {}, 401);
await check('/api/household', { headers: { Authorization: 'Bearer invalid-test-token' } }, 401);
const preflight = await check(
  '/api/settings',
  {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://localhost',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Authorization,Content-Type',
    },
  },
  204,
);
assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://localhost');
assert.equal(preflight.headers.has('access-control-allow-credentials'), false);
await check(
  '/api/settings',
  {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://untrusted.example',
      'Access-Control-Request-Method': 'POST',
    },
  },
  403,
);
const rejected = await check('/api/household', { headers: { Origin: 'https://localhost' } }, 401);
assert.equal(rejected.headers.get('access-control-allow-origin'), 'https://localhost');
const discovery = await fetch('https://auth.devbuildtool.com/.well-known/openid-configuration');
assert.equal(discovery.status, 200);
const auth = await discovery.json();
assert.equal(auth.issuer, 'https://auth.devbuildtool.com/');
assert.equal(auth.authorization_endpoint, 'https://auth.devbuildtool.com/authorize');
const keys = await fetch(auth.jwks_uri);
assert.equal(keys.status, 200);
assert.ok((await keys.json()).keys.some((key) => key.kty === 'RSA'));
console.log(
  'Live backend health, access protection, Android CORS and Auth0 issuer/key discovery verified.',
);
console.log('A real user login is still required to verify authenticated household access.');
