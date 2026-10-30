import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AnalyticsRange,
  RANGES,
  periodSql,
  windowsSql,
} from './analytics-period';
import {
  AnalyticsBreakdown,
  AnalyticsCategory,
  AnalyticsPeriod,
  AnalyticsSearchTerm,
  BusinessAnalytics,
  BusinessItemPerformance,
  BusinessSalesConnection,
  BusinessSearchInsights,
  BusinessTotals,
  PlatformAnalytics,
  PlatformListings,
  PlatformTotals,
} from './entities/analytics.entity';

/**
 * Analytics for the panel: EKORU-wide totals for platform admins, and each
 * business's own figures for its admins.
 *
 * Read-only SQL over tables other subgraphs own (payments, orders, quotes,
 * bookings, deals, sellers, likes, reviews, impact records) next to this
 * subgraph's own views and searches. They share one database, and one reporting
 * module keeps every figure on the same period and time zone rules. INF-12
 * (a database role per service) must grant this service SELECT on them.
 *
 * Rules every figure follows:
 * - A sale is a paid ORDER or QUOTATION payment in CLP, dated when it was
 *   paid. Refunded ones still count as sales; their refunds are reported
 *   apart, so gross less refunds is what stayed.
 * - EKORU keeps the commission unless the payment was fully refunded.
 * - Marketplace deals are settled in person, in cash: they count as
 *   transactions, never as money.
 * - Nothing here identifies a buyer or visitor, and searches are only listed
 *   once enough of them happened (MIN_SEARCHES, MIN_CLICKS), so a single
 *   person's search is never shown.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Platform ─────────────────────────────────────────────────────────────

  async platform({
    range,
    language,
  }: {
    range: AnalyticsRange;
    language: string;
  }): Promise<PlatformAnalytics> {
    const [
      period,
      totals,
      series,
      paymentsByStatus,
      topSearches,
      unmetSearches,
      topCategories,
      listings,
    ] = await Promise.all([
      this.period(range),
      this.prisma.$queryRaw<PlatformRow[]>(platformMetricsSql(range, 'w')),
      this.prisma.$queryRaw<PlatformRow[]>(platformMetricsSql(range, 'b')),
      this.prisma.$queryRaw<AnalyticsBreakdown[]>(Prisma.sql`
        WITH ${windowsSql(range)}
        SELECT pay.status::text AS key,
               COUNT(*)::int AS count,
               COALESCE(SUM(pay.amount), 0)::float8 AS amount
        FROM "Payment" pay, p
        WHERE pay.currency = 'CLP'
          AND pay."createdAt" >= p.from_utc AND pay."createdAt" < p.to_utc
        GROUP BY pay.status
        ORDER BY count DESC`),
      this.searchTerms({ range, unmet: false }),
      this.searchTerms({ range, unmet: true }),
      this.prisma.$queryRaw<AnalyticsCategory[]>(
        topCategoriesSql(range, language),
      ),
      this.prisma.$queryRaw<PlatformListings[]>(Prisma.sql`
        SELECT
          (SELECT COUNT(*) FROM "Product"
            WHERE "isActive" AND "deletedAt" IS NULL AND "soldAt" IS NULL)::int AS marketplace,
          (SELECT COUNT(*) FROM "StoreProduct" WHERE "isActive")::int AS store,
          (SELECT COUNT(*) FROM "Service" WHERE "isActive")::int AS services`),
    ]);

    const current = totals.find((r) => r.key === 'current') ?? EMPTY_PLATFORM;
    const previous = totals.find((r) => r.key === 'previous') ?? EMPTY_PLATFORM;

    return {
      period,
      current: toPlatformTotals(current),
      previous: toPlatformTotals(previous),
      series: series.map((r) => ({
        bucket: r.key,
        grossSales: r.order_amount + r.quote_amount,
        revenue: r.commissions + r.membership_amount,
        storeOrders: r.store_orders,
        serviceQuotes: r.service_quotes,
        serviceBookings: r.service_bookings,
        marketplaceSales: r.marketplace_sales,
        exchanges: r.exchanges,
        memberships: r.memberships,
        newPersons: r.new_persons,
        newStartups: r.new_startups,
        newCompanies: r.new_companies,
        views: r.views,
      })),
      transactionsByKind: [
        {
          key: 'STORE_ORDER',
          count: current.store_orders,
          amount: current.order_amount,
        },
        {
          key: 'SERVICE_QUOTE',
          count: current.service_quotes,
          amount: current.quote_amount,
        },
        {
          key: 'SERVICE_BOOKING',
          count: current.service_bookings,
          amount: current.booking_amount,
        },
        {
          key: 'MARKETPLACE_SALE',
          count: current.marketplace_sales,
          amount: 0,
        },
        { key: 'EXCHANGE', count: current.exchanges, amount: 0 },
        {
          key: 'MEMBERSHIP',
          count: current.memberships,
          amount: current.membership_amount,
        },
      ],
      paymentsByStatus,
      newSellersByType: [
        { key: 'PERSON', count: current.new_persons, amount: 0 },
        { key: 'STARTUP', count: current.new_startups, amount: 0 },
        { key: 'COMPANY', count: current.new_companies, amount: 0 },
      ],
      topSearches,
      unmetSearches,
      topCategories,
      listings: listings[0] ?? { marketplace: 0, store: 0, services: 0 },
    };
  }

  // ─── Business ─────────────────────────────────────────────────────────────

  async business({
    range,
    sellerId,
  }: {
    range: AnalyticsRange;
    sellerId: string;
  }): Promise<BusinessAnalytics> {
    const [period, totals, series, rating] = await Promise.all([
      this.period(range),
      this.prisma.$queryRaw<BusinessRow[]>(
        businessMetricsSql({ range, sellerId, over: 'w' }),
      ),
      this.prisma.$queryRaw<BusinessRow[]>(
        businessMetricsSql({ range, sellerId, over: 'b' }),
      ),
      this.prisma.$queryRaw<{ rating: number | null }[]>(Prisma.sql`
        WITH ${itemsSql(sellerId)}
        SELECT AVG(r.rating)::float8 AS rating FROM (
          SELECT rv.rating FROM "StoreProductReview" rv
            JOIN items i ON i.t = 'STORE_PRODUCT' AND i.id = rv."storeProductId"
          UNION ALL
          SELECT rv.rating FROM "ServiceReview" rv
            JOIN items i ON i.t = 'SERVICE' AND i.id = rv."serviceId"
        ) r`),
    ]);

    const current = totals.find((r) => r.key === 'current') ?? EMPTY_BUSINESS;
    const previous = totals.find((r) => r.key === 'previous') ?? EMPTY_BUSINESS;

    return {
      period,
      current: toBusinessTotals(current),
      previous: toBusinessTotals(previous),
      series: series.map((r) => ({
        bucket: r.key,
        grossSales: r.gross_sales,
        netPayout: r.gross_sales - r.fees - r.refunded,
        orders: r.orders + r.paid_quotes,
        views: r.views,
      })),
      rating: rating[0]?.rating ?? null,
    };
  }

  async businessItems({
    range,
    sellerId,
  }: {
    range: AnalyticsRange;
    sellerId: string;
  }): Promise<BusinessItemPerformance[]> {
    const rows = await this.prisma.$queryRaw<ItemRow[]>(
      itemPerformanceSql({ range, sellerId }),
    );
    return rows.map((r) => ({
      itemId: r.id,
      itemType: r.t,
      name: r.name,
      isActive: r.active,
      views: r.views,
      likes: r.likes,
      totalLikes: r.total_likes,
      unitsSold: r.units_sold,
      revenue: r.revenue,
      quoteRequests: r.quote_requests,
      bookings: r.bookings,
      conversionRate: rate(r.conversions, r.views),
      rating: r.rating,
      reviews: r.reviews,
    }));
  }

  async businessSales({
    range,
    sellerId,
    page,
    pageSize,
  }: {
    range: AnalyticsRange;
    sellerId: string;
    page: number;
    pageSize: number;
  }): Promise<BusinessSalesConnection> {
    const salesCte = Prisma.sql`
      WITH ${windowsSql(range)},
      s AS (
        SELECT pay.id,
               COALESCE(pay."processedAt", pay."createdAt") AS at,
               pay."paymentType"::text AS type,
               pay."orderId",
               pay."quotationId",
               pay.status::text AS status,
               pay.amount::float8 AS amount,
               COALESCE(pay.fees, 0)::float8 AS fee
        FROM "Payment" pay, p
        WHERE pay."receiverId" = ${sellerId}
          AND pay."paymentType" IN ('ORDER', 'QUOTATION')
          AND pay.currency = 'CLP'
          AND COALESCE(pay."processedAt", pay."createdAt") >= p.from_utc
          AND COALESCE(pay."processedAt", pay."createdAt") < p.to_utc
      )`;
    const [count, rows] = await Promise.all([
      this.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
        ${salesCte}
        SELECT COUNT(*)::int AS total FROM s`),
      this.prisma.$queryRaw<SaleRow[]>(Prisma.sql`
        ${salesCte}
        SELECT s.id, s.type, s."orderId", s."quotationId", s.status, s.amount, s.fee,
               to_char(s.at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS date,
               COALESCE((SELECT SUM(r.amount) FROM "PaymentRefund" r
                         WHERE r."paymentId" = s.id AND r.status = 'COMPLETED'), 0)::float8 AS refunded,
               COALESCE((SELECT SUM(oi.quantity) FROM "OrderItem" oi
                         WHERE oi."orderId" = s."orderId"), 0)::int AS units
        FROM s
        ORDER BY s.at DESC, s.id DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    ]);

    const totalCount = count[0]?.total ?? 0;
    const totalPages = Math.ceil(totalCount / pageSize);
    return {
      nodes: rows.map((r) => {
        const paid = PAID.includes(r.status);
        const fee = KEPT.includes(r.status) ? r.fee : 0;
        return {
          paymentId: r.id,
          date: r.date,
          type: r.type,
          orderId: r.orderId,
          quotationId: r.quotationId,
          status: r.status,
          amount: r.amount,
          fee,
          refunded: r.refunded,
          net: paid ? r.amount - fee - r.refunded : 0,
          units: r.units,
        };
      }),
      pageInfo: {
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        startCursor: null,
        endCursor: null,
        totalCount,
        totalPages,
        currentPage: page,
        pageSize,
      },
    };
  }

  async businessSearch({
    range,
    sellerId,
  }: {
    range: AnalyticsRange;
    sellerId: string;
  }): Promise<BusinessSearchInsights> {
    const [period, foundBy, viewsBySource, topSearches, unmetSearches] =
      await Promise.all([
        this.period(range),
        this.prisma.$queryRaw<AnalyticsSearchTerm[]>(Prisma.sql`
          WITH ${windowsSql(range)}, ${itemsSql(sellerId)}
          SELECT l.query,
                 COUNT(DISTINCT l.id)::int AS searches,
                 COUNT(*)::int AS clicks
          FROM "SearchClick" c
          JOIN items i ON i.t = c."itemType" AND i.id = c."itemId"
          JOIN "SearchLog" l ON l.id = c."searchId"
          JOIN p ON c."clickedAt" >= p.from_utc AND c."clickedAt" < p.to_utc
          GROUP BY l.query
          HAVING COUNT(*) >= ${MIN_CLICKS}
          ORDER BY clicks DESC, l.query
          LIMIT 15`),
        this.prisma.$queryRaw<AnalyticsBreakdown[]>(Prisma.sql`
          WITH ${windowsSql(range)}, ${itemsSql(sellerId)}
          SELECT COALESCE(v.source, 'OTHER') AS key,
                 COUNT(*)::int AS count,
                 0::float8 AS amount
          FROM "ItemView" v
          JOIN items i ON i.t = v."itemType" AND i.id = v."itemId"
          JOIN p ON v."viewedAt" >= p.from_utc AND v."viewedAt" < p.to_utc
          GROUP BY 1
          ORDER BY count DESC`),
        this.searchTerms({ range, unmet: false, limit: 15 }),
        this.searchTerms({ range, unmet: true, limit: 15 }),
      ]);
    return { period, foundBy, viewsBySource, topSearches, unmetSearches };
  }

  // ─── Shared ───────────────────────────────────────────────────────────────

  private async period(range: AnalyticsRange): Promise<AnalyticsPeriod> {
    const rows = await this.prisma.$queryRaw<
      { w: string; f: string; t: string }[]
    >(periodSql(range));
    const current = rows.find((r) => r.w === 'current');
    const previous = rows.find((r) => r.w === 'previous');
    return {
      range,
      bucket: RANGES[range].bucket,
      from: current?.f ?? '',
      to: current?.t ?? '',
      previousFrom: previous?.f ?? '',
    };
  }

  /** The most frequent searches in the period, or those that found nothing. */
  private searchTerms({
    range,
    unmet,
    limit = 10,
  }: {
    range: AnalyticsRange;
    unmet: boolean;
    limit?: number;
  }): Promise<AnalyticsSearchTerm[]> {
    return this.prisma.$queryRaw<AnalyticsSearchTerm[]>(Prisma.sql`
      WITH ${windowsSql(range)},
      logs AS (
        SELECT l.id, l.query
        FROM "SearchLog" l, p
        WHERE l."createdAt" >= p.from_utc AND l."createdAt" < p.to_utc
          ${unmet ? Prisma.sql`AND l."resultCount" = 0` : Prisma.empty}
      ),
      clicks AS (
        SELECT c."searchId", COUNT(*) AS n
        FROM "SearchClick" c
        WHERE c."searchId" IN (SELECT id FROM logs)
        GROUP BY c."searchId"
      )
      SELECT logs.query,
             COUNT(*)::int AS searches,
             COALESCE(SUM(clicks.n), 0)::int AS clicks
      FROM logs
      LEFT JOIN clicks ON clicks."searchId" = logs.id
      GROUP BY logs.query
      HAVING COUNT(*) >= ${MIN_SEARCHES}
      ORDER BY searches DESC, logs.query
      LIMIT ${limit}`);
  }
}

