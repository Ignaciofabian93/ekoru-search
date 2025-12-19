import { Field, ObjectType, Int, Float, registerEnumType } from '@nestjs/graphql';

export enum SearchResultType {
  PRODUCT = 'PRODUCT',
  STORE_PRODUCT = 'STORE_PRODUCT',
  SERVICE = 'SERVICE',
}

registerEnumType(SearchResultType, {
  name: 'SearchResultType',
  description: 'Type of search result item',
});

@ObjectType()
export class SearchResultItem {
  @Field(() => Int)
  id: number;

  @Field(() => SearchResultType)
  type: SearchResultType;

  @Field(() => String)
  name: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => Float, { nullable: true })
  price?: number;

  @Field(() => Float, { nullable: true })
  offerPrice?: number;

  @Field(() => Boolean, { defaultValue: false })
  hasOffer: boolean;

  @Field(() => [String], { nullable: true })
  images?: string[];

  @Field(() => String, { nullable: true })
  category?: string;

  @Field(() => String, { nullable: true })
  subcategory?: string;

  @Field(() => Float, { nullable: true })
  rating?: number;

  @Field(() => Int, { nullable: true })
  reviewCount?: number;

  @Field(() => String, { nullable: true })
  sellerId?: string;

  @Field(() => String, { nullable: true })
  sellerName?: string;

  @Field(() => [String], { nullable: true })
  tags?: string[];

  @Field(() => Float)
  relevanceScore: number;

  @Field(() => String, { nullable: true })
  highlightedName?: string;

  @Field(() => String, { nullable: true })
  highlightedDescription?: string;
}

@ObjectType()
export class SearchPageInfo {
  @Field(() => Int)
  currentPage: number;

  @Field(() => Int)
  pageSize: number;

  @Field(() => Int)
  totalItems: number;

  @Field(() => Int)
  totalPages: number;

  @Field(() => Boolean)
  hasNextPage: boolean;

  @Field(() => Boolean)
  hasPreviousPage: boolean;
}

@ObjectType()
export class SearchFacet {
  @Field(() => String)
  name: string;

  @Field(() => Int)
  count: number;
}

@ObjectType()
export class SearchFacets {
  @Field(() => [SearchFacet], { nullable: true })
  categories?: SearchFacet[];

  @Field(() => [SearchFacet], { nullable: true })
  priceRanges?: SearchFacet[];

  @Field(() => [SearchFacet], { nullable: true })
  tags?: SearchFacet[];

  @Field(() => [SearchFacet], { nullable: true })
  types?: SearchFacet[];
}

@ObjectType()
export class SearchResponse {
  @Field(() => [SearchResultItem])
  items: SearchResultItem[];

  @Field(() => SearchPageInfo)
  pageInfo: SearchPageInfo;

  @Field(() => SearchFacets, { nullable: true })
  facets?: SearchFacets;

  @Field(() => String)
  query: string;

  @Field(() => Int)
  processingTimeMs: number;

  @Field(() => [String], { nullable: true })
  suggestions?: string[];

  @Field(() => String, { nullable: true })
  correctedQuery?: string;
}

@ObjectType()
export class AutocompleteItem {
  @Field(() => String)
  text: string;

  @Field(() => SearchResultType, { nullable: true })
  type?: SearchResultType;

  @Field(() => Int, { nullable: true })
  itemId?: number;

  @Field(() => String, { nullable: true })
  category?: string;

  @Field(() => Int)
  score: number;
}

@ObjectType()
export class AutocompleteResponse {
  @Field(() => [AutocompleteItem])
  suggestions: AutocompleteItem[];

  @Field(() => [String])
  recentSearches: string[];

  @Field(() => [String])
  popularSearches: string[];
}

@ObjectType()
export class RecommendationItem {
  @Field(() => Int)
  id: number;

  @Field(() => SearchResultType)
  type: SearchResultType;

  @Field(() => String)
  name: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => Float, { nullable: true })
  price?: number;

  @Field(() => [String], { nullable: true })
  images?: string[];

  @Field(() => Float, { nullable: true })
  rating?: number;

  @Field(() => String)
  reason: string;

  @Field(() => Float)
  score: number;
}

@ObjectType()
export class RecommendationResponse {
  @Field(() => [RecommendationItem])
  items: RecommendationItem[];

  @Field(() => String, { nullable: true })
  basedOn?: string;
}

@ObjectType()
export class TrendingSearch {
  @Field(() => String)
  query: string;

  @Field(() => Int)
  searchCount: number;

  @Field(() => Float)
  trendScore: number;
}

@ObjectType()
export class TrendingResponse {
  @Field(() => [TrendingSearch])
  searches: TrendingSearch[];

  @Field(() => [RecommendationItem])
  products: RecommendationItem[];

  @Field(() => [RecommendationItem])
  services: RecommendationItem[];
}
