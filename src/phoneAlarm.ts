import { registerPlugin } from '@capacitor/core';
export const PhoneAlarm = registerPlugin<{
  configure(options: { enabled: boolean }): Promise<void>;
  test(): Promise<void>;
  silence(): Promise<void>;
  sync(options: { episodes: string[]; measuredAt: number }): Promise<void>;
  status(): Promise<{ active: boolean; error: string; open: boolean }>;
}>('PhoneAlarm');
