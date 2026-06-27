import { Language } from '../../graphql/enums';

/**
 * Locales that have their own Typesense collection (`catalog_<locale>`).
 * Content is single-language per item, so each item lives in exactly one of
 * these collections and the `language` arg routes a query to one of them.
 */
export const SUPPORTED_LOCALES = ['es', 'en', 'fr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';

/** Typesense collection name for a locale, e.g. `catalog_es`. */
export function collectionFor(locale: Locale): string {
  return `catalog_${locale}`;
}

const LANGUAGE_TO_LOCALE: Partial<Record<Language, Locale>> = {
  [Language.ES]: 'es',
  [Language.EN]: 'en',
  [Language.FR]: 'fr',
};

/**
 * Which locale's collection to query for a given GraphQL `language` arg.
 * Languages without a dedicated collection (PT/DE) fall back to the default
 * market until those collections are introduced.
 */
export function localeFromLanguage(language?: Language | null): Locale {
  if (!language) return DEFAULT_LOCALE;
  return LANGUAGE_TO_LOCALE[language] ?? DEFAULT_LOCALE;
}

function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * country id -> locale overrides, parsed from env `LOCALE_COUNTRY_MAP`
 * (e.g. "1:es,2:en,3:fr"). Country ids are environment-specific, so this is
 * configured per deployment rather than hardcoded.
 */
function parseCountryMap(raw?: string): Record<number, Locale> {
  const map: Record<number, Locale> = {};
  if (!raw) return map;
  for (const pair of raw.split(',')) {
    const [id, loc] = pair.split(':').map((s) => s.trim().toLowerCase());
    const n = Number(id);
    if (!Number.isNaN(n) && loc && isLocale(loc)) {
      map[n] = loc;
    }
  }
  return map;
}

const COUNTRY_ID_TO_LOCALE = parseCountryMap(process.env.LOCALE_COUNTRY_MAP);

/**
 * Derive an item's locale from its seller's country/region at index time.
 * This is the single onboarding point for new markets:
 *  - a region named like "Québec"/"Quebec" → `fr` (Canada French market);
 *  - otherwise the seller's country via `LOCALE_COUNTRY_MAP`;
 *  - otherwise `DEFAULT_LOCALE`.
 */
export function localeFromSeller(seller: {
  countryId?: number | null;
  regionName?: string | null;
}): Locale {
  const region = (seller.regionName ?? '').toLowerCase();
  if (region.includes('quebec') || region.includes('québec')) return 'fr';
  if (seller.countryId != null && COUNTRY_ID_TO_LOCALE[seller.countryId]) {
    return COUNTRY_ID_TO_LOCALE[seller.countryId];
  }
  return DEFAULT_LOCALE;
}
