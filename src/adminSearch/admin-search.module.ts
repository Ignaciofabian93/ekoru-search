import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminSearchService } from './admin-search.service';
import { AdminSearchResolver } from './resolvers';

/**
 * Platform-admin CRUD over the search config tables (synonyms, corrections,
 * suggestions) — raw reads + bulk upsert + delete for the admin panel's XLSX
 * round-trip. Separate from SearchModule (the web-facing search surface).
 */
@Module({
  imports: [PrismaModule],
  providers: [AdminSearchService, AdminSearchResolver],
})
export class AdminSearchModule {}
