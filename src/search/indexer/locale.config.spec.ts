import {
  localeFromLanguage,
  localeFromSeller,
  collectionFor,
  DEFAULT_LOCALE,
} from './locale.config';
import { Language } from '../../graphql/enums';

describe('locale.config', () => {
  describe('localeFromLanguage', () => {
    it('maps supported languages to their locale', () => {
      expect(localeFromLanguage(Language.ES)).toBe('es');
      expect(localeFromLanguage(Language.EN)).toBe('en');
      expect(localeFromLanguage(Language.FR)).toBe('fr');
    });

    it('falls back to the default locale for languages without a collection', () => {
      expect(localeFromLanguage(Language.PT)).toBe(DEFAULT_LOCALE);
      expect(localeFromLanguage(undefined)).toBe(DEFAULT_LOCALE);
    });
  });

  describe('localeFromSeller', () => {
    it('routes Québec sellers to French', () => {
      expect(localeFromSeller({ countryId: 1, regionName: 'Québec' })).toBe(
        'fr',
      );
      expect(
        localeFromSeller({ countryId: 1, regionName: 'Quebec City' }),
      ).toBe('fr');
    });

    it('defaults when no country/region match is configured', () => {
      expect(localeFromSeller({ countryId: 999, regionName: 'Santiago' })).toBe(
        DEFAULT_LOCALE,
      );
      expect(localeFromSeller({})).toBe(DEFAULT_LOCALE);
    });
  });

  describe('collectionFor', () => {
    it('builds the per-locale collection name', () => {
      expect(collectionFor('es')).toBe('catalog_es');
      expect(collectionFor('fr')).toBe('catalog_fr');
    });
  });
});
