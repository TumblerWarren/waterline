import { androidOrigin } from '../shared/mobile';
const methods = ['GET', 'POST', 'PATCH', 'DELETE'];
export function allowedOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  return origin === new URL(request.url).origin || origin === androidOrigin;
}
export function preflight(request: Request) {
  const requested = (request.headers.get('Access-Control-Request-Headers') || '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  const allowed =
    allowedOrigin(request) &&
    methods.includes(request.headers.get('Access-Control-Request-Method') || '') &&
    requested.every((header) => ['authorization', 'content-type'].includes(header));
  return new Response(null, {
    status: allowed ? 204 : 403,
    headers: allowed
      ? {
          'Access-Control-Allow-Origin': request.headers.get('Origin')!,
          'Access-Control-Allow-Methods': methods.join(', '),
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '600',
          Vary: 'Origin',
        }
      : { Vary: 'Origin' },
  });
}
export function withCors(request: Request, response: Response) {
  const headers = new Headers(response.headers);
  headers.set('Vary', 'Origin');
  if (allowedOrigin(request))
    headers.set('Access-Control-Allow-Origin', request.headers.get('Origin')!);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
