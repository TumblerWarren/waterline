import { useEffect, useRef, useState } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import type { PluginListenerHandle } from '@capacitor/core';
import { isNative } from './native';
import { PhoneAlarm } from './phoneAlarm';
import { App as NativeApp } from '@capacitor/app';
import type { Reading } from '../shared/model';

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
  reading?: Reading | null,
) {
  const [enabled, setEnabled] = useState(
    () => isNative && localStorage.getItem(preference) === 'true',
  );
  const [ringing, setRinging] = useState(false);
  const [phoneError, setPhoneError] = useState('');
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
      await PhoneAlarm.configure({enabled:true});
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
              alarmCapable: true,
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
  useEffect(() => {
    if (!isNative || !authenticated || preview) return;
    void PhoneAlarm.configure({enabled}).catch(()=>setPhoneError('Phone alarm setup failed.'));
  }, [authenticated,enabled,preview]);
  useEffect(() => {
    if(!isNative || !authenticated || !enabled || !reading || reading.measuredAt === null || Date.now()-reading.measuredAt>30000) return;
    const episodes = reading.buzzerEnabled && reading.calibrated && !reading.fault
      ? (reading.levelAlarms ?? []).filter(a=>a.enabled && a.active && !a.acknowledged).map(a=>a.episode) : [];
    void PhoneAlarm.sync({episodes,measuredAt:reading.measuredAt}).catch(()=>{});
  }, [authenticated,enabled,reading]);
  useEffect(() => {
    if(!isNative) return;
    let disposed=false;
    const check=async()=>{const state=await PhoneAlarm.status();if(disposed)return;setRinging(state.active);setPhoneError(state.error);if(state.open)handlers.current.open();};
    void check().catch(()=>{});
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void check().catch(()=>{});},2000);
    const listener=NativeApp.addListener('appStateChange',state=>{if(state.isActive)void check().catch(()=>{});});
    return()=>{disposed=true;window.clearInterval(timer);void listener.then(handle=>handle.remove());};
  },[]);
  async function silence() {await PhoneAlarm.silence();setRinging(false);}
  const enable = () => {
    localStorage.setItem(preference, 'true');
    setEnabled(true);
  };
  async function disable() {
    if(isNative) await PhoneAlarm.configure({enabled:false});
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
  return { enabled, status, enable, disable, ringing, phoneError, silence, testPhone: () => PhoneAlarm.test(), supported: isNative && !preview && authenticated };
}
