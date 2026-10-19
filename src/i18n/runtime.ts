import * as i18next from 'i18next';
import { phrases } from './phrases';
import { adminPhrases } from './adminPhrases';
const i18n = i18next.default || i18next;

export const phraseDictionary = { ...phrases, ...adminPhrases };
export const phraseKey = (text: string) => 'phrase_' + Array.from(text, c => c.codePointAt(0)!.toString(16)).join('_');
export function phrase(text: string): string {
  if (!i18n.isInitialized || !Object.hasOwn(phraseDictionary, text)) return text;
  return String(i18n.t(phraseKey(text), { defaultValue: text }));
}
export function displayLocale(): string {
  return i18n.resolvedLanguage === 'en' ? 'en-ID' : 'id-ID';
}
export function displayDate(value: string | number | Date): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(displayLocale(), {
    timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
}