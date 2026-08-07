import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '@/i18n/locales/en.json';

export const supportedLocales = ['en'] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export const defaultLocale: SupportedLocale = 'en';

function isSupportedLocale(locale: string): locale is SupportedLocale {
  return (supportedLocales as readonly string[]).includes(locale);
}

export function resolveDeviceLocale(): SupportedLocale {
  const [device] = getLocales();
  const languageCode = device?.languageCode;

  if (languageCode && isSupportedLocale(languageCode)) {
    return languageCode;
  }

  return defaultLocale;
}

i18n.use(initReactI18next).init({
  lng: resolveDeviceLocale(),
  fallbackLng: defaultLocale,
  defaultNS: 'translation',
  resources: {
    en: { translation: en },
  },
  interpolation: { escapeValue: false },
});

export default i18n;
