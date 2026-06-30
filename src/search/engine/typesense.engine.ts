import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Errors } from 'typesense';
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';
import type {
  SearchParams,
  SearchResponse,
} from 'typesense/lib/Typesense/Documents';
import { SearchType, SearchSortBy } from '../dto/search.input';
import {
  SearchResultItem,
  SearchResultType,
  SearchFacets,
  SearchFacet,
} from '../entities/search-result.entity';
import {
  SearchEngine,
  CatalogDocument,
  EngineSearchParams,
  EngineSearchResult,
} from './search-engine.interface';
import { CATALOG_COLLECTION } from '../indexer/locale.config';

/** Fields matched by a free-text query, highest-weight first. */
const QUERY_BY = 'name,brand,category,tags,description';
const QUERY_BY_WEIGHTS = '5,3,3,2,1';

@Injectable()
export class TypesenseSearchEngine implements SearchEngine {
  private readonly logger = new Logger(TypesenseSearchEngine.name);
  private readonly client: Client;

  constructor(private readonly config: ConfigService) {
    this.client = new Client({
      nodes: [
        {
          host: this.config.get<string>('typesense.host', 'localhost'),
          port: this.config.get<number>('typesense.port', 8108),
          protocol: this.config.get<string>('typesense.protocol', 'http'),
        },
      ],
      apiKey: this.config.get<string>('typesense.apiKey', 'dev-typesense-key'),
      connectionTimeoutSeconds: this.config.get<number>(
        'typesense.connectionTimeoutSeconds',
        5,
      ),
    });
  }

  async ensureCollections(): Promise<void> {
    try {
      await this.client.collections(CATALOG_COLLECTION).retrieve();
    } catch (error) {
      if (error instanceof Errors.ObjectNotFound) {
        await this.client.collections().create(this.schema());
        this.logger.log(`Created Typesense collection ${CATALOG_COLLECTION}`);
      } else {
        throw error;
      }
    }
  }

