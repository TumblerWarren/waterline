import { useSyncExternalStore } from 'react';
import bengali from './bengali.json';
export type Language = 'en' | 'bn';
const listeners = new Set<() => void>();
const key = 'waterline-language';
export function currentLanguage(): Language {
  return localStorage.getItem(key) === 'bn' ? 'bn' : 'en';
}
export function setLanguage(language: Language) {
  localStorage.setItem(key, language);
  document.documentElement.lang = language;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useLanguage() {
  const language = useSyncExternalStore(subscribe, currentLanguage);
  return { language, setLanguage };
}
export function t(text: string) {
  if (currentLanguage() !== 'bn') return text;
  const dictionary = bengali as Record<string, string>;
  if (dictionary[text]) return dictionary[text];
  const timing = text.match(/^(Below 20%|\d+%) · (\d+)s sound \/ (\d+)s silence$/);
  if (timing)
    return `${timing[1] === 'Below 20%' ? dictionary['Below 20%'] : timing[1]} · ${timing[2]} সেকেন্ড শব্দ / ${timing[3]} সেকেন্ড নীরব`;
  return text;
}
