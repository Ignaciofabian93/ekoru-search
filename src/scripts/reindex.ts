/**
 * One-shot full reindex of the Typesense catalog from the database.
 *
 * Usage: `npm run reindex`
 *
 * Boots the Nest application (without listening on a port), runs
 * CatalogIndexerService.reindexAll(), then exits.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { CatalogIndexerService } from '../search/indexer/catalog-indexer.service';

async function run(): Promise<void> {
  const logger = new Logger('reindex');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const indexer = app.get(CatalogIndexerService);
    const { indexed } = await indexer.reindexAll();
    logger.log(`Reindex finished: ${indexed} documents indexed.`);
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  new Logger('reindex').error('Reindex failed:', err);
  process.exit(1);
});
