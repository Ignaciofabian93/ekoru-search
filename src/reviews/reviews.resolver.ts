import { Resolver, Query, Mutation, Args, Int, ID } from '@nestjs/graphql';
import { ReviewsService } from './reviews.service.js';
import { ServiceReview, ServiceReviewConnection } from './entities/index.js';
import { AddServiceReviewInput } from './dto/index.js';

@Resolver(() => ServiceReview)
export class ReviewsResolver {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Query(() => ServiceReviewConnection, { name: 'getServiceReviews' })
  async getServiceReviews(
    @Args('serviceId', { type: () => ID }) serviceId: string,
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('pageSize', { type: () => Int, defaultValue: 10 }) pageSize: number,
  ) {
    return this.reviewsService.getServiceReviews(
      parseInt(serviceId, 10),
      page,
      pageSize,
    );
  }

  @Query(() => ServiceReviewConnection, { name: 'getServiceReviewsByReviewer' })
  async getServiceReviewsByReviewer(
    @Args('reviewerId', { type: () => ID }) reviewerId: string,
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('pageSize', { type: () => Int, defaultValue: 10 }) pageSize: number,
  ) {
    return this.reviewsService.getServiceReviewsByReviewer(
      reviewerId,
      page,
      pageSize,
    );
  }

  @Mutation(() => ServiceReview)
  async addServiceReview(@Args('input') input: AddServiceReviewInput) {
    return this.reviewsService.addServiceReview(input);
  }

  @Mutation(() => Boolean)
  async deleteServiceReview(@Args('id', { type: () => ID }) id: string) {
    return this.reviewsService.deleteServiceReview(parseInt(id, 10));
  }
}
