import { Resolver, Query, Mutation, Args, Int, ID } from '@nestjs/graphql';
import { QuotationsService } from './quotations.service.js';
import { Quotation, QuotationConnection } from './entities/index.js';
import { AddQuotationInput, UpdateQuotationInput } from './dto/index.js';
import { QuotationStatus } from '../graphql/enums/index.js';

@Resolver(() => Quotation)
export class QuotationsResolver {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Query(() => Quotation, { name: 'getQuotation', nullable: true })
  async getQuotation(@Args('id', { type: () => ID }) id: string) {
    return this.quotationsService.getQuotation(parseInt(id, 10));
  }

  @Query(() => QuotationConnection, { name: 'getQuotationsByClient' })
  async getQuotationsByClient(
    @Args('clientId', { type: () => ID }) clientId: string,
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('pageSize', { type: () => Int, defaultValue: 10 }) pageSize: number,
  ) {
    return this.quotationsService.getQuotationsByClient(clientId, page, pageSize);
  }

  @Query(() => QuotationConnection, { name: 'getQuotationsByProvider' })
  async getQuotationsByProvider(
    @Args('providerId', { type: () => ID }) providerId: string,
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('pageSize', { type: () => Int, defaultValue: 10 }) pageSize: number,
  ) {
    return this.quotationsService.getQuotationsByProvider(
      providerId,
      page,
      pageSize,
    );
  }

  @Query(() => QuotationConnection, { name: 'getQuotationsByService' })
  async getQuotationsByService(
    @Args('serviceId', { type: () => ID }) serviceId: string,
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('pageSize', { type: () => Int, defaultValue: 10 }) pageSize: number,
  ) {
    return this.quotationsService.getQuotationsByService(
      parseInt(serviceId, 10),
      page,
      pageSize,
    );
  }

  @Query(() => QuotationConnection, { name: 'getQuotationsByStatus' })
  async getQuotationsByStatus(
    @Args('status', { type: () => QuotationStatus }) status: QuotationStatus,
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('pageSize', { type: () => Int, defaultValue: 10 }) pageSize: number,
  ) {
    return this.quotationsService.getQuotationsByStatus(status, page, pageSize);
  }

  @Mutation(() => Quotation)
  async addQuotation(@Args('input') input: AddQuotationInput) {
    return this.quotationsService.addQuotation(input);
  }

  @Mutation(() => Quotation)
  async updateQuotation(@Args('input') input: UpdateQuotationInput) {
    return this.quotationsService.updateQuotation(input);
  }

  @Mutation(() => Quotation)
  async acceptQuotation(@Args('id', { type: () => ID }) id: string) {
    return this.quotationsService.acceptQuotation(parseInt(id, 10));
  }

  @Mutation(() => Quotation)
  async declineQuotation(
    @Args('id', { type: () => ID }) id: string,
    @Args('reason', { type: () => String, nullable: true }) reason?: string,
  ) {
    return this.quotationsService.declineQuotation(parseInt(id, 10), reason);
  }

  @Mutation(() => Quotation)
  async completeQuotation(@Args('id', { type: () => ID }) id: string) {
    return this.quotationsService.completeQuotation(parseInt(id, 10));
  }

  @Mutation(() => Quotation)
  async cancelQuotation(
    @Args('id', { type: () => ID }) id: string,
    @Args('reason', { type: () => String, nullable: true }) reason?: string,
  ) {
    return this.quotationsService.cancelQuotation(parseInt(id, 10), reason);
  }

  @Mutation(() => Boolean)
  async deleteQuotation(@Args('id', { type: () => ID }) id: string) {
    return this.quotationsService.deleteQuotation(parseInt(id, 10));
  }
}
