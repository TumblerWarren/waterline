import { readFileSync } from 'node:fs';
import { parse } from 'jsonc-parser';
const errors = [];
const config = parse(
  readFileSync(new URL('../wrangler.backend.jsonc', import.meta.url), 'utf8'),
  errors,
  {
    allowTrailingComma: true,
  },
);
if (errors.length || config.name !== 'waterline-api' || !config.account_id)
  throw new Error('Review the backend target account and Worker configuration before deploying.');
if (!config.vars?.AUTH0_DOMAIN || !config.vars?.AUTH0_AUDIENCE)
  throw new Error('Configure the Auth0 issuer and API audience before deploying the backend.');
if (
  !config.d1_databases?.some(
    (db) =>
      db.binding === 'DB' &&
      db.database_id &&
      db.database_id !== '00000000-0000-0000-0000-000000000000',
  )
)
  throw new Error('Configure the actual Waterline D1 database ID before deploying.');
console.log('Waterline backend target and authentication configuration present.');
