import { describe, expect, it } from 'vitest';
import backend from '../worker/backend';

describe('dedicated cloud backend', () => {
  const env = {} as Env;
  it('does not serve the unfinished web UI or require an asset binding', async () => {
    const response = await backend.fetch(new Request('https://api.example/'), env);
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('provides health without exposing a household or claiming connected telemetry', async () => {
    const response = await backend.fetch(new Request('https://api.example/api/health'), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      service: 'waterline',
      version: '0.1.2',
      deviceTransport: 'https-upload',
    });
  });
  it('protects household access and explains errors to the Android app', async () => {
    const response = await backend.fetch(
      new Request('https://api.example/api/household', {
        headers: { Origin: 'https://localhost' },
      }),
      env,
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost');
  });
});
