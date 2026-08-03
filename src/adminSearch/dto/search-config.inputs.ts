import { ArgsType, Field, InputType, Int, Float } from '@nestjs/graphql';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * Admin search-config inputs (synonyms / corrections / suggestions).
 *
 * The bulk upsert follows the shared catalog contract:
 * - `id` present → update that row (only the provided fields change)
 * - no `id`      → create (the required text columns must be present)
 *
 * Omitted fields are left untouched on update; explicit `null` clears a nullable
 * column. Flat config tables — no translations. Timestamps aren't editable.
 */

/** List args shared by all three tables — a single free-text `search` filter. */
@ArgsType()
export class SearchConfigListArgs {
  @Field(() => Int, {
    nullable: true,
    description: 'Fetch a single row by id (edit screen)',
  })
  @IsOptional()
  @IsInt()
  id?: number;

  @Field(() => Int, { defaultValue: 1, description: 'Page number (1-based)' })
  @IsInt()
  @Min(1)
  page: number;

  @Field(() => Int, { defaultValue: 50, description: 'Items per page' })
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize: number;

  @Field(() => String, {
    nullable: true,
    description: 'Filters rows whose main term contains this text',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @Field(() => Boolean, {
    nullable: true,
    description: 'Filter by active flag (omitted = all)',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@InputType()
export class SearchSynonymUpsertRowInput {
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() id?: number;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  term?: string;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  synonym?: string;
  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  weight?: number;
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@InputType()
export class SearchCorrectionUpsertRowInput {
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() id?: number;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  incorrectTerm?: string;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  correctTerm?: string;
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  frequency?: number;
  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  confidence?: number;
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@InputType()
export class SearchSuggestionUpsertRowInput {
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() id?: number;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  term?: string;
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  frequency?: number;
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
