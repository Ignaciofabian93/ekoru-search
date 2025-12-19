import { ObjectType, Field, ID, Int, Float, Directive } from '@nestjs/graphql';
import { ServicePricing } from '../../graphql/enums/index.js';
import { ServiceSubCategory } from '../../catalog/entities/index.js';
import { Seller } from './seller.entity.js';

@ObjectType()
@Directive('@key(fields: "id")')
export class Service {
  @Field(() => ID)
  id: number;

  @Field(() => String)
  name: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String)
  sellerId: string;

  @Field(() => Int)
  subcategoryId: number;

  @Field(() => ServicePricing)
  pricingType: ServicePricing;

  @Field(() => Float, { nullable: true })
  basePrice?: number;

  @Field(() => String, { nullable: true })
  priceRange?: string;

  @Field(() => Int, { nullable: true })
  duration?: number;

  @Field(() => Boolean)
  isActive: boolean;

  @Field(() => [String])
  images: string[];

  @Field(() => [String])
  tags: string[];

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;

  @Field(() => ServiceSubCategory, { nullable: true })
  serviceCategory?: ServiceSubCategory;

  @Field(() => Seller, { nullable: true })
  seller?: Seller;

  @Field(() => Float, { nullable: true })
  averageRating?: number;

  @Field(() => Int)
  reviewCount: number;
}
