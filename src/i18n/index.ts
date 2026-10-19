import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { projectStorageKey } from '../../supabaseClient';
import { id, en } from './resources';
import { normalizeLocale, readLocale, writeLocale } from './preference';
import { phrase, phraseDictionary, phraseKey } from './runtime';

export const localeStorageKey = projectStorageKey + 'locale';
function storage(): Storage | undefined {
  try { return window.localStorage; }
  catch { return undefined; }
}
function synchronize(language: string) {
  const locale = normalizeLocale(language);
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  writeLocale(storage(), localeStorageKey, locale);
}
i18n.use(initReactI18next);
i18n.on('languageChanged', synchronize);
void i18n.init({
  resources: {
    id: { translation: { ...id, ...Object.fromEntries(Object.keys(phraseDictionary).map(text => [phraseKey(text), text])) } },
    en: { translation: { ...en, ...Object.fromEntries(Object.entries(phraseDictionary).map(([text, english]) => [phraseKey(text), english])) } },
  },
  lng: readLocale(storage(), localeStorageKey), fallbackLng: 'id', supportedLngs: ['id', 'en'],
  interpolation: { escapeValue: false }, initAsync: false,
});

// Exact application/provider messages only; never translate arbitrary server text or user data.
const messageKeys = new Map<string, string>(Object.entries(id.errors).map(([key, value]) => [value, `errors.${key}`]));
messageKeys.set('Invalid login credentials', 'errors.invalidCredentials');
messageKeys.set('Email not confirmed', 'errors.emailUnconfirmed');
export function localizedMessage(message: string): string {
  const key = messageKeys.get(message);
  return key ? i18n.t(key) : phrase(message);
}
export default i18n;