  async indexDocuments(docs: CatalogDocument[]): Promise<void> {
    if (docs.length === 0) return;
    try {
      await this.client
        .collections<CatalogDocument>(CATALOG_COLLECTION)
        .documents()
        .import(docs, { action: 'upsert' });
    } catch (error) {
      if (error instanceof Errors.ImportError) {
        this.logger.error(
          `Some documents failed to index into ${CATALOG_COLLECTION}`,
        );
      }
      throw error;
    }
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const filter = `id:[${ids.map((id) => `\`${id}\``).join(',')}]`;
    await this.client
      .collections(CATALOG_COLLECTION)
      .documents()
      .delete({ filter_by: filter });
  }

  async search(params: EngineSearchParams): Promise<EngineSearchResult> {
    const { input } = params;
    const page = input.page ?? 1;
    const perPage = input.pageSize ?? 20;

    const searchParams: SearchParams<CatalogDocument> = {
      q: input.query?.trim() || '*',
      query_by: QUERY_BY,
      query_by_weights: QUERY_BY_WEIGHTS,
      filter_by: this.buildFilterBy(params),
      sort_by: this.buildSortBy(input.sortBy),
      facet_by: 'type,category,tags',
      max_facet_values: 20,
      page,
      per_page: perPage,
      highlight_full_fields: 'name,description',
    };

    const res: SearchResponse<CatalogDocument> = await this.client
      .collections<CatalogDocument>(CATALOG_COLLECTION)
      .documents()
      .search(searchParams, {});

    return {
      items: (res.hits ?? []).map((hit) => this.toResultItem(hit)),
      found: res.found ?? 0,
      facets: this.toFacets(res),
    };
  }

  async health(): Promise<boolean> {
    try {
      const res = await this.client.health.retrieve();
      return res.ok === true;
    } catch {
      return false;
    }
  }

  // ---- helpers -------------------------------------------------------------

  private schema(): CollectionCreateSchema {
    return {
      name: CATALOG_COLLECTION,
      fields: [
        { name: 'entityId', type: 'int64' },
        { name: 'type', type: 'string', facet: true },
        { name: 'name', type: 'string' },
        { name: 'description', type: 'string', optional: true },
        { name: 'brand', type: 'string', optional: true },
        { name: 'category', type: 'string', optional: true, facet: true },
        { name: 'subcategory', type: 'string', optional: true },
        { name: 'tags', type: 'string[]', optional: true, facet: true },
        { name: 'images', type: 'string[]', optional: true, index: false },
        { name: 'price', type: 'float', optional: true },
        { name: 'offerPrice', type: 'float', optional: true },
        { name: 'hasOffer', type: 'bool', facet: true },
        { name: 'rating', type: 'float', optional: true },
        { name: 'reviewCount', type: 'int32', optional: true },
        { name: 'sellerId', type: 'string', optional: true, facet: true },
        { name: 'country', type: 'int32', optional: true, facet: true },
        { name: 'language', type: 'string', facet: true },
        { name: 'createdAt', type: 'int64' },
      ],
      default_sorting_field: 'createdAt',
    };
  }

  /** Wrap a string filter value in backticks so special chars are safe. */
  private quote(value: string): string {
    return `\`${value}\``;
  }

  private buildFilterBy({
    input,
    language,
    country,
    excludeSellerId,
  }: EngineSearchParams): string {
    const clauses: string[] = [];

    // Scope to the client-selected language and country (both sent on every
    // query). A bilingual market like Canada keeps its en and fr items in this
    // same collection; the language clause is what picks the right slice. An
    // unresolved country (unknown code) is omitted so results span countries
    // rather than silently return nothing.
    clauses.push(`language:=${this.quote(language)}`);
    if (country != null) clauses.push(`country:=${country}`);

    if (excludeSellerId) {
      clauses.push(`sellerId:!=${this.quote(excludeSellerId)}`);
    }

    if (input.type === SearchType.PRODUCTS) {
      clauses.push(
        `type:[${SearchResultType.PRODUCT},${SearchResultType.STORE_PRODUCT}]`,
      );
    } else if (input.type === SearchType.SERVICES) {
      clauses.push(`type:=${SearchResultType.SERVICE}`);
    }

    if (input.minPrice != null) clauses.push(`price:>=${input.minPrice}`);
    if (input.maxPrice != null) clauses.push(`price:<=${input.maxPrice}`);
    if (input.hasOffer != null) clauses.push(`hasOffer:=${input.hasOffer}`);
    if (input.minRating != null) clauses.push(`rating:>=${input.minRating}`);

    if (input.categories?.length) {
      const values = input.categories.map((c) => this.quote(c)).join(',');
      clauses.push(`category:[${values}]`);
    }
    if (input.tags?.length) {
      const values = input.tags.map((t) => this.quote(t)).join(',');
      clauses.push(`tags:[${values}]`);
    }

    return clauses.join(' && ');
  }

  private buildSortBy(sortBy?: SearchSortBy): string {
    switch (sortBy) {
      case SearchSortBy.PRICE_ASC:
        return 'price:asc';
      case SearchSortBy.PRICE_DESC:
        return 'price:desc';
      case SearchSortBy.NEWEST:
        return 'createdAt:desc';
      case SearchSortBy.RATING:
        return 'rating:desc';
      case SearchSortBy.POPULARITY:
        return 'reviewCount:desc';
      case SearchSortBy.RELEVANCE:
      default:
        return '_text_match:desc,createdAt:desc';
    }
  }

  private toResultItem(
    hit: NonNullable<SearchResponse<CatalogDocument>['hits']>[number],
  ): SearchResultItem {
    const d = hit.document;
    const highlight = hit.highlight as
      | { name?: { snippet?: string }; description?: { snippet?: string } }
      | undefined;
    return {
      id: d.entityId,
      type: d.type as SearchResultType,
      name: d.name,
      description: d.description,
      price: d.price,
      offerPrice: d.offerPrice,
      hasOffer: d.hasOffer ?? false,
      images: d.images ?? [],
      category: d.category,
      subcategory: d.subcategory,
      rating: d.rating,
      reviewCount: d.reviewCount,
      sellerId: d.sellerId,
      sellerName: undefined,
      tags: d.tags ?? [],
      relevanceScore: typeof hit.text_match === 'number' ? hit.text_match : 0,
      highlightedName: highlight?.name?.snippet,
      highlightedDescription: highlight?.description?.snippet,
    };
  }

  private toFacets(res: SearchResponse<CatalogDocument>): SearchFacets {
    const byField = (field: string): SearchFacet[] =>
      (res.facet_counts ?? [])
        .find((f) => f.field_name === field)
        ?.counts.map((c) => ({ name: c.value, count: c.count })) ?? [];

    return {
      types: byField('type'),
      categories: byField('category'),
      tags: byField('tags'),
    };
  }
}
