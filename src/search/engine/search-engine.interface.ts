import { SearchInput } from '../dto/search.input';
import {
  SearchResultItem,
  SearchFacets,
} from '../entities/search-result.entity';

/**
 * A catalog item flattened for the search index. One document per
 * Product / StoreProduct / Service; `id` is namespaced so the three sources
 * coexist in the single `catalog` collection.
 */
export interface CatalogDocument {
  /** Namespaced doc id: `product_<id>` | `store_<id>` | `service_<id>`. */
  id: string;
  /** Original numeric id of the source row. */
  entityId: number;
  /** SearchResultType value: PRODUCT | STORE_PRODUCT | SERVICE. */
  type: string;
  name: string;
  description?: string;
  brand?: string;
  category?: string;
  subcategory?: string;
  tags?: string[];
  images?: string[];
  price?: number;
  offerPrice?: number;
  hasOffer: boolean;
  rating?: number;
  reviewCount?: number;
  sellerId?: string;
  /** Seller's country id — results are scoped to the searcher's country. */
  country?: number;
  /** Item content language ('es' | 'en' | 'fr') — query filters by selection. */
  language: string;
  /** Unix seconds — used as the default sorting field and for NEWEST sort. */
  createdAt: number;
}

export interface EngineSearchParams {
  input: SearchInput;
  /** Selected language filter value ('es' | 'en' | 'fr'). */
  language: string;
  /** Searcher's country id (from their account). Absent for guests. */
  country?: number;
  /** Authenticated caller, whose own listings are excluded from results. */
  excludeSellerId?: string;
}

export interface EngineSearchResult {
  items: SearchResultItem[];
  /** Total matches (for pagination), not just the current page. */
  found: number;
  facets?: SearchFacets;
}

/** DI token for the active search engine implementation. */
export const SEARCH_ENGINE = Symbol('SEARCH_ENGINE');

/**
 * Swappable search backend. Resolvers/services depend on this port, not on a
 * concrete engine, so Typesense can be replaced (Cloud, OpenSearch, …) without
 * touching the GraphQL layer.
 */
export interface SearchEngine {
  /** Create the catalog collection if missing. Safe to call repeatedly. */
  ensureCollections(): Promise<void>;
  /** Upsert documents into the catalog collection. */
  indexDocuments(docs: CatalogDocument[]): Promise<void>;
  /** Remove documents (by namespaced id) from the catalog collection. */
  deleteDocuments(ids: string[]): Promise<void>;
  /** Run a query (scoped by country + language). */
  search(params: EngineSearchParams): Promise<EngineSearchResult>;
  /** Liveness probe for the health endpoint. */
  health(): Promise<boolean>;
}
