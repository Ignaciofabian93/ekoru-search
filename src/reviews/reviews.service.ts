import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BadRequestError,
  InternalServerError,
} from '../common/exceptions/index.js';
import {
  calculatePrismaParams,
  createPaginatedResponse,
} from '../common/utils/index.js';
import { AddServiceReviewInput } from './dto/index.js';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getServiceReviews(serviceId: number, page: number, pageSize: number) {
    try {
      const { skip, take } = calculatePrismaParams(page, pageSize);

      const count = await this.prisma.serviceReview.count({
        where: { serviceId },
      });
      const reviews = await this.prisma.serviceReview.findMany({
        where: { serviceId },
        skip,
        take,
        select: {
          id: true,
          serviceId: true,
          reviewerId: true,
          rating: true,
          comment: true,
          createdAt: true,
        },
      });

      const mappedReviews = reviews.map((review) => ({
        ...review,
        reviewer: { id: review.reviewerId },
      }));

      return createPaginatedResponse(mappedReviews, count, page, pageSize);
    } catch (error) {
      this.logger.error('Error al obtener las reseñas del servicio:', error);
      throw new InternalServerError(
        'Error al obtener las reseñas del servicio',
      );
    }
  }

  async getServiceReviewsByReviewer(
    reviewerId: string,
    page: number,
    pageSize: number,
  ) {
    try {
      const { skip, take } = calculatePrismaParams(page, pageSize);

      const count = await this.prisma.serviceReview.count({
        where: { reviewerId },
      });
      const reviews = await this.prisma.serviceReview.findMany({
        where: { reviewerId },
        skip,
        take,
        select: {
          id: true,
          serviceId: true,
          reviewerId: true,
          rating: true,
          comment: true,
          createdAt: true,
        },
      });

      const mappedReviews = reviews.map((review) => ({
        ...review,
        reviewer: { id: review.reviewerId },
      }));

      return createPaginatedResponse(mappedReviews, count, page, pageSize);
    } catch (error) {
      this.logger.error('Error al obtener las reseñas del revisor:', error);
      throw new InternalServerError('Error al obtener las reseñas del revisor');
    }
  }

  async addServiceReview(input: AddServiceReviewInput) {
    try {
      // Check if user already reviewed this service
      const existingReview = await this.prisma.serviceReview.findFirst({
        where: {
          serviceId: input.serviceId,
          reviewerId: input.reviewerId,
        },
      });

      if (existingReview) {
        throw new BadRequestError('Ya has reseñado este servicio');
      }

      const review = await this.prisma.serviceReview.create({
        data: {
          serviceId: input.serviceId,
          reviewerId: input.reviewerId,
          rating: input.rating,
          comment: input.comment,
        },
        select: {
          id: true,
          serviceId: true,
          reviewerId: true,
          rating: true,
          comment: true,
          createdAt: true,
          service: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      });

      return {
        ...review,
        reviewer: { id: review.reviewerId },
      };
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw error;
      }
      this.logger.error('Error al crear la reseña del servicio:', error);
      throw new InternalServerError('Error al crear la reseña del servicio');
    }
  }

  async deleteServiceReview(id: number): Promise<boolean> {
    try {
      await this.prisma.serviceReview.delete({
        where: { id },
      });

      return true;
    } catch (error) {
      this.logger.error('Error al eliminar la reseña del servicio:', error);
      return false;
    }
  }
}
