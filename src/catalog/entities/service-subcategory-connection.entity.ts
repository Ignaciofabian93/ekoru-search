import { ObjectType, Field } from '@nestjs/graphql';
import { ServiceSubCategory } from './service-subcategory.entity.js';
import { PageInfo } from './page-info.entity.js';

@ObjectType()
export class ServiceSubCategoryConnection {
  @Field(() => [ServiceSubCategory])
  nodes: ServiceSubCategory[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}
