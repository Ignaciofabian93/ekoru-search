import { InputType, Field, ID, Int, Float } from '@nestjs/graphql';
import { IsString, IsOptional, IsNumber, IsArray, IsDate } from 'class-validator';
import { QuotationStatus } from '../../graphql/enums/index.js';

@InputType()
export class UpdateQuotationInput {
  @Field(() => ID)
  id: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  estimatedPrice?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  finalPrice?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsNumber()
  estimatedDuration?: number;

  @Field(() => QuotationStatus, { nullable: true })
  @IsOptional()
  status?: QuotationStatus;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  clientNotes?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  providerNotes?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  attachments?: string[];

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  expiresAt?: Date;
}
