import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { CurrentAdmin } from '../../common/decorators';
import { AdminSearchService } from '../admin-search.service';
import {
  RawSearchSynonymConnection,
  RawSearchCorrectionConnection,
  RawSearchSuggestionConnection,
  SearchBulkUpsertResult,
} from '../entities';
import {
  SearchConfigListArgs,
  SearchSynonymUpsertRowInput,
  SearchCorrectionUpsertRowInput,
  SearchSuggestionUpsertRowInput,
} from '../dto';

/**
 * Platform-admin surface over the search config tables. Every operation requires
 * the x-admin-id header the gateway sets. Raw reads return every row (inactive
 * included); the bulk upserts serve both the XLSX import and the row-edit form.
 */
@Resolver()
export class AdminSearchResolver {
  constructor(private readonly service: AdminSearchService) {}

  // ─── Synonyms ───────────────────────────────────────────────────────────────

  @Query(() => RawSearchSynonymConnection, {
    name: 'rawSearchSynonyms',
    description:
      'Paginated search synonyms as stored (inactive included). Admins only.',
  })
  rawSearchSynonyms(
    @Args() args: SearchConfigListArgs,
    @CurrentAdmin() adminId?: string,
  ) {
    return this.service.getRawSynonyms({ ...args, adminId });
  }

  @Mutation(() => SearchBulkUpsertResult, {
    description:
      'Creates (no id) or updates (id) search synonyms. Admins only.',
  })
  bulkUpsertSearchSynonyms(
    @Args('rows', { type: () => [SearchSynonymUpsertRowInput] })
    rows: SearchSynonymUpsertRowInput[],
    @CurrentAdmin() adminId?: string,
  ) {
    return this.service.bulkUpsertSynonyms(adminId, rows);
  }

  @Mutation(() => Boolean, {
    description: 'Deletes a search synonym. Admins only.',
  })
  deleteSearchSynonym(
    @Args('id', { type: () => Int }) id: number,
    @CurrentAdmin() adminId?: string,
  ) {
    return this.service.deleteSynonym(adminId, id);
  }

  // ─── Corrections ──────────────────────────────────────────────────────────

  @Query(() => RawSearchCorrectionConnection, {
    name: 'rawSearchCorrections',
    description:
      'Paginated search corrections as stored (inactive included). Admins only.',
  })
  rawSearchCorrections(
    @Args() args: SearchConfigListArgs,
    @CurrentAdmin() adminId?: string,
  ) {
    return this.service.getRawCorrections({ ...args, adminId });
  }

  @Mutation(() => SearchBulkUpsertResult, {
    description:
      'Creates (no id) or updates (id) search corrections. Admins only.',
  })
  bulkUpsertSearchCorrections(
    @Args('rows', { type: () => [SearchCorrectionUpsertRowInput] })
    rows: SearchCorrectionUpsertRowInput[],
    @CurrentAdmin() adminId?: string,
  ) {
    return this.service.bulkUpsertCorrections(adminId, rows);
  }

  @Mutation(() => Boolean, {
    description: 'Deletes a search correction. Admins only.',
  })
  deleteSearchCorrection(
    @Args('id', { type: () => Int }) id: number,
    @CurrentAdmin() adminId?: string,
  ) {
    return this.service.deleteCorrection(adminId, id);
  }

  // ─── Suggestions ──────────────────────────────────────────────────────────

  @Query(() => RawSearchSuggestionConnection, {
    name: 'rawSearchSuggestions',
    description:
      'Paginated search suggestions as stored (inactive included). Admins only.',
  })
  rawSearchSuggestions(
    @Args() args: SearchConfigListArgs,
    @CurrentAdmin() adminId?: string,
  ) {
    return this.service.getRawSuggestions({ ...args, adminId });
  }

  @Mutation(() => SearchBulkUpsertResult, {
    description:
      'Creates (no id) or updates (id) search suggestions. Admins only.',
  })
  bulkUpsertSearchSuggestions(
    @Args('rows', { type: () => [SearchSuggestionUpsertRowInput] })
    rows: SearchSuggestionUpsertRowInput[],
    @CurrentAdmin() adminId?: string,
  ) {
    return this.service.bulkUpsertSuggestions(adminId, rows);
  }

  @Mutation(() => Boolean, {
    description: 'Deletes a search suggestion. Admins only.',
  })
  deleteSearchSuggestion(
    @Args('id', { type: () => Int }) id: number,
    @CurrentAdmin() adminId?: string,
  ) {
    return this.service.deleteSuggestion(adminId, id);
  }
}
