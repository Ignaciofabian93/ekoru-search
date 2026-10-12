import { Prisma } from '@prisma/client';
import { CatalogIndexerService } from './catalog-indexer.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { SearchEngine } from '../engine/search-engine.interface';

/** The composed SQL of a `$queryRaw` tagged-template call. */
const textOf = (strings: TemplateStringsArray, vals: unknown[]) =>
  Prisma.sql(strings, ...vals).text;

describe('CatalogIndexerService seller visibility (SRCH-1)', () => {
  function make(hiddenStoreIds: number[]) {
    const queries: string[] = [];
    const prisma = {
      $queryRaw: jest.fn(
        (strings: TemplateStringsArray, ...vals: unknown[]) => {
          const sql = textOf(strings, vals);
          queries.push(sql);
          // The eviction query for store products: everything whose seller is hidden.
          if (
            /FROM "StoreProduct" sp\s+WHERE sp."deletedAt" IS NULL\s+AND NOT/.test(
              sql,
            )
          ) {
            return Promise.resolve(hiddenStoreIds.map((id) => ({ id })));
          }
          return Promise.resolve([]);
        },
      ),
    } as unknown as PrismaService;
    const deleteDocuments = jest.fn().mockResolvedValue(undefined);
    const engine = {
      ensureCollections: jest.fn().mockResolvedValue(undefined),
      indexDocuments: jest.fn().mockResolvedValue(undefined),
      deleteDocuments,
    } as unknown as SearchEngine;
    return {
      indexer: new CatalogIndexerService(prisma, engine),
      deleteDocuments,
      queries,
    };
  }

  it('indexes only items whose seller may be found', async () => {
    const { indexer, queries } = make([]);
    await indexer.reindexAll();

    expect(queries).toHaveLength(3);
    for (const sql of queries) expect(sql).toContain('vis_s."isActive" = true');
    // People sell second-hand without a business profile; stores and services
    // need an approved business.
    expect(queries[0]).toContain('vis_bp."sellerId" IS NULL OR');
    expect(queries[1]).not.toContain('vis_bp."sellerId" IS NULL OR');
    expect(queries[2]).not.toContain('vis_bp."sellerId" IS NULL OR');
  });

  it("re-reads items whose seller changed, so an unbanned seller's catalog returns", async () => {
    const { indexer, queries } = make([]);
    await indexer.syncIncremental();
    const loaders = queries.filter((q) => q.includes('chg_s'));
    expect(loaders).toHaveLength(3);
  });

  it("evicts a hidden seller's items every cycle, in chunks", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => i + 1);
    const { indexer, deleteDocuments } = make(ids);

    await indexer.syncIncremental();

    const deleted = deleteDocuments.mock.calls.map((c) => c[0] as string[]);
    expect(deleted.map((chunk) => chunk.length)).toEqual([200, 200, 50]);
    expect(deleted.flat()).toContain('store_450');
  });
});
