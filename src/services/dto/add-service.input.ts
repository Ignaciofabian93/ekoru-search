import { InputType, Field, Int, Float } from '@nestjs/graphql';
import { IsString, IsOptional, IsNumber, IsArray, IsBoolean } from 'class-validator';
import { ServicePricing } from '../../graphql/enums/index.js';

@InputType()
export class AddServiceInput {
  @Field(() => String)
  @IsString()
  name: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field(() => Int)
  @IsNumber()
  subcategoryId: number;

  @Field(() => ServicePricing)
  pricingType: ServicePricing;

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

  @Field(() => [String])
  @IsArray()
  images: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  tags?: string[];

  @Field(() => String)
  @IsString()
  sellerId: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