/** A search term is listed only once this many searches used it. */
export const MIN_SEARCHES = 3;
/** A term that led to a business's items is listed from this many clicks. */
export const MIN_CLICKS = 2;

/** Payment statuses that mean it was paid, refunded or not. */
const PAID = ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'];
/** Paid payments EKORU keeps its commission on. */
const KEPT = ['COMPLETED', 'PARTIALLY_REFUNDED'];

const PAID_SQL = Prisma.raw(`('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')`);
const KEPT_SQL = Prisma.raw(`('COMPLETED', 'PARTIALLY_REFUNDED')`);

/** `col` falls in the window row `x` (bounds `f`, `t`). */
const inX = (col: string) => Prisma.raw(`${col} >= x.f AND ${col} < x.t`);

/**
 * Ratio for display, from 0 to 1. Capped: a quote or a deal can start without
 * a counted view (an older app version reports none), and a rate above 100%
 * would only confuse.
 */
export function rate(part: number, whole: number): number {
  return whole > 0 ? Math.min(1, part / whole) : 0;
}

/**
 * Platform figures for each row of `w` (current and previous period) or `b`
 * (series buckets), keyed by `key`.
 */
function platformMetricsSql(
  range: AnalyticsRange,
  over: 'w' | 'b',
): Prisma.Sql {
  const key = Prisma.raw(over === 'w' ? 'x.w' : 'x.bucket');
  const from = Prisma.raw(over);
  const paidIn = Prisma.sql`pay.currency = 'CLP' AND ${inX(`COALESCE(pay."processedAt", pay."createdAt")`)}`;
  return Prisma.sql`
    WITH ${windowsSql(range)}
    SELECT ${key} AS key,
      (SELECT COALESCE(SUM(pay.amount), 0) FROM "Payment" pay
        WHERE pay."paymentType" = 'ORDER' AND pay.status IN ${PAID_SQL} AND ${paidIn})::float8 AS order_amount,
      (SELECT COUNT(*) FROM "Payment" pay
        WHERE pay."paymentType" = 'ORDER' AND pay.status IN ${PAID_SQL} AND ${paidIn})::int AS store_orders,
      (SELECT COALESCE(SUM(pay.amount), 0) FROM "Payment" pay
        WHERE pay."paymentType" = 'QUOTATION' AND pay.status IN ${PAID_SQL} AND ${paidIn})::float8 AS quote_amount,
      (SELECT COUNT(*) FROM "Payment" pay
        WHERE pay."paymentType" = 'QUOTATION' AND pay.status IN ${PAID_SQL} AND ${paidIn})::int AS service_quotes,
      (SELECT COALESCE(SUM(pay.fees), 0) FROM "Payment" pay
        WHERE pay."paymentType" IN ('ORDER', 'QUOTATION') AND pay.status IN ${KEPT_SQL} AND ${paidIn})::float8 AS commissions,
      (SELECT COALESCE(SUM(pay.amount), 0) FROM "Payment" pay
        WHERE pay."paymentType" = 'MEMBERSHIP' AND pay.status = 'COMPLETED' AND ${paidIn})::float8 AS membership_amount,
      (SELECT COUNT(*) FROM "Payment" pay
        WHERE pay."paymentType" = 'MEMBERSHIP' AND pay.status = 'COMPLETED' AND ${paidIn})::int AS memberships,
      (SELECT COALESCE(SUM(r.amount), 0) FROM "PaymentRefund" r
        JOIN "Payment" pay ON pay.id = r."paymentId"
        WHERE r.status = 'COMPLETED' AND pay.currency = 'CLP'
          AND ${inX(`COALESCE(r."processedAt", r."createdAt")`)})::float8 AS refunded,
      (SELECT COUNT(*) FROM "Payment" pay
        WHERE pay.status = 'FAILED' AND ${inX(`pay."createdAt"`)})::int AS failed_payments,
      (SELECT COUNT(*) FROM "ServiceBooking" sb
        WHERE sb.status = 'COMPLETED' AND ${inX(`COALESCE(sb."completedAt", sb."updatedAt")`)})::int AS service_bookings,
      (SELECT COALESCE(SUM(sb."agreedPrice"), 0) FROM "ServiceBooking" sb
        WHERE sb.status = 'COMPLETED' AND ${inX(`COALESCE(sb."completedAt", sb."updatedAt")`)})::float8 AS booking_amount,
      (SELECT COUNT(*) FROM "P2PDeal" d
        WHERE d.type = 'SALE' AND d.status = 'COMPLETED' AND ${inX(`d."completedAt"`)})::int AS marketplace_sales,
      (SELECT COUNT(*) FROM "P2PDeal" d
        WHERE d.type = 'EXCHANGE' AND d.status = 'COMPLETED' AND ${inX(`d."completedAt"`)})::int AS exchanges,
      (SELECT COUNT(*) FROM "Seller" s
        WHERE s."sellerType" = 'PERSON' AND ${inX(`s."createdAt"`)})::int AS new_persons,
      (SELECT COUNT(*) FROM "Seller" s
        WHERE s."sellerType" = 'STARTUP' AND ${inX(`s."createdAt"`)})::int AS new_startups,
      (SELECT COUNT(*) FROM "Seller" s
        WHERE s."sellerType" = 'COMPANY' AND ${inX(`s."createdAt"`)})::int AS new_companies,
      (SELECT COALESCE(SUM(ir."co2SavingsKG"), 0) FROM "SellerImpactRecord" ir
        WHERE ir."countsTowardPlatformTotal" AND ${inX(`ir."occurredAt"`)})::float8 AS co2,
      (SELECT COALESCE(SUM(ir."waterSavingsLT"), 0) FROM "SellerImpactRecord" ir
        WHERE ir."countsTowardPlatformTotal" AND ${inX(`ir."occurredAt"`)})::float8 AS water,
      (SELECT COUNT(*) FROM "ItemView" v WHERE ${inX(`v."viewedAt"`)})::int AS views,
      (SELECT COUNT(*) FROM "SearchLog" l WHERE ${inX(`l."createdAt"`)})::int AS searches
    FROM ${from} x
    ORDER BY 1`;
}

