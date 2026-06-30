import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Language } from '../graphql/enums';
import {
  SearchInput,
  SearchType,
  SearchSortBy,
  AutocompleteInput,
  RecommendationInput,
  TrackSearchClickInput,
  TrackItemViewInput,
} from './dto/search.input';
import {
  SearchResponse,
  SearchResultItem,
  SearchResultType,
  SearchFacets,
  AutocompleteResponse,
  AutocompleteItem,
  RecommendationResponse,
  RecommendationItem,
  TrendingResponse,
  TrendingSearch,
} from './entities/search-result.entity';
import { FullTextSearchStrategy } from './strategies/fulltext-search.strategy';
import {
  SEARCH_ENGINE,
  type SearchEngine,
} from './engine/search-engine.interface';
import { languageFilter } from './indexer/locale.config';

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fullTextSearch: FullTextSearchStrategy,
    private readonly config: ConfigService,
    @Inject(SEARCH_ENGINE) private readonly engine: SearchEngine,
  ) {}

  /**
   * Run a catalog search. Routes to the configured engine: Typesense (default,
   * typo-tolerant, locale-routed) or the legacy Postgres full-text strategy
   * (`SEARCH_ENGINE=postgres`, kept for rollback).
   */
  async search(args: {
    input: SearchInput;
    userId?: string;
    sessionId?: string;
    excludeSellerId?: string;
    language?: Language;
    /** Client-selected market as an ISO country code (e.g. "CA"). */
    countryCode?: string;
  }): Promise<SearchResponse> {
    if (this.config.get<string>('searchEngine') === 'postgres') {
      return this.searchViaPostgres(args);
    }
    return this.searchViaEngine(args);
  }

  /**
   * Typesense-backed search. Scopes results to the `language` and `country`
   * the client selected: the country code is resolved to its Country id and
   * the catalog is filtered to that market + language. The same path serves web
   * and mobile, authenticated or guest — the seller id only excludes own items.
   */
  private async searchViaEngine({
    input,
    userId,
    sessionId,
    excludeSellerId,
    language,
    countryCode,
  }: {
    input: SearchInput;
    userId?: string;
    sessionId?: string;
    excludeSellerId?: string;
    language?: Language;
    countryCode?: string;
  }): Promise<SearchResponse> {
    const startTime = Date.now();
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;

    // Market scope comes straight from the client's country code (ISO → id).
    const country = await this.resolveCountryIdFromCode(countryCode);

    const { items, found, facets } = await this.engine.search({
      input,
      language: languageFilter(language),
      country,
      excludeSellerId,
    });

    const totalPages = Math.ceil(found / pageSize);
    const searchId = await this.logSearch(
      input.query,
      found,
      userId,
      sessionId,
    );

    return {
      searchId: searchId ?? undefined,
      items,
      pageInfo: {
        currentPage: page,
        pageSize,
        totalItems: found,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      facets,
      query: input.query,
      processingTimeMs: Date.now() - startTime,
      suggestions: [],
      correctedQuery: undefined,
    };
  }

  /**
   * Map an ISO country code (e.g. "CA") to its Country id, to scope search to
   * the client's selected market. Case-insensitive; returns undefined for a
   * missing/unknown code (the query then spans countries).
   */
  private async resolveCountryIdFromCode(
    code?: string,
  ): Promise<number | undefined> {
    if (!code) return undefined;
    try {
      const rows = await this.prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM "Country" WHERE code = ${code.toUpperCase()} LIMIT 1
      `;
      return rows[0]?.id ?? undefined;
    } catch {
      return undefined;
    }
  }

  /** Legacy PostgreSQL full-text search path (rollback via SEARCH_ENGINE=postgres). */
  private async searchViaPostgres({
    input,
    userId,
    sessionId,
    excludeSellerId,
  }: {
    input: SearchInput;
    userId?: string;
    sessionId?: string;
    excludeSellerId?: string;
  }): Promise<SearchResponse> {
    const startTime = Date.now();
    const {
      query,
      type = SearchType.ALL,
      page = 1,
      pageSize = 20,
      sortBy = SearchSortBy.RELEVANCE,
      minPrice,
      maxPrice,
      categories,
      tags,
      hasOffer,
      minRating,
    } = input;

    // Normalize and process query
    const normalizedQuery = this.normalizeQuery(query);
    const searchTerms = this.tokenize(normalizedQuery);
    const correctedQuery = await this.spellCheck(normalizedQuery);

    // Search products and services based on type using full-text search.
    // `excludeSellerId` hides the current user's own listings from their results.
    const filters = {
      minPrice,
      maxPrice,
      categories,
      tags,
      hasOffer,
      minRating,
      excludeSellerId,
    };

    const [productResults, storeProductResults, serviceResults] =
      await Promise.all([
        type !== SearchType.SERVICES && searchTerms.length > 0
          ? this.fullTextSearch.searchProducts(searchTerms, filters)
          : Promise.resolve([]),
        type !== SearchType.SERVICES && searchTerms.length > 0
          ? this.fullTextSearch.searchStoreProducts(searchTerms, filters)
          : Promise.resolve([]),
        type !== SearchType.PRODUCTS && searchTerms.length > 0
          ? this.fullTextSearch.searchServices(searchTerms, filters)
          : Promise.resolve([]),
      ]);

    // Combine and score results
    let allResults = [
      ...productResults,
      ...storeProductResults,
      ...serviceResults,
    ];

    // Calculate relevance scores for each result
    allResults = allResults.map((item) => ({
      ...item,
      relevanceScore: this.calculateRelevanceScore(item, searchTerms),
    }));

    // Sort results
    allResults = this.sortResults(allResults, sortBy);

    // Pagination
    const totalItems = allResults.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (page - 1) * pageSize;
    const paginatedResults = allResults.slice(skip, skip + pageSize);

    // Add highlighting
    const highlightedResults = paginatedResults.map((item) =>
      this.addHighlighting(item, searchTerms),
    );

    // Generate facets
    const facets = this.generateFacets(allResults);

    // Suggestions/autocomplete are out of scope; always empty.
    const suggestions: string[] = [];

    // Log search for analytics and get searchId
    const searchId = await this.logSearch(query, totalItems, userId, sessionId);

    const processingTimeMs = Date.now() - startTime;

    return {
      searchId: searchId ?? undefined, // Convert null to undefined
      items: highlightedResults,
      pageInfo: {
        currentPage: page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      facets,
      query,
      processingTimeMs,
      suggestions,
      correctedQuery:
        correctedQuery !== normalizedQuery ? correctedQuery : undefined,
    };
  }

  async autocomplete(input: AutocompleteInput): Promise<AutocompleteResponse> {
    const { query, limit = 8, type = SearchType.ALL } = input;
    const normalizedQuery = this.normalizeQuery(query);

    if (normalizedQuery.length < 2) {
      return {
        suggestions: [],
        recentSearches: [],
        popularSearches: await this.getPopularSearches(5),
      };
    }

    const suggestions: AutocompleteItem[] = [];

    // Search for matching products
    if (type !== SearchType.SERVICES) {
      const productPattern = `%${normalizedQuery}%`;
      const productTake = Math.floor(limit / 2);
      const products = await this.prisma.$queryRaw<
        { id: number; name: string; category: string | null }[]
      >`
        SELECT p.id, p.name, pc."productCategoryName" as category
        FROM "Product" p
        LEFT JOIN "ProductCategory" pc ON p."productCategoryId" = pc.id
        WHERE p."isActive" = true
          AND p."deletedAt" IS NULL
          AND (p.name ILIKE ${productPattern} OR p.brand ILIKE ${productPattern})
        LIMIT ${Prisma.raw(String(productTake))}
      `;

      products.forEach((p) => {
        suggestions.push({
          text: p.name,
          type: SearchResultType.PRODUCT,
          itemId: p.id,
          category: p.category ?? undefined,
          score: this.calculateAutocompleteScore(p.name, normalizedQuery),
        });
      });
    }

    // Search for matching services
    if (type !== SearchType.PRODUCTS) {
      const servicePattern = `%${normalizedQuery}%`;
      const serviceTake = Math.floor(limit / 2);
      const services = await this.prisma.$queryRaw<
        { id: number; name: string }[]
      >`
        SELECT id, name
        FROM "Service"
        WHERE "isActive" = true
          AND (name ILIKE ${servicePattern} OR ${normalizedQuery} = ANY(tags))
        LIMIT ${Prisma.raw(String(serviceTake))}
      `;

      services.forEach((s) => {
        suggestions.push({
          text: s.name,
          type: SearchResultType.SERVICE,
          itemId: s.id,
          category: undefined,
          score: this.calculateAutocompleteScore(s.name, normalizedQuery),
        });
      });
    }

    // Sort by score and limit
    suggestions.sort((a, b) => b.score - a.score);

    return {
      suggestions: suggestions.slice(0, limit),
      recentSearches: [],
      popularSearches: await this.getPopularSearches(3),
    };
  }

  async getRecommendations(
    input: RecommendationInput,
  ): Promise<RecommendationResponse> {
    const { query, viewedProductIds, viewedServiceIds, limit = 10 } = input;
    const recommendations: RecommendationItem[] = [];

    // Based on query - similar items
    if (query) {
      const searchTerms = this.tokenize(this.normalizeQuery(query));
      const products = await this.searchProducts(searchTerms, {});
      const services = await this.searchServices(searchTerms, {});

      products.slice(0, Math.floor(limit / 2)).forEach((p) => {
        recommendations.push({
          id: p.id,
          type: p.type,
          name: p.name,
          description: p.description,
          price: p.price,
          images: p.images,
          rating: p.rating,
          reason: `Similar to "${query}"`,
          score: p.relevanceScore,
        });
      });

      services.slice(0, Math.floor(limit / 2)).forEach((s) => {
        recommendations.push({
          id: s.id,
          type: s.type,
          name: s.name,
          description: s.description,
          price: s.price,
          images: s.images,
          rating: s.rating,
          reason: `Related service`,
          score: s.relevanceScore,
        });
      });
    }

    // Based on viewed products - similar category items
    if (viewedProductIds && viewedProductIds.length > 0) {
      const viewedProducts = await this.prisma.$queryRaw<
        { productCategoryId: number; interests: string[] }[]
      >`
        SELECT "productCategoryId", interests
        FROM "Product"
        WHERE id = ANY(${viewedProductIds})
      `;

      const categoryIds = [
        ...new Set(viewedProducts.map((p) => Number(p.productCategoryId))),
      ];
      const interests = [
        ...new Set(viewedProducts.flatMap((p) => p.interests || [])),
      ];

      const simProductLimit = Math.floor(limit / 2);
      let similarProducts: {
        id: number;
        name: string;
        description: string | null;
        price: number;
        images: string[];
      }[] = [];

      if (categoryIds.length > 0 || interests.length > 0) {
        const catFilter =
          categoryIds.length > 0
            ? Prisma.sql`p."productCategoryId" = ANY(${categoryIds})`
            : Prisma.sql`false`;
        const intFilter =
          interests.length > 0
            ? Prisma.sql`p.interests && ${interests}`
            : Prisma.sql`false`;
        similarProducts = await this.prisma.$queryRaw<
          {
            id: number;
            name: string;
            description: string | null;
            price: number;
            images: string[];
          }[]
        >`
          SELECT p.id, p.name, p.description, p.price, p.images
          FROM "Product" p
          WHERE p."isActive" = true
            AND p."deletedAt" IS NULL
            AND p.id != ALL(${viewedProductIds})
            AND (${catFilter} OR ${intFilter})
          ORDER BY p."createdAt" DESC
          LIMIT ${Prisma.raw(String(simProductLimit))}
        `;
      }

      similarProducts.forEach((p) => {
        recommendations.push({
          id: p.id,
          type: SearchResultType.PRODUCT,
          name: p.name,
          description: p.description || undefined,
          price: p.price,
          images: p.images || [],
          rating: undefined,
          reason: 'Based on your browsing history',
          score: 0.8,
        });
      });
    }

    // Based on viewed services - similar subcategory
    if (viewedServiceIds && viewedServiceIds.length > 0) {
      const viewedServices = await this.prisma.$queryRaw<
        { subcategoryId: number; tags: string[] }[]
      >`
        SELECT "subcategoryId", tags
        FROM "Service"
        WHERE id = ANY(${viewedServiceIds})
      `;

      const subcategoryIds = [
        ...new Set(viewedServices.map((s) => Number(s.subcategoryId))),
      ];
      const allTags = [...new Set(viewedServices.flatMap((s) => s.tags || []))];

      const simServiceLimit = Math.floor(limit / 2);
      let similarServices: {
        id: number;
        name: string;
        description: string | null;
        basePrice: number | null;
        images: string[];
      }[] = [];

      if (subcategoryIds.length > 0 || allTags.length > 0) {
        const subFilter =
          subcategoryIds.length > 0
            ? Prisma.sql`s."subcategoryId" = ANY(${subcategoryIds})`
            : Prisma.sql`false`;
        const tagFilter =
          allTags.length > 0
            ? Prisma.sql`s.tags && ${allTags}`
            : Prisma.sql`false`;
        similarServices = await this.prisma.$queryRaw<
          {
            id: number;
            name: string;
            description: string | null;
            basePrice: number | null;
            images: string[];
          }[]
        >`
          SELECT s.id, s.name, s.description, s."basePrice", s.images
          FROM "Service" s
          WHERE s."isActive" = true
            AND s.id != ALL(${viewedServiceIds})
            AND (${subFilter} OR ${tagFilter})
          ORDER BY s."createdAt" DESC
          LIMIT ${Prisma.raw(String(simServiceLimit))}
        `;
      }

      similarServices.forEach((s) => {
        recommendations.push({
          id: s.id,
          type: SearchResultType.SERVICE,
          name: s.name,
          description: s.description || undefined,
          price: s.basePrice || undefined,
          images: s.images || [],
          reason: 'Similar to services you viewed',
          score: 0.75,
        });
      });
    }

    // Sort by score and deduplicate
    recommendations.sort((a, b) => b.score - a.score);
    const uniqueRecommendations =
      this.deduplicateRecommendations(recommendations);

    return {
      items: uniqueRecommendations.slice(0, limit),
      basedOn:
        query || (viewedProductIds?.length ? 'browsing history' : undefined),
    };
  }

  async getTrending(): Promise<TrendingResponse> {
    // Get trending searches from logs
    const trendingSearches = await this.prisma.searchLog.groupBy({
      by: ['query'],
      _count: { query: true },
      orderBy: { _count: { query: 'desc' } },
      take: 10,
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
      },
    });

    const searches: TrendingSearch[] = trendingSearches.map((s, index) => ({
      query: s.query,
      searchCount: s._count.query,
      trendScore: 1 - index * 0.1,
    }));

    // Get trending products (most viewed/sold recently)
    const trendingProducts = await this.prisma.$queryRaw<
      {
        id: number;
        name: string;
        description: string | null;
        price: number;
        images: string[];
      }[]
    >`
      SELECT p.id, p.name, p.description, p.price, p.images
      FROM "Product" p
      WHERE p."isActive" = true AND p."deletedAt" IS NULL
      ORDER BY p."createdAt" DESC
      LIMIT 6
    `;

    const products: RecommendationItem[] = trendingProducts.map((p) => ({
      id: p.id,
      type: SearchResultType.PRODUCT,
      name: p.name,
      description: p.description || undefined,
      price: p.price,
      images: p.images || [],
      rating: undefined,
      reason: 'Trending now',
      score: 1,
    }));

    // Get trending services
    const trendingServices = await this.prisma.$queryRaw<
      {
        id: number;
        name: string;
        description: string | null;
        basePrice: number | null;
        images: string[];
      }[]
    >`
      SELECT id, name, description, "basePrice", images
      FROM "Service"
      WHERE "isActive" = true
      ORDER BY "createdAt" DESC
      LIMIT 6
    `;

    const services: RecommendationItem[] = trendingServices.map((s) => ({
      id: s.id,
      type: SearchResultType.SERVICE,
      name: s.name,
      description: s.description || undefined,
      price: s.basePrice || undefined,
      images: s.images || [],
      reason: 'Popular service',
      score: 1,
    }));

    return { searches, products, services };
  }

  // ==================== PRIVATE HELPER METHODS ====================

  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .trim()
      .replace(/[^\w\sáéíóúñü]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  private tokenize(query: string): string[] {
    const stopWords = new Set([
      'el',
      'la',
      'los',
      'las',
      'un',
      'una',
      'unos',
      'unas',
      'de',
      'del',
      'al',
      'a',
      'en',
      'con',
      'por',
      'para',
      'y',
      'o',
      'que',
      'es',
      'son',
      'the',
      'a',
      'an',
      'and',
      'or',
      'of',
      'to',
      'in',
      'for',
    ]);

    return query
      .split(' ')
      .filter((word) => word.length > 1 && !stopWords.has(word));
  }

  private async searchProducts(
    searchTerms: string[],
    filters: {
      minPrice?: number;
      maxPrice?: number;
      categories?: string[];
      tags?: string[];
      hasOffer?: boolean;
      minRating?: number;
    },
  ): Promise<SearchResultItem[]> {
    return this.fullTextSearch.searchProducts(searchTerms, filters);
  }

  private async searchServices(
    searchTerms: string[],
    filters: {
      minPrice?: number;
      maxPrice?: number;
      categories?: string[];
      tags?: string[];
      minRating?: number;
    },
  ): Promise<SearchResultItem[]> {
    return this.fullTextSearch.searchServices(searchTerms, filters);
  }

  private calculateRelevanceScore(
    item: SearchResultItem,
    searchTerms: string[],
  ): number {
    let score = 0;
    const nameNormalized = item.name.toLowerCase();
    const descNormalized = (item.description || '').toLowerCase();

    for (const term of searchTerms) {
      // Exact match in name (highest weight)
      if (nameNormalized === term) score += 100;
      // Name starts with term
      else if (nameNormalized.startsWith(term)) score += 50;
      // Name contains term
      else if (nameNormalized.includes(term)) score += 30;
      // Description contains term
      if (descNormalized.includes(term)) score += 10;
      // Tags contain term
      if (item.tags?.some((t) => t.toLowerCase().includes(term))) score += 15;
      // Category matches
      if (item.category?.toLowerCase().includes(term)) score += 20;
    }

    // Boost for items with offers
    if (item.hasOffer) score += 5;

    // Boost for highly rated items
    if (item.rating && item.rating >= 4) score += 10;

    // Boost for items with reviews
    if (item.reviewCount && item.reviewCount > 10) score += 5;

    return score;
  }

  private sortResults(
    results: SearchResultItem[],
    sortBy: SearchSortBy,
  ): SearchResultItem[] {
    switch (sortBy) {
      case SearchSortBy.RELEVANCE:
        return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      case SearchSortBy.PRICE_ASC:
        return results.sort((a, b) => (a.price || 0) - (b.price || 0));
      case SearchSortBy.PRICE_DESC:
        return results.sort((a, b) => (b.price || 0) - (a.price || 0));
      case SearchSortBy.RATING:
        return results.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      case SearchSortBy.NEWEST:
        return results; // Would need createdAt field
      case SearchSortBy.POPULARITY:
        return results.sort(
          (a, b) => (b.reviewCount || 0) - (a.reviewCount || 0),
        );
      default:
        return results;
    }
  }

  private addHighlighting(
    item: SearchResultItem,
    searchTerms: string[],
  ): SearchResultItem {
    let highlightedName = item.name;
    let highlightedDescription = item.description || '';

    for (const term of searchTerms) {
      const regex = new RegExp(`(${term})`, 'gi');
      highlightedName = highlightedName.replace(regex, '<mark>$1</mark>');
      highlightedDescription = highlightedDescription.replace(
        regex,
        '<mark>$1</mark>',
      );
    }

    return {
      ...item,
      highlightedName,
      highlightedDescription: highlightedDescription || undefined,
    };
  }

  private generateFacets(results: SearchResultItem[]): SearchFacets {
    const categoryCount = new Map<string, number>();
    const typeCount = new Map<string, number>();
    const tagCount = new Map<string, number>();

    for (const item of results) {
      // Categories
      if (item.category) {
        categoryCount.set(
          item.category,
          (categoryCount.get(item.category) || 0) + 1,
        );
      }

      // Types
      typeCount.set(item.type, (typeCount.get(item.type) || 0) + 1);

      // Tags
      item.tags?.forEach((tag) => {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      });
    }

    return {
      categories: Array.from(categoryCount.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      types: Array.from(typeCount.entries()).map(([name, count]) => ({
        name,
        count,
      })),
      tags: Array.from(tagCount.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
      priceRanges: this.generatePriceRanges(results),
    };
  }

  private generatePriceRanges(
    results: SearchResultItem[],
  ): { name: string; count: number }[] {
    const ranges = [
      { name: '$0 - $10,000', min: 0, max: 10000 },
      { name: '$10,000 - $50,000', min: 10000, max: 50000 },
      { name: '$50,000 - $100,000', min: 50000, max: 100000 },
      { name: '$100,000+', min: 100000, max: Infinity },
    ];

    return ranges.map((range) => ({
      name: range.name,
      count: results.filter(
        (r) =>
          r.price !== undefined && r.price >= range.min && r.price < range.max,
      ).length,
    }));
  }

  private spellCheck(query: string): Promise<string> {
    // Simple spell check - could be enhanced with a proper library
    // For now, return the original query
    return Promise.resolve(query);
  }

  private calculateAutocompleteScore(text: string, query: string): number {
    const normalized = text.toLowerCase();
    if (normalized === query) return 100;
    if (normalized.startsWith(query)) return 80;
    if (normalized.includes(query)) return 50;
    return 20;
  }

  private async getPopularSearches(limit: number): Promise<string[]> {
    try {
      const popular = await this.prisma.searchLog.groupBy({
        by: ['query'],
        _count: { query: true },
        orderBy: { _count: { query: 'desc' } },
        take: limit,
        where: {
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      });
      return popular.map((p) => p.query);
    } catch {
      return [];
    }
  }

  private async logSearch(
    query: string,
    resultCount: number,
    userId?: string,
    sessionId?: string,
  ): Promise<number | null> {
    try {
      const searchLog = await this.prisma.searchLog.create({
        data: {
          query: query.toLowerCase().trim(),
          resultCount,
          userId,
          sessionId,
          createdAt: new Date(),
        },
      });

      // Update user search history (if table exists)
      if (userId && this.prisma['userSearchHistory']) {
        await this.prisma['userSearchHistory'].create({
          data: {
            userId,
            query: query.toLowerCase().trim(),
            resultCount,
            searchedAt: new Date(),
          },
        });
      }

      // Update popular searches (if table exists)
      if (this.prisma['popularSearch']) {
        await this.prisma['popularSearch'].upsert({
          where: { query: query.toLowerCase().trim() },
          update: {
            searchCount: { increment: 1 },
            lastSearched: new Date(),
          },
          create: {
            query: query.toLowerCase().trim(),
            searchCount: 1,
            clickCount: 0,
          },
        });
      }

      return searchLog.id;
    } catch {
      // Silently fail if table doesn't exist yet
      return null;
    }
  }

  async trackClick(input: TrackSearchClickInput): Promise<boolean> {
    try {
      await this.prisma.searchClick.create({
        data: {
          searchId: input.searchId,
          itemId: input.itemId,
          itemType: input.itemType,
          position: input.position,
          userId: input.userId,
          clickedAt: new Date(),
        },
      });

      // Update popular search click count
      const searchLog = await this.prisma.searchLog.findUnique({
        where: { id: input.searchId },
      });

      if (searchLog) {
        await this.prisma.popularSearch.upsert({
          where: { query: searchLog.query },
          update: {
            clickCount: { increment: 1 },
            lastSearched: new Date(),
          },
          create: {
            query: searchLog.query,
            searchCount: 1,
            clickCount: 1,
          },
        });
      }

      return true;
    } catch {
      return false;
    }
  }

  async trackView(input: TrackItemViewInput): Promise<boolean> {
    try {
      // Update view count based on item type using raw SQL (cross-schema query)
      if (input.itemType === 'PRODUCT') {
        await this.prisma.$executeRaw`
          UPDATE "Product" SET "viewCount" = "viewCount" + 1 WHERE id = ${input.itemId}
        `;
      } else if (input.itemType === 'STORE_PRODUCT') {
        await this.prisma.$executeRaw`
          UPDATE "StoreProduct" SET "viewCount" = "viewCount" + 1 WHERE id = ${input.itemId}
        `;
      } else if (input.itemType === 'SERVICE') {
        await this.prisma.$executeRaw`
          UPDATE "Service" SET "viewCount" = "viewCount" + 1 WHERE id = ${input.itemId}
        `;
      }

      return true;
    } catch {
      return false;
    }
  }

  private deduplicateRecommendations(
    items: RecommendationItem[],
  ): RecommendationItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = `${item.type}-${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
