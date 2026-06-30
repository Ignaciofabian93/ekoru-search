import { UnauthorizedException } from '@nestjs/common';
import { Resolver, Query, Args, Mutation, Int, Context } from '@nestjs/graphql';
import { SearchService } from './search.service';
import { CatalogIndexerService } from './indexer/catalog-indexer.service';
import { Language } from '../graphql/enums';
import {
  SearchInput,
  AutocompleteInput,
  RecommendationInput,
  TrackSearchClickInput,
  TrackItemViewInput,
} from './dto/search.input';
import {
  SearchResponse,
  AutocompleteResponse,
  RecommendationResponse,
  TrendingResponse,
} from './entities/search-result.entity';

@Resolver()
export class SearchResolver {
  constructor(
    private readonly searchService: SearchService,
    private readonly indexer: CatalogIndexerService,
  ) {}

  @Query(() => SearchResponse, {
    name: 'search',
    description: 'Search for products and services across the marketplace',
  })
  async search(
    @Args('input') input: SearchInput,
    @Args('language', { type: () => Language }) language: Language,
    @Args('country', { type: () => String }) country: string,
    @Context() ctx: { sellerId?: string },
    @Args('userId', { nullable: true }) userId?: string,
    @Args('sessionId', { nullable: true }) sessionId?: string,
  ): Promise<SearchResponse> {
    // `language` and `country` (ISO code) are always supplied by the client —
    // web and mobile alike — and together scope every search: items in that
    // country, indexed under that language. The JWT seller id only hides the
    // caller's own listings; it no longer decides the market.
    return this.searchService.search({
      input,
      language,
      countryCode: country,
      userId,
      sessionId,
      excludeSellerId: ctx.sellerId,
    });
  }

  @Mutation(() => Int, {
    name: 'reindexCatalog',
    description:
      'Admin-only: rebuild the Typesense catalog index from the database. ' +
      'Returns the number of documents indexed.',
  })
  async reindexCatalog(@Context() ctx: { adminId?: string }): Promise<number> {
    if (!ctx.adminId) {
      throw new UnauthorizedException('Admin authentication required');
    }
    const { indexed } = await this.indexer.reindexAll();
    return indexed;
  }

  @Query(() => AutocompleteResponse, {
    name: 'autocomplete',
    description: 'Get autocomplete suggestions for search input',
  })
  async autocomplete(
    @Args('input') input: AutocompleteInput,
  ): Promise<AutocompleteResponse> {
    return this.searchService.autocomplete(input);
  }

  @Query(() => RecommendationResponse, {
    name: 'recommendations',
    description: 'Get personalized recommendations based on user activity',
  })
  async recommendations(
    @Args('input') input: RecommendationInput,
  ): Promise<RecommendationResponse> {
    return this.searchService.getRecommendations(input);
  }

  @Query(() => TrendingResponse, {
    name: 'trending',
    description: 'Get trending searches, products, and services',
  })
  async trending(): Promise<TrendingResponse> {
    return this.searchService.getTrending();
  }

  @Mutation(() => Boolean, {
    name: 'trackSearchClick',
    description: 'Track when a user clicks on a search result',
  })
  async trackSearchClick(
    @Args('input') input: TrackSearchClickInput,
  ): Promise<boolean> {
    return this.searchService.trackClick(input);
  }

  @Mutation(() => Boolean, {
    name: 'trackItemView',
    description: 'Track when a user views an item',
  })
  async trackItemView(
    @Args('input') input: TrackItemViewInput,
  ): Promise<boolean> {
    return this.searchService.trackView(input);
  }
}