/** Every item the seller lists, in the three catalogs, as CTE `items`. */
function itemsSql(sellerId: string): Prisma.Sql {
  return Prisma.sql`
    items AS (
      SELECT 'STORE_PRODUCT'::text AS t, sp.id, sp.name, sp."isActive" AS active
      FROM "StoreProduct" sp WHERE sp."sellerId" = ${sellerId}
      UNION ALL
      SELECT 'SERVICE'::text, s.id, s.name, s."isActive"
      FROM "Service" s WHERE s."sellerId" = ${sellerId}
      UNION ALL
      SELECT 'PRODUCT'::text, pr.id, pr.name, pr."isActive" AND pr."deletedAt" IS NULL
      FROM "Product" pr WHERE pr."sellerId" = ${sellerId}
    )`;
}

/** One seller's figures for each row of `w` or `b`, keyed by `key`. */
function businessMetricsSql({
  range,
  sellerId,
  over,
}: {
  range: AnalyticsRange;
  sellerId: string;
  over: 'w' | 'b';
}): Prisma.Sql {
  const key = Prisma.raw(over === 'w' ? 'x.w' : 'x.bucket');
  const from = Prisma.raw(over);
  const mine = Prisma.sql`pay."receiverId" = ${sellerId} AND pay.currency = 'CLP' AND ${inX(`COALESCE(pay."processedAt", pay."createdAt")`)}`;
  return Prisma.sql`
    WITH ${windowsSql(range)}, ${itemsSql(sellerId)}
    SELECT ${key} AS key,
      (SELECT COALESCE(SUM(pay.amount), 0) FROM "Payment" pay
        WHERE pay."paymentType" IN ('ORDER', 'QUOTATION') AND pay.status IN ${PAID_SQL} AND ${mine})::float8 AS gross_sales,
      (SELECT COALESCE(SUM(pay.fees), 0) FROM "Payment" pay
        WHERE pay."paymentType" IN ('ORDER', 'QUOTATION') AND pay.status IN ${KEPT_SQL} AND ${mine})::float8 AS fees,
      (SELECT COALESCE(SUM(r.amount), 0) FROM "PaymentRefund" r
        JOIN "Payment" pay ON pay.id = r."paymentId"
        WHERE r.status = 'COMPLETED' AND pay."receiverId" = ${sellerId} AND pay.currency = 'CLP'
          AND ${inX(`COALESCE(r."processedAt", r."createdAt")`)})::float8 AS refunded,
      (SELECT COUNT(*) FROM "Payment" pay
        WHERE pay."paymentType" = 'ORDER' AND pay.status IN ${PAID_SQL} AND ${mine})::int AS orders,
      (SELECT COUNT(*) FROM "Payment" pay
        WHERE pay."paymentType" = 'QUOTATION' AND pay.status IN ${PAID_SQL} AND ${mine})::int AS paid_quotes,
      (SELECT COUNT(*) FROM "Quotation" q
        WHERE q."providerId" = ${sellerId} AND ${inX(`q."createdAt"`)})::int AS quotes_requested,
      (SELECT COUNT(*) FROM "Quotation" q
        WHERE q."providerId" = ${sellerId} AND ${inX(`q."acceptedAt"`)})::int AS quotes_accepted,
      (SELECT COUNT(*) FROM "ServiceBooking" sb
        WHERE sb."providerId" = ${sellerId} AND ${inX(`sb."createdAt"`)})::int AS bookings,
      (SELECT COUNT(*) FROM "P2PDeal" d
        WHERE d."sellerId" = ${sellerId} AND d.status = 'COMPLETED' AND ${inX(`d."completedAt"`)})::int AS deals,
      (SELECT COUNT(*) FROM "ItemView" v
        JOIN items i ON i.t = v."itemType" AND i.id = v."itemId"
        WHERE ${inX(`v."viewedAt"`)})::int AS views,
      ((SELECT COUNT(*) FROM "StoreProductLike" l
          JOIN items i ON i.t = 'STORE_PRODUCT' AND i.id = l."storeProductId"
          WHERE ${inX(`l."createdAt"`)})
       + (SELECT COUNT(*) FROM "ServiceLike" l
          JOIN items i ON i.t = 'SERVICE' AND i.id = l."serviceId"
          WHERE ${inX(`l."createdAt"`)})
       + (SELECT COUNT(*) FROM "MarketplaceProductLike" l
          JOIN items i ON i.t = 'PRODUCT' AND i.id = l."productId"
          WHERE ${inX(`l."createdAt"`)}))::int AS likes,
      ((SELECT COUNT(*) FROM "StoreProductReview" rv
          JOIN items i ON i.t = 'STORE_PRODUCT' AND i.id = rv."storeProductId"
          WHERE ${inX(`rv."createdAt"`)})
       + (SELECT COUNT(*) FROM "ServiceReview" rv
          JOIN items i ON i.t = 'SERVICE' AND i.id = rv."serviceId"
          WHERE ${inX(`rv."createdAt"`)}))::int AS reviews,
      (SELECT COALESCE(SUM(ir."co2SavingsKG"), 0) FROM "SellerImpactRecord" ir
        WHERE ir."sellerId" = ${sellerId} AND ${inX(`ir."occurredAt"`)})::float8 AS co2,
      (SELECT COALESCE(SUM(ir."waterSavingsLT"), 0) FROM "SellerImpactRecord" ir
        WHERE ir."sellerId" = ${sellerId} AND ${inX(`ir."occurredAt"`)})::float8 AS water
    FROM ${from} x
    ORDER BY 1`;
}

