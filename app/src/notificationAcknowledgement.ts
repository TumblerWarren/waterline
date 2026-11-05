// Notification targets are captured when the alert is displayed. Never acknowledge
// a newer alarm at the same level just because it is active when the app opens.
export async function acknowledgeNotification(
  ids: string[],
  request: (path: string, method: string, body: unknown) => Promise<unknown>,
  finish: (options: { ids: string[] }) => Promise<void>,
) {
  const alarms = ids.flatMap((id) => {
    const match = id.match(/^(.+):(20|50|80|100):([a-f0-9]{32})$/);
    return match && match[1] !== 'phone-test'
      ? [{ level: Number(match[2]), episode: match[3] }]
      : [];
  });
  if (alarms.length) await request('/api/alarms/ack', 'POST', { alarms });
  await finish({ ids });
}
