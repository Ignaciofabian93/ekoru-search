import { Language } from '../../graphql/enums';

/**
 * Single Typesense collection holding all catalog items across every market.
 * Scoping is done with `country` + `language` filter fields, not separate
 * collections — so a bilingual market (e.g. Canada: en + fr) lives in one place
 * and a query just filters to the country + the language the user selected.
 */
export const CATALOG_COLLECTION = 'catalog';

/** Content languages an item can be indexed under. */
export const SUPPORTED_LANGUAGES = ['es', 'en', 'fr'] as const;
export type ContentLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: ContentLanguage = 'es';

function isLanguage(value: string): value is ContentLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * The GraphQL `language` arg → the `language` filter value used at query time.
 * The app always sends the user's selected language; defaults to ES.
 */
export function languageFilter(language?: Language | null): string {
  return language ? language.toLowerCase() : DEFAULT_LANGUAGE;
}

/**
 * country id → content language, parsed from env `COUNTRY_LANGUAGE_MAP`
 * (e.g. "1:es,2:en,5:fr"). Country ids are environment-specific, so this is
 * configured per deployment rather than hardcoded.
 */
function parseCountryMap(raw?: string): Record<number, ContentLanguage> {
  const map: Record<number, ContentLanguage> = {};
  if (!raw) return map;
  for (const pair of raw.split(',')) {
    const [id, lang] = pair.split(':').map((s) => s.trim().toLowerCase());
    const n = Number(id);
    if (!Number.isNaN(n) && lang && isLanguage(lang)) map[n] = lang;
  }
  return map;
}

const COUNTRY_LANGUAGE = parseCountryMap(process.env.COUNTRY_LANGUAGE_MAP);

/**
 * Derive an item's content language at index time from its seller's
 * country/region. This is the single onboarding point for new markets:
 *  - a region named like "Québec"/"Quebec" → `fr` (Canadian French market);
 *  - else the seller's country via `COUNTRY_LANGUAGE_MAP`;
 *  - else `DEFAULT_LANGUAGE`.
 */
export function languageFromSeller(seller: {
  countryId?: number | null;
  regionName?: string | null;
}): ContentLanguage {
  const region = (seller.regionName ?? '').toLowerCase();
  if (region.includes('quebec') || region.includes('québec')) return 'fr';
  if (seller.countryId != null && COUNTRY_LANGUAGE[seller.countryId]) {
    return COUNTRY_LANGUAGE[seller.countryId];
  }
  return DEFAULT_LANGUAGE;
}