/** Per item: views, likes, sales and reviews in the period (`p`). */
function itemPerformanceSql({
  range,
  sellerId,
}: {
  range: AnalyticsRange;
  sellerId: string;
}): Prisma.Sql {
  const inP = (col: string) =>
    Prisma.raw(`${col} >= p.from_utc AND ${col} < p.to_utc`);
  return Prisma.sql`
    WITH ${windowsSql(range)}, ${itemsSql(sellerId)},
    m AS (
      SELECT i.t, i.id, i.name, i.active,
        (SELECT COUNT(*) FROM "ItemView" v
          WHERE v."itemType" = i.t AND v."itemId" = i.id AND ${inP(`v."viewedAt"`)})::int AS views,
        (CASE i.t
          WHEN 'STORE_PRODUCT' THEN (SELECT COUNT(*) FROM "StoreProductLike" l
            WHERE l."storeProductId" = i.id AND ${inP(`l."createdAt"`)})
          WHEN 'SERVICE' THEN (SELECT COUNT(*) FROM "ServiceLike" l
            WHERE l."serviceId" = i.id AND ${inP(`l."createdAt"`)})
          ELSE (SELECT COUNT(*) FROM "MarketplaceProductLike" l
            WHERE l."productId" = i.id AND ${inP(`l."createdAt"`)})
        END)::int AS likes,
        (CASE i.t
          WHEN 'STORE_PRODUCT' THEN (SELECT COUNT(*) FROM "StoreProductLike" l WHERE l."storeProductId" = i.id)
          WHEN 'SERVICE' THEN (SELECT COUNT(*) FROM "ServiceLike" l WHERE l."serviceId" = i.id)
          ELSE (SELECT COUNT(*) FROM "MarketplaceProductLike" l WHERE l."productId" = i.id)
        END)::int AS total_likes,
        (CASE i.t
          WHEN 'STORE_PRODUCT' THEN (SELECT COALESCE(SUM(oi.quantity), 0) FROM "OrderItem" oi
            JOIN "Order" o ON o.id = oi."orderId"
            WHERE oi."storeProductId" = i.id AND o.status = 'PAID' AND ${inP(`o."createdAt"`)})
          WHEN 'SERVICE' THEN
            (SELECT COUNT(*) FROM "Payment" pay JOIN "Quotation" q ON q.id = pay."quotationId"
              WHERE q."serviceId" = i.id AND pay.status IN ${PAID_SQL} AND ${inP(`COALESCE(pay."processedAt", pay."createdAt")`)})
            + (SELECT COUNT(*) FROM "ServiceBooking" sb
              WHERE sb."serviceId" = i.id AND sb.status = 'COMPLETED' AND ${inP(`COALESCE(sb."completedAt", sb."updatedAt")`)})
          ELSE (SELECT COUNT(*) FROM "P2PDeal" d
            WHERE d."productId" = i.id AND d.type = 'SALE' AND d.status = 'COMPLETED' AND ${inP(`d."completedAt"`)})
        END)::int AS units_sold,
        (CASE i.t
          WHEN 'STORE_PRODUCT' THEN (SELECT COALESCE(SUM(oi.price * oi.quantity), 0) FROM "OrderItem" oi
            JOIN "Order" o ON o.id = oi."orderId"
            WHERE oi."storeProductId" = i.id AND o.status = 'PAID' AND ${inP(`o."createdAt"`)})
          WHEN 'SERVICE' THEN
            (SELECT COALESCE(SUM(pay.amount), 0) FROM "Payment" pay JOIN "Quotation" q ON q.id = pay."quotationId"
              WHERE q."serviceId" = i.id AND pay.status IN ${PAID_SQL} AND pay.currency = 'CLP'
                AND ${inP(`COALESCE(pay."processedAt", pay."createdAt")`)})
            + (SELECT COALESCE(SUM(sb."agreedPrice"), 0) FROM "ServiceBooking" sb
              WHERE sb."serviceId" = i.id AND sb.status = 'COMPLETED' AND ${inP(`COALESCE(sb."completedAt", sb."updatedAt")`)})
          ELSE 0
        END)::float8 AS revenue,
        (CASE WHEN i.t = 'SERVICE' THEN (SELECT COUNT(*) FROM "Quotation" q
          WHERE q."serviceId" = i.id AND ${inP(`q."createdAt"`)}) ELSE 0 END)::int AS quote_requests,
        (CASE WHEN i.t = 'SERVICE' THEN (SELECT COUNT(*) FROM "ServiceBooking" sb
          WHERE sb."serviceId" = i.id AND ${inP(`sb."createdAt"`)}) ELSE 0 END)::int AS bookings,
        (CASE i.t
          WHEN 'STORE_PRODUCT' THEN (SELECT COUNT(DISTINCT o.id) FROM "OrderItem" oi
            JOIN "Order" o ON o.id = oi."orderId"
            WHERE oi."storeProductId" = i.id AND o.status = 'PAID' AND ${inP(`o."createdAt"`)})
          WHEN 'SERVICE' THEN 0
          ELSE (SELECT COUNT(*) FROM "P2PDeal" d
            WHERE d."productId" = i.id AND ${inP(`d."createdAt"`)})
        END)::int AS sales_started,
        (CASE i.t
          WHEN 'STORE_PRODUCT' THEN (SELECT AVG(rv.rating) FROM "StoreProductReview" rv WHERE rv."storeProductId" = i.id)
          WHEN 'SERVICE' THEN (SELECT AVG(rv.rating) FROM "ServiceReview" rv WHERE rv."serviceId" = i.id)
        END)::float8 AS rating,
        (CASE i.t
          WHEN 'STORE_PRODUCT' THEN (SELECT COUNT(*) FROM "StoreProductReview" rv WHERE rv."storeProductId" = i.id)
          WHEN 'SERVICE' THEN (SELECT COUNT(*) FROM "ServiceReview" rv WHERE rv."serviceId" = i.id)
          ELSE 0
        END)::int AS reviews
      FROM items i, p
    )
    SELECT m.*, (m.sales_started + m.quote_requests + m.bookings)::int AS conversions
    FROM m
    ORDER BY m.views DESC, m.revenue DESC, m.id
    LIMIT 1000`;
}

