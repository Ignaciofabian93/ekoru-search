import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import { CatalogResolver } from './catalog.resolver.js';

@Module({
  providers: [CatalogService, CatalogResolver],
  exports: [CatalogService],
})
export class CatalogModule {}
