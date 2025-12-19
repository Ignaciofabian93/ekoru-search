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
import { AddQuotationInput, UpdateQuotationInput } from './dto/index.js';
import { QuotationStatus } from '../graphql/enums/index.js';

@Injectable()
export class QuotationsService {
  private readonly logger = new Logger(QuotationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getQuotation(id: number) {
    try {
      const quotation = await this.prisma.quotation.findUnique({
        where: { id },
        select: {
          id: true,
          serviceId: true,
          clientId: true,
          providerId: true,
          title: true,
          description: true,
          estimatedPrice: true,
          finalPrice: true,
          estimatedDuration: true,
          status: true,
          clientNotes: true,
          providerNotes: true,
          attachments: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          acceptedAt: true,
          completedAt: true,
          service: {
            select: {
              id: true,
              name: true,
              description: true,
              pricingType: true,
            },
          },
        },
      });

      if (!quotation) {
        throw new NotFoundError('Cotización no encontrada');
      }

      return {
        ...quotation,
        client: { id: quotation.clientId },
        provider: { id: quotation.providerId },
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Error al obtener la cotización:', error);
      throw new InternalServerError('Error al obtener la cotización');
    }
  }

  async getQuotationsByClient(
    clientId: string,
    page: number,
    pageSize: number,
  ) {
    try {
      const { skip, take } = calculatePrismaParams(page, pageSize);

      const count = await this.prisma.quotation.count({ where: { clientId } });
      const quotations = await this.prisma.quotation.findMany({
        where: { clientId },
        skip,
        take,
      });

      const mappedQuotations = quotations.map((q) => ({
        ...q,
        client: { id: q.clientId },
        provider: { id: q.providerId },
      }));

      return createPaginatedResponse(mappedQuotations, count, page, pageSize);
    } catch (error) {
      this.logger.error(
        'Error al obtener las cotizaciones del cliente:',
        error,
      );
      throw new InternalServerError(
        'Error al obtener las cotizaciones del cliente',
      );
    }
  }

  async getQuotationsByProvider(
    providerId: string,
    page: number,
    pageSize: number,
  ) {
    try {
      const { skip, take } = calculatePrismaParams(page, pageSize);

      const count = await this.prisma.quotation.count({ where: { providerId } });
      const quotations = await this.prisma.quotation.findMany({
        where: { providerId },
        skip,
        take,
      });

      const mappedQuotations = quotations.map((q) => ({
        ...q,
        client: { id: q.clientId },
        provider: { id: q.providerId },
      }));

      return createPaginatedResponse(mappedQuotations, count, page, pageSize);
    } catch (error) {
      this.logger.error(
        'Error al obtener las cotizaciones del proveedor:',
        error,
      );
      throw new InternalServerError(
        'Error al obtener las cotizaciones del proveedor',
      );
    }
  }

  async getQuotationsByService(
    serviceId: number,
    page: number,
    pageSize: number,
  ) {
    try {
      const { skip, take } = calculatePrismaParams(page, pageSize);

      const count = await this.prisma.quotation.count({ where: { serviceId } });
      const quotations = await this.prisma.quotation.findMany({
        where: { serviceId },
        skip,
        take,
      });

      const mappedQuotations = quotations.map((q) => ({
        ...q,
        client: { id: q.clientId },
        provider: { id: q.providerId },
      }));

      return createPaginatedResponse(mappedQuotations, count, page, pageSize);
    } catch (error) {
      this.logger.error(
        'Error al obtener las cotizaciones del servicio:',
        error,
      );
      throw new InternalServerError(
        'Error al obtener las cotizaciones del servicio',
      );
    }
  }

  async getQuotationsByStatus(
    status: QuotationStatus,
    page: number,
    pageSize: number,
  ) {
    try {
      const { skip, take } = calculatePrismaParams(page, pageSize);

      const count = await this.prisma.quotation.count({ where: { status } });
      const quotations = await this.prisma.quotation.findMany({
        where: { status },
        skip,
        take,
      });

      const mappedQuotations = quotations.map((q) => ({
        ...q,
        client: { id: q.clientId },
        provider: { id: q.providerId },
      }));

      return createPaginatedResponse(mappedQuotations, count, page, pageSize);
    } catch (error) {
      this.logger.error(
        'Error al obtener las cotizaciones por estado:',
        error,
      );
      throw new InternalServerError(
        'Error al obtener las cotizaciones por estado',
      );
    }
  }

  async addQuotation(input: AddQuotationInput) {
    try {
      const quotation = await this.prisma.quotation.create({
        data: {
          serviceId: input.serviceId,
          clientId: input.clientId,
          providerId: input.providerId,
          title: input.title,
          description: input.description,
          estimatedPrice: input.estimatedPrice,
          estimatedDuration: input.estimatedDuration,
          clientNotes: input.clientNotes,
          attachments: input.attachments || [],
          expiresAt: input.expiresAt,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          serviceId: true,
          clientId: true,
          providerId: true,
          title: true,
          description: true,
          estimatedPrice: true,
          finalPrice: true,
          estimatedDuration: true,
          status: true,
          clientNotes: true,
          providerNotes: true,
          attachments: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          acceptedAt: true,
          completedAt: true,
          service: {
            select: {
              id: true,
              name: true,
              description: true,
              pricingType: true,
            },
          },
        },
      });

      return {
        ...quotation,
        client: { id: quotation.clientId },
        provider: { id: quotation.providerId },
      };
    } catch (error) {
      this.logger.error('Error al crear la cotización:', error);
      throw new InternalServerError('Error al crear la cotización');
    }
  }

  async updateQuotation(input: UpdateQuotationInput) {
    try {
      const id = parseInt(input.id, 10);

      const quotation = await this.prisma.quotation.update({
        where: { id },
        data: {
          ...(input.estimatedPrice !== undefined && {
            estimatedPrice: input.estimatedPrice,
          }),
          ...(input.finalPrice !== undefined && { finalPrice: input.finalPrice }),
          ...(input.estimatedDuration !== undefined && {
            estimatedDuration: input.estimatedDuration,
          }),
          ...(input.status && { status: input.status }),
          ...(input.clientNotes && { clientNotes: input.clientNotes }),
          ...(input.providerNotes && { providerNotes: input.providerNotes }),
          ...(input.attachments && { attachments: input.attachments }),
          ...(input.expiresAt && { expiresAt: input.expiresAt }),
          updatedAt: new Date(),
        },
        select: {
          id: true,
          serviceId: true,
          clientId: true,
          providerId: true,
          title: true,
          description: true,
          estimatedPrice: true,
          finalPrice: true,
          estimatedDuration: true,
          status: true,
          clientNotes: true,
          providerNotes: true,
          attachments: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          acceptedAt: true,
          completedAt: true,
          service: {
            select: {
              id: true,
              name: true,
              description: true,
              pricingType: true,
            },
          },
        },
      });

      return {
        ...quotation,
        client: { id: quotation.clientId },
        provider: { id: quotation.providerId },
      };
    } catch (error) {
      this.logger.error('Error al actualizar la cotización:', error);
      throw new InternalServerError('Error al actualizar la cotización');
    }
  }

  async acceptQuotation(id: number) {
    try {
      const quotation = await this.prisma.quotation.update({
        where: { id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          updatedAt: new Date(),
        },
        select: {
          id: true,
          serviceId: true,
          clientId: true,
          providerId: true,
          title: true,
          description: true,
          estimatedPrice: true,
          finalPrice: true,
          estimatedDuration: true,
          status: true,
          clientNotes: true,
          providerNotes: true,
          attachments: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          acceptedAt: true,
          completedAt: true,
          service: {
            select: {
              id: true,
              name: true,
              description: true,
              pricingType: true,
            },
          },
        },
      });

      return {
        ...quotation,
        client: { id: quotation.clientId },
        provider: { id: quotation.providerId },
      };
    } catch (error) {
      this.logger.error('Error al aceptar la cotización:', error);
      throw new InternalServerError('Error al aceptar la cotización');
    }
  }

  async declineQuotation(id: number, reason?: string) {
    try {
      const quotation = await this.prisma.quotation.update({
        where: { id },
        data: {
          status: 'DECLINED',
          providerNotes: reason || undefined,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          serviceId: true,
          clientId: true,
          providerId: true,
          title: true,
          description: true,
          estimatedPrice: true,
          finalPrice: true,
          estimatedDuration: true,
          status: true,
          clientNotes: true,
          providerNotes: true,
          attachments: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          acceptedAt: true,
          completedAt: true,
          service: {
            select: {
              id: true,
              name: true,
              description: true,
              pricingType: true,
            },
          },
        },
      });

      return {
        ...quotation,
        client: { id: quotation.clientId },
        provider: { id: quotation.providerId },
      };
    } catch (error) {
      this.logger.error('Error al rechazar la cotización:', error);
      throw new InternalServerError('Error al rechazar la cotización');
    }
  }

  async completeQuotation(id: number) {
    try {
      const quotation = await this.prisma.quotation.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          updatedAt: new Date(),
        },
        select: {
          id: true,
          serviceId: true,
          clientId: true,
          providerId: true,
          title: true,
          description: true,
          estimatedPrice: true,
          finalPrice: true,
          estimatedDuration: true,
          status: true,
          clientNotes: true,
          providerNotes: true,
          attachments: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          acceptedAt: true,
          completedAt: true,
          service: {
            select: {
              id: true,
              name: true,
              description: true,
              pricingType: true,
            },
          },
        },
      });

      return {
        ...quotation,
        client: { id: quotation.clientId },
        provider: { id: quotation.providerId },
      };
    } catch (error) {
      this.logger.error('Error al completar la cotización:', error);
      throw new InternalServerError('Error al completar la cotización');
    }
  }

  async cancelQuotation(id: number, reason?: string) {
    try {
      const quotation = await this.prisma.quotation.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          providerNotes: reason || undefined,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          serviceId: true,
          clientId: true,
          providerId: true,
          title: true,
          description: true,
          estimatedPrice: true,
          finalPrice: true,
          estimatedDuration: true,
          status: true,
          clientNotes: true,
          providerNotes: true,
          attachments: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          acceptedAt: true,
          completedAt: true,
          service: {
            select: {
              id: true,
              name: true,
              description: true,
              pricingType: true,
            },
          },
        },
      });

      return {
        ...quotation,
        client: { id: quotation.clientId },
        provider: { id: quotation.providerId },
      };
    } catch (error) {
      this.logger.error('Error al cancelar la cotización:', error);
      throw new InternalServerError('Error al cancelar la cotización');
    }
  }

  async deleteQuotation(id: number): Promise<boolean> {
    try {
      await this.prisma.quotation.delete({
        where: { id },
      });

      return true;
    } catch (error) {
      this.logger.error('Error al eliminar la cotización:', error);
      return false;
    }
  }
}