/** The most viewed categories in the period, across the three catalogs. */
function topCategoriesSql(range: AnalyticsRange, language: string): Prisma.Sql {
  // The caller's language first, then Spanish, which every row has.
  const order = Prisma.sql`ORDER BY (t.language::text = ${language}) DESC, (t.language::text = 'ES') DESC LIMIT 1`;
  return Prisma.sql`
    WITH ${windowsSql(range)},
    v AS (
      SELECT v."itemType", v."itemId", COUNT(*) AS n
      FROM "ItemView" v, p
      WHERE v."viewedAt" >= p.from_utc AND v."viewedAt" < p.to_utc
      GROUP BY 1, 2
    ),
    cats AS (
      SELECT 'STORE'::text AS catalog, sp."subCategoryId" AS cid, v.n FROM v
        JOIN "StoreProduct" sp ON v."itemType" = 'STORE_PRODUCT' AND sp.id = v."itemId"
      UNION ALL
      SELECT 'SERVICE'::text, s."subcategoryId", v.n FROM v
        JOIN "Service" s ON v."itemType" = 'SERVICE' AND s.id = v."itemId"
      UNION ALL
      SELECT 'MARKETPLACE'::text, pr."productCategoryId", v.n FROM v
        JOIN "Product" pr ON v."itemType" = 'PRODUCT' AND pr.id = v."itemId"
    ),
    agg AS (
      SELECT catalog, cid, SUM(n)::int AS views
      FROM cats GROUP BY 1, 2
      ORDER BY views DESC LIMIT 10
    )
    SELECT agg.catalog, agg.views,
      COALESCE(CASE agg.catalog
        WHEN 'STORE' THEN (SELECT t.name FROM "StoreSubCategoryTranslation" t
          WHERE t."storeSubCategoryId" = agg.cid ${order})
        WHEN 'SERVICE' THEN (SELECT t."subCategory" FROM "ServiceSubCategoryTranslation" t
          WHERE t."serviceSubCategoryId" = agg.cid ${order})
        ELSE (SELECT t.name FROM "ProductCategoryTranslation" t
          WHERE t."productCategoryId" = agg.cid ${order})
      END, '#' || agg.cid) AS name
    FROM agg
    ORDER BY agg.views DESC`;
}

