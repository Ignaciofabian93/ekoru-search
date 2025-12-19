import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  NotFoundError,
  InternalServerError,
} from '../common/exceptions/index.js';
import {
  calculatePrismaParams,
  createPaginatedResponse,
} from '../common/utils/index.js';

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getServiceCatalog() {
    try {
      const serviceCategories = await this.prisma.serviceCategory.findMany({
        select: {
          id: true,
          category: true,
          href: true,
          subcategories: {
            select: {
              id: true,
              subCategory: true,
              serviceCategoryId: true,
              href: true,
            },
          },
        },
        orderBy: {
          category: 'asc',
        },
      });

      if (!serviceCategories.length) {
        throw new NotFoundError('No se encontraron categorías de servicios');
      }

      return serviceCategories;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Error al obtener el catálogo de servicios:', error);
      throw new InternalServerError(
        'Error al obtener el catálogo de servicios',
      );
    }
  }

  async getServiceCategory(id: number) {
    try {
      const serviceCategory = await this.prisma.serviceCategory.findUnique({
        where: { id },
        select: {
          id: true,
          category: true,
          href: true,
          subcategories: {
            select: {
              id: true,
              subCategory: true,
              serviceCategoryId: true,
              href: true,
            },
          },
        },
      });

      if (!serviceCategory) {
        throw new NotFoundError('Categoría de servicio no encontrada');
      }

      return serviceCategory;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Error al obtener la categoría de servicio:', error);
      throw new InternalServerError(
        'Error al obtener la categoría de servicio',
      );
    }
  }

  async getServiceSubCategories(
    serviceCategoryId: number,
    page: number = 1,
    pageSize: number = 10,
  ) {
    try {
      const { skip, take } = calculatePrismaParams(page, pageSize);

      const count = await this.prisma.serviceSubCategory.count({
        where: { serviceCategoryId },
      });

      const subcategories = await this.prisma.serviceSubCategory.findMany({
        where: { serviceCategoryId },
        skip,
        take,
        select: {
          id: true,
          subCategory: true,
          serviceCategoryId: true,
          href: true,
          _count: {
            select: {
              services: true,
            },
          },
        },
      });

      const mappedSubcategories = subcategories.map((sub) => ({
        ...sub,
        serviceCount: sub._count.services,
      }));

      return createPaginatedResponse(mappedSubcategories, count, page, pageSize);
    } catch (error) {
      this.logger.error(
        'Error al obtener las subcategorías de servicio:',
        error,
      );
      throw new InternalServerError(
        'Error al obtener las subcategorías de servicio',
      );
    }
  }

  async getServiceSubCategory(id: number) {
    try {
      const subcategory = await this.prisma.serviceSubCategory.findUnique({
        where: { id },
        select: {
          id: true,
          subCategory: true,
          serviceCategoryId: true,
          href: true,
          serviceCategory: {
            select: {
              id: true,
              category: true,
            },
          },
          _count: {
            select: {
              services: true,
            },
          },
        },
      });

      if (!subcategory) {
        throw new NotFoundError('Subcategoría de servicio no encontrada');
      }

      return {
        ...subcategory,
        serviceCount: subcategory._count.services,
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error(
        'Error al obtener la subcategoría de servicio:',
        error,
      );
      throw new InternalServerError(
        'Error al obtener la subcategoría de servicio',
      );
    }
  }
}
