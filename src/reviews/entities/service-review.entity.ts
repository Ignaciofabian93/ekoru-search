import { ObjectType, Field, ID, Int, Directive } from '@nestjs/graphql';
import { Seller } from '../../services/entities/index.js';
import { Service } from '../../services/entities/index.js';

@ObjectType()
@Directive('@key(fields: "id")')
export class ServiceReview {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  serviceId: number;

  @Field(() => String)
  reviewerId: string;

  @Field(() => Int)
  rating: number;

  @Field(() => String, { nullable: true })
  comment?: string;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Service, { nullable: true })
  service?: Service;

  @Field(() => Seller, { nullable: true })
  reviewer?: Seller;
}