// ─── Row shapes and mapping ──────────────────────────────────────────────────

interface PlatformRow {
  key: string;
  order_amount: number;
  store_orders: number;
  quote_amount: number;
  service_quotes: number;
  commissions: number;
  membership_amount: number;
  memberships: number;
  refunded: number;
  failed_payments: number;
  service_bookings: number;
  booking_amount: number;
  marketplace_sales: number;
  exchanges: number;
  new_persons: number;
  new_startups: number;
  new_companies: number;
  co2: number;
  water: number;
  views: number;
  searches: number;
}

const EMPTY_PLATFORM: PlatformRow = {
  key: '',
  order_amount: 0,
  store_orders: 0,
  quote_amount: 0,
  service_quotes: 0,
  commissions: 0,
  membership_amount: 0,
  memberships: 0,
  refunded: 0,
  failed_payments: 0,
  service_bookings: 0,
  booking_amount: 0,
  marketplace_sales: 0,
  exchanges: 0,
  new_persons: 0,
  new_startups: 0,
  new_companies: 0,
  co2: 0,
  water: 0,
  views: 0,
  searches: 0,
};

export function toPlatformTotals(r: PlatformRow): PlatformTotals {
  const grossSales = r.order_amount + r.quote_amount;
  const payments = r.store_orders + r.service_quotes;
  return {
    grossSales,
    revenue: r.commissions + r.membership_amount,
    commissions: r.commissions,
    memberships: r.membership_amount,
    payments,
    averageTicket: payments > 0 ? grossSales / payments : 0,
    refunded: r.refunded,
    failedPayments: r.failed_payments,
    transactions:
      r.store_orders +
      r.service_quotes +
      r.service_bookings +
      r.marketplace_sales +
      r.exchanges +
      r.memberships,
    newSellers: r.new_persons + r.new_startups + r.new_companies,
    co2SavedKg: r.co2,
    waterSavedLt: r.water,
    views: r.views,
    searches: r.searches,
  };
}

