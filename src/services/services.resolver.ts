import { Resolver, Query, Mutation, Args, Int, ID } from '@nestjs/graphql';
import { ServicesService } from './services.service.js';
import { Service, ServiceConnection } from './entities/index.js';
import { AddServiceInput, UpdateServiceInput } from './dto/index.js';
import { ServicePricing } from '../graphql/enums/index.js';

@Resolver(() => Service)
export class ServicesResolver {
  constructor(private readonly servicesService: ServicesService) {}

  @Query(() => Service, { name: 'getService', nullable: true })
  async getService(@Args('id', { type: () => ID }) id: string) {
    return this.servicesService.getService(parseInt(id, 10));
  }

  @Query(() => ServiceConnection, { name: 'getServices' })
  async getServices(
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('pageSize', { type: () => Int, defaultValue: 10 }) pageSize: number,
    @Args('isActive', { type: () => Boolean, nullable: true }) isActive?: boolean,
  ) {
    return this.servicesService.getServices(page, pageSize, isActive);
  }

  @Query(() => ServiceConnection, { name: 'getServicesBySeller' })
  async getServicesBySeller(
    @Args('sellerId', { type: () => ID }) sellerId: string,
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('pageSize', { type: () => Int, defaultValue: 10 }) pageSize: number,
    @Args('isActive', { type: () => Boolean, nullable: true }) isActive?: boolean,
  ) {
    return this.servicesService.getServicesBySeller(
      sellerId,
      page,
      pageSize,
      isActive,
    );
  }

  @Query(() => ServiceConnection, { name: 'getServicesBySubCategory' })
  async getServicesBySubCategory(
    @Args('subcategoryId', { type: () => ID }) subcategoryId: string,
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('pageSize', { type: () => Int, defaultValue: 10 }) pageSize: number,
    @Args('isActive', { type: () => Boolean, nullable: true }) isActive?: boolean,
  ) {
    return this.servicesService.getServicesBySubCategory(
      parseInt(subcategoryId, 10),
      page,
      pageSize,
      isActive,
    );
  }

  @Query(() => ServiceConnection, { name: 'getServicesByPricingType' })
  async getServicesByPricingType(
    @Args('pricingType', { type: () => ServicePricing }) pricingType: ServicePricing,
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('pageSize', { type: () => Int, defaultValue: 10 }) pageSize: number,
    @Args('isActive', { type: () => Boolean, nullable: true }) isActive?: boolean,
  ) {
    return this.servicesService.getServicesByPricingType(
      pricingType,
      page,
      pageSize,
      isActive,
    );
  }

  @Mutation(() => Service)
  async addService(@Args('input') input: AddServiceInput) {
    return this.servicesService.addService(input);
  }

  @Mutation(() => Service)
  async updateService(@Args('input') input: UpdateServiceInput) {
    return this.servicesService.updateService(input);
  }

  @Mutation(() => Service)
  async deleteService(@Args('id', { type: () => ID }) id: string) {
    return this.servicesService.deleteService(parseInt(id, 10));
  }

  @Mutation(() => Service)
  async toggleServiceActive(@Args('id', { type: () => ID }) id: string) {
    return this.servicesService.toggleServiceActive(parseInt(id, 10));
  }
}
