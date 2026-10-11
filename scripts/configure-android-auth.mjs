import { writeFileSync } from 'node:fs';
import { loadEnv } from 'vite';

// Use Vite's own precedence/expansion to keep the native SDK and bundled UI in sync.
const env = loadEnv('android', process.cwd(), 'VITE_');
const domain = env.VITE_AUTH0_DOMAIN || 'unconfigured.invalid';
const clientId = env.VITE_AUTH0_CLIENT_ID || '';
const audience = env.VITE_AUTH0_AUDIENCE || '';
if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) || domain.includes('..'))
  throw new Error('VITE_AUTH0_DOMAIN must be a hostname without https:// or a path.');
if (clientId && !/^[a-zA-Z0-9_-]+$/.test(clientId))
  throw new Error('VITE_AUTH0_CLIENT_ID must be the public Native application Client ID.');
const xml = (value) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[char],
  );
writeFileSync(
  new URL('../android/app/src/main/res/values/auth0.xml', import.meta.url),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n` +
    Object.entries({ domain, client_id: clientId, audience, scheme: 'com.waterline.household' })
      .map(
        ([name, value]) =>
          `    <string name="com_auth0_${name}" translatable="false">${xml(value)}</string>`,
      )
      .join('\n') +
    '\n</resources>\n',
);
console.log('Android Auth0 public configuration synchronized.');