interface BusinessRow {
  key: string;
  gross_sales: number;
  fees: number;
  refunded: number;
  orders: number;
  paid_quotes: number;
  quotes_requested: number;
  quotes_accepted: number;
  bookings: number;
  deals: number;
  views: number;
  likes: number;
  reviews: number;
  co2: number;
  water: number;
}

const EMPTY_BUSINESS: BusinessRow = {
  key: '',
  gross_sales: 0,
  fees: 0,
  refunded: 0,
  orders: 0,
  paid_quotes: 0,
  quotes_requested: 0,
  quotes_accepted: 0,
  bookings: 0,
  deals: 0,
  views: 0,
  likes: 0,
  reviews: 0,
  co2: 0,
  water: 0,
};

export function toBusinessTotals(r: BusinessRow): BusinessTotals {
  const sales = r.orders + r.paid_quotes;
  return {
    grossSales: r.gross_sales,
    fees: r.fees,
    refunded: r.refunded,
    netPayout: r.gross_sales - r.fees - r.refunded,
    orders: r.orders,
    paidQuotes: r.paid_quotes,
    averageTicket: sales > 0 ? r.gross_sales / sales : 0,
    quotesRequested: r.quotes_requested,
    quotesAccepted: r.quotes_accepted,
    bookings: r.bookings,
    deals: r.deals,
    views: r.views,
    likes: r.likes,
    conversionRate: rate(
      r.orders + r.quotes_requested + r.bookings + r.deals,
      r.views,
    ),
    reviews: r.reviews,
    co2SavedKg: r.co2,
    waterSavedLt: r.water,
  };
}

interface ItemRow {
  t: string;
  id: number;
  name: string;
  active: boolean;
  views: number;
  likes: number;
  total_likes: number;
  units_sold: number;
  revenue: number;
  quote_requests: number;
  bookings: number;
  conversions: number;
  rating: number | null;
  reviews: number;
}

interface SaleRow {
  id: number;
  date: string;
  type: string;
  orderId: number | null;
  quotationId: number | null;
  status: string;
  amount: number;
  fee: number;
  refunded: number;
  units: number;
}
