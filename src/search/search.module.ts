import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchResolver } from './search.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { FullTextSearchStrategy } from './strategies/fulltext-search.strategy';
import { TrendingService } from './services/trending.service';
import { TypesenseSearchEngine } from './engine/typesense.engine';
import { SEARCH_ENGINE } from './engine/search-engine.interface';
import { CatalogIndexerService } from './indexer/catalog-indexer.service';

@Module({
  imports: [PrismaModule],
  providers: [
    SearchService,
    SearchResolver,
    FullTextSearchStrategy,
    TrendingService,
    // Search engine (Typesense) behind the swappable SEARCH_ENGINE port.
    TypesenseSearchEngine,
    { provide: SEARCH_ENGINE, useExisting: TypesenseSearchEngine },
    CatalogIndexerService,
  ],
  exports: [SearchService, SEARCH_ENGINE, CatalogIndexerService],
})
export class SearchModule {}
