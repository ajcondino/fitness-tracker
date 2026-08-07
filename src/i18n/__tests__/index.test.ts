import * as ExpoLocalization from 'expo-localization';
import type { Locale } from 'expo-localization';

import { defaultLocale, resolveDeviceLocale } from '@/i18n';

function createLocale(overrides: Partial<Locale>): Locale {
  return {
    languageTag: 'en-US',
    languageCode: 'en',
    languageScriptCode: null,
    regionCode: 'US',
    languageRegionCode: 'US',
    currencyCode: 'USD',
    currencySymbol: '$',
    languageCurrencyCode: 'USD',
    languageCurrencySymbol: '$',
    decimalSeparator: '.',
    digitGroupingSeparator: ',',
    textDirection: 'ltr',
    measurementSystem: 'us',
    temperatureUnit: 'fahrenheit',
    ...overrides,
  };
}

describe('resolveDeviceLocale', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the device locale when it is in supportedLocales', () => {
    jest
      .spyOn(ExpoLocalization, 'getLocales')
      .mockReturnValue([createLocale({ languageCode: 'en' })]);

    expect(resolveDeviceLocale()).toBe('en');
  });

  it('falls back to the default locale when the device reports an unsupported languageCode', () => {
    jest
      .spyOn(ExpoLocalization, 'getLocales')
      .mockReturnValue([createLocale({ languageCode: 'fr' })]);

    expect(resolveDeviceLocale()).toBe(defaultLocale);
  });

  it('falls back to the default locale when the device reports a missing languageCode', () => {
    jest
      .spyOn(ExpoLocalization, 'getLocales')
      .mockReturnValue([createLocale({ languageCode: null })]);

    expect(resolveDeviceLocale()).toBe(defaultLocale);
  });
});
