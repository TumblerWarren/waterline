import { useEffect, useRef } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { mobileInvitation } from '../shared/mobile';

export const isNative = Capacitor.isNativePlatform();
export function useNativeNavigation(onBack: () => void, onInvite: (token: string) => void) {
  const handlers = useRef({ onBack, onInvite });
  useEffect(() => {
    handlers.current = { onBack, onInvite };
  }, [onBack, onInvite]);
  useEffect(() => {
    if (!isNative) return;
    let disposed = false;
    const handles: PluginListenerHandle[] = [];
    const invite = (url: string) => {
      const token = mobileInvitation(url);
      if (token && !disposed) handlers.current.onInvite(token);
    };
    async function setup() {
      for (const listener of [
        NativeApp.addListener('backButton', () => handlers.current.onBack()),
        NativeApp.addListener('appUrlOpen', (event) => invite(event.url)),
      ]) {
        const handle = await listener;
        if (disposed) await handle.remove();
        else handles.push(handle);
      }
      const launch = await NativeApp.getLaunchUrl();
      if (launch) invite(launch.url);
    }
    void setup().catch(() => console.error('Native navigation initialization failed.'));
    return () => {
      disposed = true;
      for (const handle of handles) void handle.remove();
    };
  }, []);
}
export const minimizeApp = () => NativeApp.minimizeApp();
