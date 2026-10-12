import { authenticate, verifiedEmail, HttpError, type Identity } from './auth';
import { mayManage, isRole, type Household, type Role, type Preferences } from '../shared/model';
import { androidAppId } from '../shared/mobile';
import { allowedOrigin, preflight, withCors } from './cors';
import { ingestTelemetry, householdTelemetry } from './telemetry';
import { queueCalibration } from './calibration';
import { queueBuzzer } from './buzzer';
import { saveAlarmSettings, acknowledgeAlarms } from './alarms';
import { registerPush, disablePush, pushConfigured, deliverPush } from './push';
export type ApiEnv = Pick<Env, 'DB' | 'AUTH0_DOMAIN' | 'AUTH0_AUDIENCE'> & {
  FCM_SERVICE_ACCOUNT?: string;
};

interface Membership {
  id: string;
  household_id: string;
  subject: string;
  name: string;
  email: string;
  role: Role;
}
interface StoredHome {
  id: string;
  name: string;
  tank_name: string;
  preferences: string;
}
const response = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new HttpError(415, 'Send JSON.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Missing request body.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw new HttpError(413, 'Request too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Expected object');
    return data as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}
async function hash(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}
async function membership(env: ApiEnv, identity: Identity) {
  const member = await env.DB.prepare('SELECT * FROM memberships WHERE subject = ?')
    .bind(identity.subject)
    .first<Membership>();
  if (!member || !isRole(member.role))
    throw new HttpError(403, 'Your account has not been added to a household.');
  return member;
}
function owner(member: Membership) {
  if (!mayManage(member.role)) throw new HttpError(403, 'Only the household owner can do that.');
}
async function audit(env: ApiEnv, member: Membership, title: string, detail: string) {
  await env.DB.prepare('INSERT INTO audit_events VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), member.household_id, member.subject, Date.now(), title, detail)
    .run();
}
async function snapshot(env: ApiEnv, member: Membership): Promise<Household> {
  const [home, members, invitations, activities] = await Promise.all([
    env.DB.prepare('SELECT * FROM households WHERE id = ?')
      .bind(member.household_id)
      .first<StoredHome>(),
    env.DB.prepare('SELECT * FROM memberships WHERE household_id = ?')
      .bind(member.household_id)
      .all<Membership>(),
    mayManage(member.role)
      ? env.DB.prepare(
          'SELECT id, email, role, expires_at AS expiresAt FROM invitations WHERE household_id = ? AND expires_at > ?',
        )
          .bind(member.household_id, Date.now())
          .all<Household['invitations'][number]>()
      : Promise.resolve({ results: [] }),
    env.DB.prepare(
      'SELECT id, at, title, detail FROM audit_events WHERE household_id = ? ORDER BY at DESC LIMIT 30',
    )
      .bind(member.household_id)
      .all<{ id: string; at: number; title: string; detail: string }>(),
  ]);
  if (!home) throw new HttpError(404, 'Household not found.');
  const telemetry = await householdTelemetry(env, member.household_id);
  return {
    id: home.id,
    name: home.name,
    tankName: home.tank_name,
    role: member.role,
    reading: telemetry.reading,
    calibrationCommand: telemetry.calibrationCommand,
    buzzerCommand: telemetry.buzzerCommand,
    alarmSettings: telemetry.alarmSettings,
    alarmAcknowledgements: telemetry.alarmAcknowledgements,
    alerts: [],
    history: telemetry.history,
    members: members.results.map((person) => ({
      id: person.id,
      name: person.name,
      email: person.email,
      role: person.role,
      isYou: person.subject === member.subject,
    })),
    invitations: invitations.results,
    activities: activities.results.map((event) => ({ ...event, tone: 'neutral' })),
    preferences: JSON.parse(home.preferences) as Preferences,
  };
}
async function acceptInvitation(request: Request, env: ApiEnv, identity: Identity) {
  const data = await body(request);
  const byEmail = typeof data.invitationId === 'string' && data.invitationId.length <= 80;
  if (!byEmail && (typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token)))
    throw new HttpError(400, 'Choose a pending household invitation.');
  const email = await verifiedEmail(identity, env.AUTH0_DOMAIN);
  const tokenHash = byEmail ? '' : await hash(data.token as string);
  const invite = await env.DB.prepare(
    byEmail
      ? 'SELECT * FROM invitations WHERE id = ? AND expires_at > ? AND email = ?'
      : 'SELECT * FROM invitations WHERE token_hash = ? AND expires_at > ? AND email = ?',
  )
    .bind(byEmail ? data.invitationId : tokenHash, Date.now(), email)
    .first<{ id: string; household_id: string; role: Role; token_hash: string }>();
  if (!invite)
    throw new HttpError(410, 'This invitation is unavailable or belongs to another email address.');
  if (
    await env.DB.prepare('SELECT id FROM memberships WHERE subject = ?')
      .bind(identity.subject)
      .first()
  )
    throw new HttpError(409, 'You already belong to a household.');
  const name =
    typeof data.name === 'string' && data.name.trim()
      ? data.name.trim().slice(0, 80)
      : email.split('@')[0];
  // D1 batch is transactional. The insertion condition prevents reuse/expiry races.
  const result = await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO memberships (id, household_id, subject, name, email, role) SELECT ?, household_id, ?, ?, email, role FROM invitations WHERE id = ? AND token_hash = ? AND expires_at > ? AND email = ?',
    ).bind(
      crypto.randomUUID(),
      identity.subject,
      name,
      invite.id,
      invite.token_hash,
      Date.now(),
      email,
    ),
    env.DB.prepare(
      'DELETE FROM invitations WHERE id = ? AND EXISTS (SELECT 1 FROM memberships WHERE subject = ? AND household_id = ?)',
    ).bind(invite.id, identity.subject, invite.household_id),
    env.DB.prepare(
      'INSERT INTO audit_events (id, household_id, actor, at, title, detail) SELECT ?, household_id, subject, ?, ?, ? FROM memberships WHERE subject = ? AND household_id = ?',
    ).bind(
      crypto.randomUUID(),
      Date.now(),
      'Household member joined',
      'A verified email invitation was accepted.',
      identity.subject,
      invite.household_id,
    ),
  ]);
  if (result[0].meta.changes !== 1)
    throw new HttpError(410, 'This invitation has expired or was already accepted.');
  return response({ ok: true });
}
export const api = {
  async fetch(
    request: Request,
    env: ApiEnv,
    ctx?: Pick<ExecutionContext, 'waitUntil'>,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return response({ error: 'Endpoint not found.' }, 404);
    try {
      if (url.pathname === '/api/health' && request.method === 'GET')
        return response({
          service: 'waterline',
          version: '0.1.2',
          deviceTransport: 'https-upload',
        });
      if (url.pathname === '/api/device/telemetry' && request.method === 'POST')
        return await ingestTelemetry(request, env, body, ctx);
      const identity = await authenticate(request, env.AUTH0_DOMAIN, env.AUTH0_AUDIENCE);
      if (!['GET', 'HEAD'].includes(request.method) && !allowedOrigin(request))
        throw new HttpError(403, 'Use the household app to make changes.');
      if (url.pathname === '/api/invitations/pending' && request.method === 'GET') {
        const email = await verifiedEmail(identity, env.AUTH0_DOMAIN);
        const existing = await env.DB.prepare('SELECT id FROM memberships WHERE subject = ?')
          .bind(identity.subject)
          .first();
        if (existing) return response({ invitations: [] });
        const invitations = await env.DB.prepare(
          'SELECT i.id, h.name AS householdName, i.role, i.expires_at AS expiresAt FROM invitations i JOIN households h ON h.id = i.household_id WHERE i.email = ? AND i.expires_at > ? ORDER BY i.expires_at DESC',
        )
          .bind(email, Date.now())
          .all();
        return response({ invitations: invitations.results });
      }
      if (url.pathname === '/api/invitations/accept' && request.method === 'POST')
        return await acceptInvitation(request, env, identity);
      const member = await membership(env, identity);
      if (url.pathname === '/api/push/status' && request.method === 'GET')
        return response({ configured: pushConfigured(env) });
      if (url.pathname === '/api/push/register' && request.method === 'POST') {
        await registerPush(env, member.subject, await body(request));
        if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(deliverPush(env));
        return response({ ok: true, configured: pushConfigured(env) });
      }
      if (url.pathname === '/api/push/register' && request.method === 'DELETE') {
        await disablePush(env, member.subject, await body(request));
        return response({ ok: true });
      }
      if (url.pathname === '/api/reading' && request.method === 'GET') {
        return response({
          role: member.role,
          ...(await householdTelemetry(env, member.household_id, false, false, url.searchParams.get('controls') !== 'false')),
        });
      }
      if (url.pathname === '/api/history' && request.method === 'GET') {
        const telemetry = await householdTelemetry(
          env,
          member.household_id,
          true,
          url.searchParams.get('refresh') === 'true',
        );
        return response({ householdId: member.household_id, history: telemetry.history });
      }
      if (url.pathname === '/api/household' && request.method === 'GET')
        return response(await snapshot(env, member));
      if (url.pathname === '/api/calibration' && request.method === 'POST') {
        owner(member);
        await queueCalibration(env, member.household_id, member.subject, await body(request));
        await audit(
          env,
          member,
          'Calibration requested',
          'All four probes; physical preparation confirmed.',
        );
        return response(await snapshot(env, member), 202);
      }
      if (url.pathname === '/api/alarms/settings' && request.method === 'POST') {
        owner(member);
        await saveAlarmSettings(env, member.household_id, await body(request));
        await audit(
          env,
          member,
          'Level alarms updated',
          'Settings will be saved on the ESP32 on its next upload.',
        );
        return response(await snapshot(env, member), 202);
      }
      if (url.pathname === '/api/alarms/ack' && request.method === 'POST') {
        await acknowledgeAlarms(env, member.household_id, await body(request));
        await audit(
          env,
          member,
          'Level alarms acknowledged',
          'Waiting for board confirmation; re-arms when the probe dries.',
        );
        return response(await snapshot(env, member), 202);
      }
      if (url.pathname === '/api/settings' && request.method === 'PATCH') {
        owner(member);
        const data = await body(request);
        if (typeof data.tankName !== 'string' || !data.tankName.trim() || data.tankName.length > 60)
          throw new HttpError(400, 'Choose a tank name between 1 and 60 characters.');
        const prefs = data.preferences as Partial<Preferences> | undefined;
        if (
          !prefs ||
          ['low', 'full', 'fault', 'offline'].some(
            (key) => typeof prefs[key as keyof Preferences] !== 'boolean',
          )
        )
          throw new HttpError(400, 'Invalid alert preferences.');
        await env.DB.prepare('UPDATE households SET tank_name = ?, preferences = ? WHERE id = ?')
          .bind(
            data.tankName.trim(),
            JSON.stringify({
              low: prefs.low,
              full: prefs.full,
              fault: prefs.fault,
              offline: prefs.offline,
            }),
            member.household_id,
          )
          .run();
        await audit(
          env,
          member,
          'Household settings updated',
          'Tank name and in-app alert preferences saved.',
        );
        return response(await snapshot(env, member));
      }
      if (url.pathname === '/api/invitations' && request.method === 'POST') {
        owner(member);
        const data = await body(request);
        if (
          typeof data.email !== 'string' ||
          data.email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
        )
          throw new HttpError(400, 'Enter a valid email address.');
        if (data.role !== 'viewer' && data.role !== 'operator')
          throw new HttpError(400, 'Choose Viewer or Operator.');
        const email = data.email.toLowerCase().trim();
        const existing = await env.DB.prepare(
          'SELECT id FROM memberships WHERE household_id = ? AND lower(email) = ?',
        )
          .bind(member.household_id, email)
          .first();
        if (existing) throw new HttpError(409, 'That person is already a household member.');
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('');
        const id = crypto.randomUUID();
        await env.DB.batch([
          env.DB.prepare('DELETE FROM invitations WHERE household_id = ? AND email = ?').bind(
            member.household_id,
            email,
          ),
          env.DB.prepare('INSERT INTO invitations VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
            id,
            member.household_id,
            email,
            data.role,
            await hash(token),
            Date.now() + 7 * 86400000,
            identity.subject,
          ),
        ]);
        await audit(env, member, 'Invitation created', `${email} invited as ${data.role}.`);
        return response(
          {
            invitationUrl: `${url.origin}/#join=${token}`,
            mobileInvitationUrl: `${androidAppId}://join?token=${token}`,
            household: await snapshot(env, member),
          },
          201,
        );
      }
      if (url.pathname === '/api/household/leave' && request.method === 'POST') {
        if (member.role === 'owner')
          throw new HttpError(
            409,
            'The household owner cannot leave. Owner access must be transferred first.',
          );
        await env.DB.batch([
          env.DB.prepare(
            'INSERT INTO audit_events (id, household_id, actor, at, title, detail) VALUES (?, ?, ?, ?, ?, ?)',
          ).bind(
            crypto.randomUUID(),
            member.household_id,
            member.subject,
            Date.now(),
            'Member left household',
            `${member.name} left the household.`,
          ),
          env.DB.prepare(
            "DELETE FROM memberships WHERE id=? AND subject=? AND role != 'owner'",
          ).bind(member.id, member.subject),
          env.DB.prepare('DELETE FROM push_installations WHERE subject=?').bind(member.subject),
        ]);
        return response({ ok: true });
      }
      const memberMatch = url.pathname.match(/^\/api\/members\/([^/]+)$/);
      if (memberMatch && ['PATCH', 'DELETE'].includes(request.method)) {
        owner(member);
        const target = await env.DB.prepare(
          'SELECT * FROM memberships WHERE id = ? AND household_id = ?',
        )
          .bind(memberMatch[1], member.household_id)
          .first<Membership>();
        if (!target) throw new HttpError(404, 'Member not found.');
        if (target.role === 'owner')
          throw new HttpError(409, 'Owner access cannot be changed here.');
        if (request.method === 'DELETE')
          await env.DB.prepare(
            "DELETE FROM memberships WHERE id = ? AND household_id = ? AND role != 'owner'",
          )
            .bind(target.id, member.household_id)
            .run();
        else {
          const data = await body(request);
          if (data.role !== 'viewer' && data.role !== 'operator')
            throw new HttpError(400, 'Choose Viewer or Operator.');
          await env.DB.prepare(
            "UPDATE memberships SET role = ? WHERE id = ? AND household_id = ? AND role != 'owner'",
          )
            .bind(data.role, target.id, member.household_id)
            .run();
        }
        await audit(env, member, 'Household access updated', `Access updated for ${target.name}.`);
        return response(await snapshot(env, member));
      }
      const inviteMatch = url.pathname.match(/^\/api\/invitations\/([^/]+)$/);
      if (inviteMatch && request.method === 'DELETE') {
        owner(member);
        await env.DB.prepare('DELETE FROM invitations WHERE id = ? AND household_id = ?')
          .bind(inviteMatch[1], member.household_id)
          .run();
        await audit(env, member, 'Invitation revoked', 'A pending invitation was cancelled.');
        return response(await snapshot(env, member));
      }
      // Only the explicitly supported buzzer actions are accepted; no motor route.
      if (url.pathname === '/api/commands' && request.method === 'POST') {
        if (member.role === 'viewer')
          throw new HttpError(403, 'Viewer access cannot operate the device.');
        await queueBuzzer(env, member.household_id, member.subject, await body(request));
        await audit(
          env,
          member,
          'Buzzer command requested',
          'Delivery pending device acknowledgement.',
        );
        return response(await snapshot(env, member), 202);
      }
      throw new HttpError(404, 'Endpoint not found.');
    } catch (error) {
      if (error instanceof HttpError) return response({ error: error.message }, error.status);
      const message = error instanceof Error ? error.message : '';
      if (/daily.*(read|write).*limit|exceeded.*free tier|7500/i.test(message)) {
        return response(
          {
            error:
              'Cloud database daily limit reached. Cloud access resumes after the midnight UTC reset (5:30 AM IST). Nearby Bluetooth still works.',
          },
          503,
        );
      }

      console.error(
        JSON.stringify({ event: 'api_error', requestId: crypto.randomUUID(), path: url.pathname }),
      );
      return response({ error: 'Something went wrong. Please try again.' }, 500);
    }
  },
} satisfies ExportedHandler<ApiEnv>;

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method === 'OPTIONS') return preflight(request);
    return withCors(request, await api.fetch(request, env, ctx));
  },
} satisfies ExportedHandler<Env>;
