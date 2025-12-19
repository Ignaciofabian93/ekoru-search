import { Resolver, Query, Args, Int, ID } from '@nestjs/graphql';
import { CatalogService } from './catalog.service.js';
import {
  ServiceCategory,
  ServiceSubCategory,
  ServiceSubCategoryConnection,
} from './entities/index.js';

@Resolver()
export class CatalogResolver {
  constructor(private readonly catalogService: CatalogService) {}

  @Query(() => [ServiceCategory], {
    name: 'serviceCatalog',
    nullable: true,
  })
  async getServiceCatalog() {
    return this.catalogService.getServiceCatalog();
  }

  @Query(() => ServiceCategory, {
    name: 'getServiceCategory',
    nullable: true,
  })
  async getServiceCategory(@Args('id', { type: () => ID }) id: string) {
    return this.catalogService.getServiceCategory(parseInt(id, 10));
  }

  @Query(() => ServiceSubCategoryConnection, {
    name: 'getServiceSubCategories',
  })
  async getServiceSubCategories(
    @Args('serviceCategoryId', { type: () => ID }) serviceCategoryId: string,
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('pageSize', { type: () => Int, defaultValue: 10 }) pageSize: number,
  ) {
    return this.catalogService.getServiceSubCategories(
      parseInt(serviceCategoryId, 10),
      page,
      pageSize,
    );
  }

  @Query(() => ServiceSubCategory, {
    name: 'getServiceSubCategory',
    nullable: true,
  })
  async getServiceSubCategory(@Args('id', { type: () => ID }) id: string) {
    return this.catalogService.getServiceSubCategory(parseInt(id, 10));
  }
}
