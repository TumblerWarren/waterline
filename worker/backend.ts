import { api, type ApiEnv } from './index';
import { preflight, withCors } from './cors';

// Dedicated Android backend: deploy the API without bundling the unfinished web UI.
export default {
  async fetch(request, env): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith('/api/'))
      return Response.json(
        { service: 'waterline-api', error: 'Endpoint not found.' },
        {
          status: 404,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    if (request.method === 'OPTIONS') return preflight(request);
    return withCors(request, await api.fetch(request, env));
  },
} satisfies ExportedHandler<ApiEnv>;
