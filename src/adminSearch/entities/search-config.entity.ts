import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

/**
 * Admin-only raw views of the search config tables (synonyms, corrections,
 * suggestions). Rows exactly as stored — inactive included — so the platform
 * admin panel can list, correct and bulk-maintain them via XLSX. These are flat,
 * single-language config tables (no translations).
 */

@ObjectType('RawSearchSynonym')
export class RawSearchSynonymEntity {
  @Field(() => Int) id: number;
  @Field(() => String) term: string;
  @Field(() => String) synonym: string;
  @Field(() => Float) weight: number;
  @Field(() => Boolean) isActive: boolean;
  @Field(() => Date) createdAt: Date;
  @Field(() => Date) updatedAt: Date;
}

@ObjectType('RawSearchCorrection')
export class RawSearchCorrectionEntity {
  @Field(() => Int) id: number;
  @Field(() => String) incorrectTerm: string;
  @Field(() => String) correctTerm: string;
  @Field(() => Int) frequency: number;
  @Field(() => Float) confidence: number;
  @Field(() => Boolean) isActive: boolean;
  @Field(() => Date) createdAt: Date;
  @Field(() => Date) updatedAt: Date;
}

@ObjectType('RawSearchSuggestion')
export class RawSearchSuggestionEntity {
  @Field(() => Int) id: number;
  @Field(() => String) term: string;
  @Field(() => Int) frequency: number;
  @Field(() => Boolean) isActive: boolean;
  @Field(() => Date) createdAt: Date;
  @Field(() => Date) updatedAt: Date;
}

/** Standard pagination info (matches createPaginatedResponse). */
@ObjectType('SearchAdminPageInfo')
export class SearchAdminPageInfo {
  @Field(() => Boolean) hasNextPage: boolean;
  @Field(() => Boolean) hasPreviousPage: boolean;
  @Field(() => String, { nullable: true }) startCursor: string | null;
  @Field(() => String, { nullable: true }) endCursor: string | null;
  @Field(() => Int) totalCount: number;
  @Field(() => Int) totalPages: number;
  @Field(() => Int) currentPage: number;
  @Field(() => Int) pageSize: number;
}

@ObjectType('RawSearchSynonymConnection')
export class RawSearchSynonymConnection {
  @Field(() => [RawSearchSynonymEntity]) nodes: RawSearchSynonymEntity[];
  @Field(() => SearchAdminPageInfo) pageInfo: SearchAdminPageInfo;
}

@ObjectType('RawSearchCorrectionConnection')
export class RawSearchCorrectionConnection {
  @Field(() => [RawSearchCorrectionEntity]) nodes: RawSearchCorrectionEntity[];
  @Field(() => SearchAdminPageInfo) pageInfo: SearchAdminPageInfo;
}

@ObjectType('RawSearchSuggestionConnection')
export class RawSearchSuggestionConnection {
  @Field(() => [RawSearchSuggestionEntity]) nodes: RawSearchSuggestionEntity[];
  @Field(() => SearchAdminPageInfo) pageInfo: SearchAdminPageInfo;
}

/** Per-row failure from a bulk upsert. Prefixed to stay federation-unique. */
@ObjectType('SearchBulkRowError')
export class SearchBulkRowError {
  @Field(() => Int) index: number;
  @Field(() => Int, { nullable: true }) id?: number | null;
  @Field(() => String) message: string;
}

@ObjectType('SearchBulkUpsertResult')
export class SearchBulkUpsertResult {
  @Field(() => Int) created: number;
  @Field(() => Int) updated: number;
  @Field(() => Int) failed: number;
  @Field(() => [Int]) createdIds: number[];
  @Field(() => [SearchBulkRowError]) errors: SearchBulkRowError[];
}
