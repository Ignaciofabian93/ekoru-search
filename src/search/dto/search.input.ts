import { Field, InputType, Int, Float, registerEnumType } from '@nestjs/graphql';
import { IsOptional, IsString, Min, Max, IsArray } from 'class-validator';

export enum SearchType {
  ALL = 'ALL',
  PRODUCTS = 'PRODUCTS',
  SERVICES = 'SERVICES',
}

export enum SearchSortBy {
  RELEVANCE = 'RELEVANCE',
  PRICE_ASC = 'PRICE_ASC',
  PRICE_DESC = 'PRICE_DESC',
  NEWEST = 'NEWEST',
  RATING = 'RATING',
  POPULARITY = 'POPULARITY',
}

registerEnumType(SearchType, {
  name: 'SearchType',
  description: 'Type of items to search for',
});

registerEnumType(SearchSortBy, {
  name: 'SearchSortBy',
  description: 'Sort order for search results',
});

@InputType()
export class SearchInput {
  @Field(() => String)
  @IsString()
  query: string;

  @Field(() => SearchType, { defaultValue: SearchType.ALL })
  @IsOptional()
  type?: SearchType = SearchType.ALL;

  @Field(() => Int, { defaultValue: 1 })
  @IsOptional()
  @Min(1)
  page?: number = 1;

  @Field(() => Int, { defaultValue: 20 })
  @IsOptional()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @Field(() => SearchSortBy, { defaultValue: SearchSortBy.RELEVANCE })
  @IsOptional()
  sortBy?: SearchSortBy = SearchSortBy.RELEVANCE;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  minPrice?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  maxPrice?: number;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  categories?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  tags?: string[];

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  hasOffer?: boolean;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @Min(0)
  @Max(5)
  minRating?: number;
}

@InputType()
export class RecommendationInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  query?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  recentSearches?: string[];

  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @IsArray()
  viewedProductIds?: number[];

  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @IsArray()
  viewedServiceIds?: number[];

  @Field(() => Int, { defaultValue: 10 })
  @IsOptional()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

@InputType()
export class AutocompleteInput {
  @Field(() => String)
  @IsString()
  query: string;

  @Field(() => Int, { defaultValue: 8 })
  @IsOptional()
  @Min(1)
  @Max(20)
  limit?: number = 8;

  @Field(() => SearchType, { defaultValue: SearchType.ALL })
  @IsOptional()
  type?: SearchType = SearchType.ALL;
}
