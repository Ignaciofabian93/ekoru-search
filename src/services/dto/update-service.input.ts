import { InputType, Field, ID, Int, Float } from '@nestjs/graphql';
import { IsString, IsOptional, IsNumber, IsArray, IsBoolean } from 'class-validator';
import { ServicePricing } from '../../graphql/enums/index.js';

@InputType()
export class UpdateServiceInput {
  @Field(() => ID)
  id: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsNumber()
  subcategoryId?: number;

  @Field(() => ServicePricing, { nullable: true })
  @IsOptional()
  pricingType?: ServicePricing;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  basePrice?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  priceRange?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsNumber()
  duration?: number;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  images?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  tags?: string[];

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
