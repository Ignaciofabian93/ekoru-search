import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service.js';
import { ReviewsResolver } from './reviews.resolver.js';

@Module({
  providers: [ReviewsService, ReviewsResolver],
  exports: [ReviewsService],
})
export class ReviewsModule {}
