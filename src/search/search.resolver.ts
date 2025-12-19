import { Resolver, Query, Args } from '@nestjs/graphql';
import { SearchService } from './search.service';
import { SearchInput, AutocompleteInput, RecommendationInput } from './dto/search.input';
import {
  SearchResponse,
  AutocompleteResponse,
  RecommendationResponse,
  TrendingResponse,
} from './entities/search-result.entity';

@Resolver()
export class SearchResolver {
  constructor(private readonly searchService: SearchService) {}

  @Query(() => SearchResponse, {
    name: 'search',
    description: 'Search for products and services across the marketplace',
  })
  async search(@Args('input') input: SearchInput): Promise<SearchResponse> {
    return this.searchService.search(input);
  }

  @Query(() => AutocompleteResponse, {
    name: 'autocomplete',
    description: 'Get autocomplete suggestions for search input',
  })
  async autocomplete(@Args('input') input: AutocompleteInput): Promise<AutocompleteResponse> {
    return this.searchService.autocomplete(input);
  }

  @Query(() => RecommendationResponse, {
    name: 'recommendations',
    description: 'Get personalized recommendations based on user activity',
  })
  async recommendations(@Args('input') input: RecommendationInput): Promise<RecommendationResponse> {
    return this.searchService.getRecommendations(input);
  }

  @Query(() => TrendingResponse, {
    name: 'trending',
    description: 'Get trending searches, products, and services',
  })
  async trending(): Promise<TrendingResponse> {
    return this.searchService.getTrending();
  }
}
