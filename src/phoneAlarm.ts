import { registerPlugin } from '@capacitor/core';
export const PhoneAlarm = registerPlugin<{
  configure(options: { enabled: boolean }): Promise<void>;
  quietHours(options: {enabled:boolean;start:string;end:string;timezone:string}):Promise<void>;
  test(): Promise<void>;
  silence(): Promise<void>;
  sync(options: { episodes: string[]; measuredAt: number }): Promise<void>;
  status(): Promise<{ active: boolean; quiet:boolean;suspended:boolean; error: string; open: boolean }>;
}>('PhoneAlarm');
