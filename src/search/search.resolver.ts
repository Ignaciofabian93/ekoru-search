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
    @Args('language', { type: () => Language, defaultValue: Language.ES })
    language: Language,
    @Context() ctx: { sellerId?: string },
    @Args('country', { type: () => String, nullable: true }) country?: string,
    @Args('userId', { nullable: true }) userId?: string,
    @Args('sessionId', { nullable: true }) sessionId?: string,
  ): Promise<SearchResponse> {
    return this.searchService.search({
      input,
      language,
      userId,
      sessionId,
      excludeSellerId: ctx.sellerId,
      // Guest country selection (ISO code), sent as an arg so web + mobile work
      // the same way. Ignored for authenticated users (account country wins).
      guestCountryCode: country,
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
