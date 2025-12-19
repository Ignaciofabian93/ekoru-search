import { ObjectType, Field, ID, Directive } from '@nestjs/graphql';
import { ServiceSubCategory } from './service-subcategory.entity.js';

@ObjectType()
@Directive('@key(fields: "id")')
export class ServiceCategory {
  @Field(() => ID)
  id: number;

  @Field(() => String)
  category: string;

  @Field(() => [ServiceSubCategory], { nullable: true })
  subcategories?: ServiceSubCategory[];

  @Field(() => String, { nullable: true })
  href?: string;
}
