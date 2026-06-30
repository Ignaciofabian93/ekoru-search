import {
  languageFilter,
  languageFromSeller,
  CATALOG_COLLECTION,
  DEFAULT_LANGUAGE,
} from './locale.config';
import { Language } from '../../graphql/enums';

describe('locale.config', () => {
  describe('languageFilter', () => {
    it('maps the GraphQL language arg to a lowercase filter value', () => {
      expect(languageFilter(Language.ES)).toBe('es');
      expect(languageFilter(Language.EN)).toBe('en');
      expect(languageFilter(Language.FR)).toBe('fr');
    });

    it('defaults to ES when no language is provided', () => {
      expect(languageFilter(undefined)).toBe(DEFAULT_LANGUAGE);
    });
  });

  describe('languageFromSeller', () => {
    it("uses the seller's explicit content language, overriding country", () => {
      expect(languageFromSeller({ contentLanguage: 'FR', countryId: 1 })).toBe(
        'fr',
      );
      expect(
        languageFromSeller({ contentLanguage: 'en', countryId: 999 }),
      ).toBe('en');
    });

    it('ignores content languages search does not index (PT/DE)', () => {
      // Falls through to the country/default rules rather than indexing as pt/de.
      expect(
        languageFromSeller({ contentLanguage: 'PT', countryId: 999 }),
      ).toBe(DEFAULT_LANGUAGE);
    });

    it('falls back to ES when no content language or country mapping matches', () => {
      // COUNTRY_LANGUAGE_MAP is unset in tests, so the country rule yields ES.
      expect(languageFromSeller({ countryId: 2 })).toBe(DEFAULT_LANGUAGE);
      expect(languageFromSeller({})).toBe(DEFAULT_LANGUAGE);
    });
  });

  it('uses a single catalog collection', () => {
    expect(CATALOG_COLLECTION).toBe('catalog');
  });
});
