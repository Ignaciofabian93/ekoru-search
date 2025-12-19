import { ObjectType, Field, ID, Int, Directive } from '@nestjs/graphql';

@ObjectType()
@Directive('@key(fields: "id")')
export class ServiceSubCategory {
  @Field(() => ID)
  id: number;

  @Field(() => String)
  subCategory: string;

  @Field(() => Int)
  serviceCategoryId: number;

  @Field(() => Int, { nullable: true })
  serviceCount?: number;

  @Field(() => String, { nullable: true })
  href?: string;
}
