import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { parse } from 'jsonc-parser';

// This check never logs configuration values or creates cloud resources.
const errors = [];
const config = parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'), errors, {
  allowTrailingComma: true,
});
if (errors.length) throw new Error('Invalid wrangler.jsonc configuration.');
const values = {};
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  const file = new URL(`../${name}`, import.meta.url);
  if (existsSync(file)) Object.assign(values, parseEnv(readFileSync(file, 'utf8')));
}
Object.assign(values, process.env);
const missing = ['VITE_AUTH0_DOMAIN', 'VITE_AUTH0_CLIENT_ID', 'VITE_AUTH0_AUDIENCE'].filter(
  (key) => !values[key],
);
if (missing.length) throw new Error(`Configure ${missing.join(', ')} before deploying.`);
if (
  config.vars.AUTH0_DOMAIN !== values.VITE_AUTH0_DOMAIN ||
  config.vars.AUTH0_AUDIENCE !== values.VITE_AUTH0_AUDIENCE
) {
  throw new Error(
    'Production Auth0 domain and audience must match in the frontend environment and wrangler.jsonc vars.',
  );
}
const databaseId = config.d1_databases?.find((binding) => binding.binding === 'DB')?.database_id;
if (!databaseId || databaseId === '00000000-0000-0000-0000-000000000000')
  throw new Error('Create a Cloudflare D1 database and configure its ID before deploying.');
console.log('Auth0 and database configuration present. Build and deployment may proceed.');
