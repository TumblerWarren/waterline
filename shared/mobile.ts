export const androidAppId = 'com.waterline.household';
export const androidOrigin = 'https://localhost';
export function mobileCallback(domain: string) {
  return `${androidAppId}://${domain}/android/${androidAppId}/callback`;
}
export function isMobileCallback(value: string, domain: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === `${androidAppId}:` &&
      parsed.host === domain &&
      parsed.pathname === `/android/${androidAppId}/callback` &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}
export function mobileInvitation(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== `${androidAppId}:` ||
      parsed.host !== 'join' ||
      parsed.pathname ||
      parsed.username ||
      parsed.password
    )
      return null;
    const token = parsed.searchParams.get('token');
    return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}
export function apiBase(value: string | undefined, native: boolean) {
  if (!value?.trim()) {
    if (native)
      throw new Error(
        'The cloud connection is not configured yet. Use preview until the server is ready.',
      );
    return '';
  }
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('The cloud API needs an HTTPS origin without a path or credentials.');
  return url.origin;
}
