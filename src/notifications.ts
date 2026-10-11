import { useEffect, useRef, useState } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import type { PluginListenerHandle } from '@capacitor/core';
import { isNative } from './native';

const preference = 'waterline-phone-alerts';
const installation = 'waterline-push-installation';
function installationId() {
  let id = localStorage.getItem(installation);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(installation, id);
  }
  return id;
}
type Request = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
export function usePhoneNotifications(
  authenticated: boolean,
  preview: boolean,
  request: Request,
  open: () => void,
) {
  const [enabled, setEnabled] = useState(
    () => isNative && localStorage.getItem(preference) === 'true',
  );
  const [status, setStatus] = useState('Not enabled on this phone.');
  const handlers = useRef({ request, open });
  handlers.current = { request, open };
  useEffect(() => {
    if (!isNative || preview || !authenticated || !enabled) return;
    let disposed = false;
    const handles: PluginListenerHandle[] = [];
    async function setup() {
      setStatus('Checking notification permission…');
      let permission = await PushNotifications.checkPermissions();
      if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale')
        permission = await PushNotifications.requestPermissions();
      if (disposed) return;
      if (permission.receive !== 'granted')
        throw new Error('Notifications are blocked. Allow them in Android app settings.');
      await PushNotifications.createChannel({
        id: 'waterline_alarms_v1',
        name: 'Water-level alarms',
        description: 'Alerts when a board alarm becomes active',
        importance: 5,
        vibration: true,
        visibility: 0,
      });
      for (const pending of [
        PushNotifications.addListener('registration', (token) => {
          if (disposed) return;
          void handlers.current
            .request<{ configured: boolean }>('/api/push/register', 'POST', {
              id: installationId(),
              token: token.value,
            })
            .then((result) => {
              if (!disposed)
                setStatus(
                  result.configured
                    ? 'Enabled. New board alarms send a sound notification.'
                    : 'Phone registered. Cloud push sender setup is still required.',
                );
            })
            .catch(() => {
              if (!disposed)
                setStatus('Phone registration failed. Disable and enable notifications to retry.');
            });
        }),
        PushNotifications.addListener('registrationError', () => {
          if (!disposed) setStatus('Firebase registration failed. Please retry.');
        }),
        PushNotifications.addListener('pushNotificationActionPerformed', () => {
          if (!disposed) handlers.current.open();
        }),
      ]) {
        const handle = await pending;
        if (disposed) await handle.remove();
        else handles.push(handle);
      }
      if (!disposed) await PushNotifications.register();
    }
    void setup().catch((error) => {
      if (!disposed)
        setStatus(error instanceof Error ? error.message : 'Notifications could not be enabled.');
    });
    return () => {
      disposed = true;
      for (const handle of handles) void handle.remove();
    };
  }, [authenticated, preview, enabled]);
  const enable = () => {
    localStorage.setItem(preference, 'true');
    setEnabled(true);
  };
  async function disable() {
    setEnabled(false);
    localStorage.removeItem(preference);
    const id = localStorage.getItem(installation);
    try {
      if (id && authenticated && !preview)
        await handlers.current.request('/api/push/register', 'DELETE', { id });
    } finally {
      if (isNative) {
        await PushNotifications.unregister();
        await PushNotifications.removeAllDeliveredNotifications();
      }
      localStorage.removeItem(installation);
      setStatus('Disabled on this phone.');
    }
  }
  return { enabled, status, enable, disable, supported: isNative && !preview && authenticated };
}
