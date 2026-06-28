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
    it('routes Québec sellers to French regardless of country', () => {
      expect(languageFromSeller({ countryId: 2, regionName: 'Québec' })).toBe(
        'fr',
      );
      expect(
        languageFromSeller({ countryId: 2, regionName: 'Quebec City' }),
      ).toBe('fr');
    });

    it('defaults to ES when no country/region mapping matches', () => {
      expect(
        languageFromSeller({ countryId: 999, regionName: 'Santiago' }),
      ).toBe(DEFAULT_LANGUAGE);
      expect(languageFromSeller({})).toBe(DEFAULT_LANGUAGE);
    });
  });

  it('uses a single catalog collection', () => {
    expect(CATALOG_COLLECTION).toBe('catalog');
  });
});
