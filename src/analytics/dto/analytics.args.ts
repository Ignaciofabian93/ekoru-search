import { ArgsType, Field, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AnalyticsRange } from '../analytics-period';
import { Language } from '../../graphql/enums';

@ArgsType()
export class AnalyticsArgs {
  @Field(() => AnalyticsRange)
  @IsEnum(AnalyticsRange)
  range: AnalyticsRange;
}

@ArgsType()
export class PlatformAnalyticsArgs extends AnalyticsArgs {
  @Field(() => Language, {
    nullable: true,
    description: 'Language of the category names (Spanish when missing)',
  })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;
}

@ArgsType()
export class BusinessSalesArgs extends AnalyticsArgs {
  @Field(() => Int, { defaultValue: 1 })
  @IsInt()
  @Min(1)
  page: number;

  @Field(() => Int, {
    defaultValue: 20,
    description: 'Up to 500, so an export takes few pages',
  })
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize: number;
}
