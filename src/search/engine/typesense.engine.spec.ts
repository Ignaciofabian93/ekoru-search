import { ConfigService } from '@nestjs/config';
import { TypesenseSearchEngine } from './typesense.engine';
import { SearchType, SearchSortBy, SearchInput } from '../dto/search.input';

describe('TypesenseSearchEngine', () => {
  let engine: TypesenseSearchEngine;
  let searchMock: jest.Mock;

  beforeEach(() => {
    // ConfigService.get(key, default) → return the default in tests.
    const config = {
      get: jest.fn((_key: string, def?: unknown) => def),
    } as unknown as ConfigService;
    engine = new TypesenseSearchEngine(config);

    searchMock = jest
      .fn()
      .mockResolvedValue({ hits: [], found: 0, facet_counts: [] });
    // Replace the real Typesense client with a capturing stub.
    (engine as unknown as { client: unknown }).client = {
      collections: () => ({ documents: () => ({ search: searchMock }) }),
    };
  });

  const run = (input: Partial<SearchInput>, excludeSellerId?: string) =>
    engine.search({
      locale: 'es',
      input: { query: 'x', page: 1, pageSize: 20, ...input } as SearchInput,
      excludeSellerId,
    });

  const lastParams = () => searchMock.mock.calls[0][0];
  const lastFilter = () => lastParams().filter_by as string;

  it('maps hits to result items and returns the total found', async () => {
    searchMock.mockResolvedValue({
      hits: [
        {
          document: {
            entityId: 7,
            type: 'PRODUCT',
            name: 'Bici',
            hasOffer: false,
          },
          text_match: 5,
        },
      ],
      found: 1,
      facet_counts: [],
    });

    const res = await run({ query: 'bici' });

    expect(res.found).toBe(1);
    expect(res.items[0].id).toBe(7);
    expect(res.items[0].relevanceScore).toBe(5);
  });

  it('excludes the current seller via filter_by', async () => {
    await run({ query: 'x' }, 'seller-1');
    expect(lastFilter()).toContain('sellerId:!=`seller-1`');
  });

  it('maps SearchType.PRODUCTS to product + store product', async () => {
    await run({ type: SearchType.PRODUCTS });
    expect(lastFilter()).toContain('type:[PRODUCT,STORE_PRODUCT]');
  });

  it('maps SearchType.SERVICES to service only', async () => {
    await run({ type: SearchType.SERVICES });
    expect(lastFilter()).toContain('type:=SERVICE');
  });

  it('applies price/offer/rating filters', async () => {
    await run({ minPrice: 10, maxPrice: 50, hasOffer: true, minRating: 4 });
    const f = lastFilter();
    expect(f).toContain('price:>=10');
    expect(f).toContain('price:<=50');
    expect(f).toContain('hasOffer:=true');
    expect(f).toContain('rating:>=4');
  });

  it('maps sortBy to a typesense sort_by clause', async () => {
    await run({ sortBy: SearchSortBy.PRICE_ASC });
    expect(lastParams().sort_by).toBe('price:asc');
  });

  it("defaults an empty query to '*' (browse all)", async () => {
    await run({ query: '' });
    expect(lastParams().q).toBe('*');
  });
});
