import { InputType, Field, Int } from '@nestjs/graphql';
import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

@InputType()
export class AddServiceReviewInput {
  @Field(() => Int)
  @IsNumber()
  serviceId: number;

  @Field(() => String)
  @IsString()
  reviewerId: string;

  @Field(() => Int)
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  comment?: string;
}
