import { ObjectType, Field } from '@nestjs/graphql';
import { ServiceReview } from './service-review.entity.js';
import { PageInfo } from '../../catalog/entities/index.js';

@ObjectType()
export class ServiceReviewConnection {
  @Field(() => [ServiceReview])
  nodes: ServiceReview[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}
