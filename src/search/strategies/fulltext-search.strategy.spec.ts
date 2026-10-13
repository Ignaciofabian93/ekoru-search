import { Prisma } from '@prisma/client';
import { FullTextSearchStrategy } from './fulltext-search.strategy';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The Postgres fallback only runs when SEARCH_ENGINE=postgres, so nothing else
 * exercises its SQL. It rotted once already (SRCH-6): these tests render each
 * query and pin the columns it reads to the current catalog schema.
 */
describe('FullTextSearchStrategy', () => {
  let rendered: string[];
  const prisma = {
    $queryRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: Prisma.Sql[]) => {
        rendered.push(Prisma.sql(strings, ...values).sql);
        return Promise.resolve([]);
      },
    ),
  };
  const strategy = new FullTextSearchStrategy(
    prisma as unknown as PrismaService,
  );
  const filters = {
    minPrice: 1,
    maxPrice: 100,
    minRating: 3,
    hasOffer: true,
    excludeSellerId: 'seller-1',
  };

  // Columns that left the catalog tables when names moved to translations.
  const STALE = [
    '"productCategoryName"',
    'sp.ratings',
    'sp."subcategoryId"',
    'ssc."subCategory"',
    'sc.category',
    'scat.category',
  ];

  beforeEach(() => {
    rendered = [];
  });

  const expectNoStaleColumns = () => {
    for (const column of STALE) expect(rendered[0]).not.toContain(column);
  };

  it('reads marketplace categories from the translation table', async () => {
    await strategy.searchProducts(['bici'], filters);

    expect(rendered[0]).toContain('LEFT JOIN "ProductCategoryTranslation" pct');
    expect(rendered[0]).toContain('pct.name as category');
    expectNoStaleColumns();
  });

  it('reads store product ratings and categories from current columns', async () => {
    await strategy.searchStoreProducts(['bolso'], filters);

    expect(rendered[0]).toContain('sp."subCategoryId" = ssc.id');
    expect(rendered[0]).toContain('AND sp."averageRating" >=');
    expect(rendered[0]).toContain('"StoreSubCategoryTranslation" ssct');
    expect(rendered[0]).toContain('"StoreCategoryTranslation" sct');
    expectNoStaleColumns();
  });

  it('reads service categories from the translation tables', async () => {
    await strategy.searchServices(['reparación'], filters);

    expect(rendered[0]).toContain('"ServiceSubCategoryTranslation" ssct');
    expect(rendered[0]).toContain('"ServiceCategoryTranslation" sctt');
    expectNoStaleColumns();
  });
});
