import { AnalyticsResolver } from './analytics.resolver';
import { AnalyticsService, rate, toBusinessTotals } from './analytics.service';
import { AnalyticsRange, RANGES, windowsSql } from './analytics-period';
import { businessAdminSellerId } from '../common/admin-access';
import { PrismaService } from '../prisma/prisma.service';

type AdminRow = {
  adminType: string;
  role: string;
  permissions: string[];
  isActive: boolean;
  sellerId: string | null;
};

const admin = (over: Partial<AdminRow> = {}): AdminRow => ({
  adminType: 'PLATFORM',
  role: 'MODERATOR',
  permissions: [],
  isActive: true,
  sellerId: null,
  ...over,
});

/** A business admin allowed to read its figures. */
const bizAdmin = (over: Partial<AdminRow> = {}): AdminRow =>
  admin({
    adminType: 'BUSINESS',
    sellerId: 's1',
    permissions: ['VIEW_BUSINESS_ANALYTICS'],
    ...over,
  });

const prismaReturning = (rows: AdminRow[]) =>
  ({
    $queryRaw: jest.fn().mockResolvedValue(rows),
  }) as unknown as PrismaService;

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { extensions?: { code?: string } }).extensions?.code;
  }
};

describe('businessAdminSellerId', () => {
  it("returns an active business admin's own seller", async () => {
    const prisma = prismaReturning([bizAdmin()]);
    expect(await businessAdminSellerId(prisma, 'a1')).toBe('s1');
  });

  it('refuses platform admins, even a super admin with every permission', async () => {
    const prisma = prismaReturning([
      admin({ role: 'SUPER_ADMIN', permissions: ['VIEW_ANALYTICS'] }),
    ]);
    expect(await codeOf(businessAdminSellerId(prisma, 'a2'))).toBe('FORBIDDEN');
  });

  it('refuses a business admin without VIEW_BUSINESS_ANALYTICS, deactivated, or with no seller', async () => {
    for (const row of [
      bizAdmin({ permissions: ['MANAGE_BUSINESS_PROFILE'] }),
      bizAdmin({ isActive: false }),
      bizAdmin({ sellerId: null }),
    ]) {
      expect(
        await codeOf(businessAdminSellerId(prismaReturning([row]), 'a3')),
      ).toBe('FORBIDDEN');
    }
  });

  it('rejects a signed-out caller as UNAUTHORIZED', async () => {
    expect(
      await codeOf(businessAdminSellerId(prismaReturning([]), undefined)),
    ).toBe('UNAUTHORIZED');
  });
});

describe('AnalyticsResolver', () => {
  const analytics = {
    platform: jest.fn().mockResolvedValue({}),
    business: jest.fn().mockResolvedValue({}),
    businessItems: jest.fn().mockResolvedValue([]),
    businessSales: jest.fn().mockResolvedValue({}),
    businessSearch: jest.fn().mockResolvedValue({}),
  };
  const range = AnalyticsRange.LAST_30_DAYS;

  beforeEach(() => jest.clearAllMocks());

  it('reads platform totals only with VIEW_ANALYTICS', async () => {
    const allowed = new AnalyticsResolver(
      analytics as unknown as AnalyticsService,
      prismaReturning([admin({ permissions: ['VIEW_ANALYTICS'] })]),
    );
    await allowed.platformAnalytics({ range }, 'a1');
    expect(analytics.platform).toHaveBeenCalledWith({
      range,
      language: 'ES',
    });

    const business = new AnalyticsResolver(
      analytics as unknown as AnalyticsService,
      prismaReturning([bizAdmin()]),
    );
    expect(await codeOf(business.platformAnalytics({ range }, 'b1'))).toBe(
      'FORBIDDEN',
    );
  });

  it("scopes every business query to the caller's seller, never another", async () => {
    const resolver = new AnalyticsResolver(
      analytics as unknown as AnalyticsService,
      prismaReturning([bizAdmin()]),
    );
    await resolver.businessAnalytics({ range }, 'b1');
    await resolver.businessItemPerformance({ range }, 'b1');
    await resolver.businessSales({ range, page: 2, pageSize: 50 }, 'b1');
    await resolver.businessSearchInsights({ range }, 'b1');

    expect(analytics.business).toHaveBeenCalledWith({ range, sellerId: 's1' });
    expect(analytics.businessItems).toHaveBeenCalledWith({
      range,
      sellerId: 's1',
    });
    expect(analytics.businessSales).toHaveBeenCalledWith({
      range,
      sellerId: 's1',
      page: 2,
      pageSize: 50,
    });
    expect(analytics.businessSearch).toHaveBeenCalledWith({
      range,
      sellerId: 's1',
    });
  });
});

describe('figures', () => {
  it('caps rates at 1 and never divides by zero', () => {
    expect(rate(1, 4)).toBe(0.25);
    expect(rate(5, 2)).toBe(1);
    expect(rate(3, 0)).toBe(0);
  });

  it('nets fees and refunds out of a business payout', () => {
    const totals = toBusinessTotals({
      key: 'current',
      gross_sales: 55000,
      fees: 5000,
      refunded: 5000,
      orders: 2,
      paid_quotes: 1,
      quotes_requested: 2,
      quotes_accepted: 1,
      bookings: 2,
      deals: 1,
      views: 8,
      likes: 3,
      reviews: 2,
      co2: 10,
      water: 100,
    });
    expect(totals.netPayout).toBe(45000);
    expect(totals.averageTicket).toBeCloseTo(55000 / 3);
    expect(totals.conversionRate).toBe(7 / 8);
  });

  it('builds each range from fixed SQL, with one bucket per point', () => {
    expect(RANGES[AnalyticsRange.LAST_90_DAYS]).toEqual({
      bucket: 'WEEK',
      unit: 'week',
      buckets: 13,
    });
    const sql = windowsSql(AnalyticsRange.LAST_12_MONTHS);
    expect(sql.text).toContain("interval '11 month'");
    expect(sql.text).toContain("'America/Santiago'");
    expect(sql.values).toEqual([]);
  });
});
