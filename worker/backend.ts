import { api, type ApiEnv } from './index';
import { preflight, withCors } from './cors';
import { deliverPush } from './push';

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
    return withCors(request, await api.fetch(request, env, ctx));
  },
  async scheduled(_event, env) {
    await deliverPush(env);
  },
} satisfies ExportedHandler<ApiEnv>;
