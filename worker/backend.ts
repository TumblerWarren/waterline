import { api, type ApiEnv } from './index';
import { preflight, withCors } from './cors';
import { deliverPush } from './push';
import { pruneTelemetry } from './telemetry';
import { measureDatabase } from './usage';

// Dedicated Android backend: deploy the API without bundling the unfinished web UI.
export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith('/api/'))
      return Response.json(
        { service: 'waterline-api', error: 'Endpoint not found.' },
        {
          status: 404,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    if (request.method === 'OPTIONS') return preflight(request);
    const usage = measureDatabase(env.DB);
    const result = await api.fetch(request, { ...env, DB: usage.DB }, ctx);
    // Sample successful traffic, always include database-related failures.
    if (result.status >= 500 || Math.random() < 0.1) {
      console.log(
        JSON.stringify({
          event: 'db_usage',
          operation: new URL(request.url).pathname,
          status: result.status,
          ...usage.stats,
        }),
      );
    }
    return withCors(request, result);
  },
  async scheduled(_event, env) {
    const usage = measureDatabase(env.DB);
    const measuredEnv = { ...env, DB: usage.DB };
    await deliverPush(measuredEnv);
    if (new Date(_event.scheduledTime).getUTCMinutes() === 0)
      await pruneTelemetry(measuredEnv, _event.scheduledTime);
    console.log(JSON.stringify({ event: 'db_usage', operation: 'scheduled', ...usage.stats }));
  },
} satisfies ExportedHandler<ApiEnv>;
