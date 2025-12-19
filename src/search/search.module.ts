import { Module } from "@nestjs/common";
import { SearchService } from "./search.service";
import { SearchResolver } from "./search.resolver";
import { PrismaModule } from "../prisma/prisma.module";
import { FullTextSearchStrategy } from "./strategies/fulltext-search.strategy";
import { TrendingService } from "./services/trending.service";

@Module({
  imports: [PrismaModule],
  providers: [
    SearchService,
    SearchResolver,
    FullTextSearchStrategy,
    TrendingService,
  ],
  exports: [SearchService],
})
export class SearchModule {}
