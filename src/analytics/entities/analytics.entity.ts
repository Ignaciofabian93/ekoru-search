import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { AnalyticsBucket, AnalyticsRange } from '../analytics-period';
import { SearchAdminPageInfo } from '../../adminSearch/entities';

// Amounts are Chilean pesos (CLP), the currency of every payment provider EKORU
// uses; payments in any other currency are left out of the sums.

@ObjectType()
export class AnalyticsPeriod {
  @Field(() => AnalyticsRange) range: AnalyticsRange;
  @Field(() => AnalyticsBucket) bucket: AnalyticsBucket;
  @Field(() => String, { description: 'Start of the period (UTC, ISO 8601)' })
  from: string;
  @Field(() => String, { description: 'End of the period: now (UTC)' })
  to: string;
  @Field(() => String, { description: 'Start of the previous period' })
  previousFrom: string;
}

/** A count, and an amount when the thing has one, under a fixed key. */
@ObjectType()
export class AnalyticsBreakdown {
  @Field(() => String) key: string;
  @Field(() => Int) count: number;
  @Field(() => Float) amount: number;
}

@ObjectType()
export class AnalyticsSearchTerm {
  @Field(() => String) query: string;
  @Field(() => Int) searches: number;
  @Field(() => Int) clicks: number;
}

@ObjectType()
export class AnalyticsCategory {
  @Field(() => String, { description: 'MARKETPLACE, STORE or SERVICE' })
  catalog: string;
  @Field(() => String) name: string;
  @Field(() => Int) views: number;
}

// ─── Platform (EKORU) ────────────────────────────────────────────────────────

@ObjectType()
export class PlatformTotals {
  @Field(() => Float, {
    description: 'Paid orders and quotes, refunds included (they are below)',
  })
  grossSales: number;
  @Field(() => Float, {
    description: "EKORU's revenue: commissions plus memberships",
  })
  revenue: number;
  @Field(() => Float, {
    description: 'Commissions on payments not fully refunded',
  })
  commissions: number;
  @Field(() => Float) memberships: number;
  @Field(() => Int, { description: 'Paid orders and quotes' })
  payments: number;
  @Field(() => Float) averageTicket: number;
  @Field(() => Float) refunded: number;
  @Field(() => Int) failedPayments: number;
  @Field(() => Int, {
    description: 'Completed transactions of every kind',
  })
  transactions: number;
  @Field(() => Int) newSellers: number;
  @Field(() => Float) co2SavedKg: number;
  @Field(() => Float) waterSavedLt: number;
  @Field(() => Int) views: number;
  @Field(() => Int) searches: number;
}

@ObjectType()
export class PlatformSeriesPoint {
  @Field(() => String, { description: 'First day of the bucket (YYYY-MM-DD)' })
  bucket: string;
  @Field(() => Float) grossSales: number;
  @Field(() => Float) revenue: number;
  @Field(() => Int) storeOrders: number;
  @Field(() => Int) serviceQuotes: number;
  @Field(() => Int) serviceBookings: number;
  @Field(() => Int) marketplaceSales: number;
  @Field(() => Int) exchanges: number;
  @Field(() => Int) memberships: number;
  @Field(() => Int) newPersons: number;
  @Field(() => Int) newStartups: number;
  @Field(() => Int) newCompanies: number;
  @Field(() => Int) views: number;
}

@ObjectType()
export class PlatformListings {
  @Field(() => Int) marketplace: number;
  @Field(() => Int) store: number;
  @Field(() => Int) services: number;
}

@ObjectType({
  description:
    'EKORU-wide figures for platform admins. Totals only: never one business.',
})
export class PlatformAnalytics {
  @Field(() => AnalyticsPeriod) period: AnalyticsPeriod;
  @Field(() => PlatformTotals) current: PlatformTotals;
  @Field(() => PlatformTotals) previous: PlatformTotals;
  @Field(() => [PlatformSeriesPoint]) series: PlatformSeriesPoint[];
  @Field(() => [AnalyticsBreakdown], {
    description:
      'Completed transactions by kind: STORE_ORDER, SERVICE_QUOTE, SERVICE_BOOKING, MARKETPLACE_SALE, EXCHANGE, MEMBERSHIP',
  })
  transactionsByKind: AnalyticsBreakdown[];
  @Field(() => [AnalyticsBreakdown], {
    description: 'Payments started in the period, by status',
  })
  paymentsByStatus: AnalyticsBreakdown[];
  @Field(() => [AnalyticsBreakdown], {
    description: 'New sellers by type: PERSON, STARTUP, COMPANY',
  })
  newSellersByType: AnalyticsBreakdown[];
  @Field(() => [AnalyticsSearchTerm]) topSearches: AnalyticsSearchTerm[];
  @Field(() => [AnalyticsSearchTerm], {
    description: 'Searches that found nothing',
  })
  unmetSearches: AnalyticsSearchTerm[];
  @Field(() => [AnalyticsCategory]) topCategories: AnalyticsCategory[];
  @Field(() => PlatformListings, { description: 'Active listings now' })
  listings: PlatformListings;
}

// ─── Business (one seller, its own admins only) ──────────────────────────────

@ObjectType()
export class BusinessTotals {
  @Field(() => Float) grossSales: number;
  @Field(() => Float, { description: "EKORU's commission" })
  fees: number;
  @Field(() => Float) refunded: number;
  @Field(() => Float, { description: 'Gross sales less fees and refunds' })
  netPayout: number;
  @Field(() => Int, { description: 'Paid orders' })
  orders: number;
  @Field(() => Int, { description: 'Paid quotes' })
  paidQuotes: number;
  @Field(() => Float) averageTicket: number;
  @Field(() => Int) quotesRequested: number;
  @Field(() => Int) quotesAccepted: number;
  @Field(() => Int) bookings: number;
  @Field(() => Int, { description: 'Completed marketplace deals' })
  deals: number;
  @Field(() => Int) views: number;
  @Field(() => Int, { description: 'New likes' })
  likes: number;
  @Field(() => Float, {
    description: 'Orders, quote requests and bookings per view (0 to 1)',
  })
  conversionRate: number;
  @Field(() => Int, { description: 'Reviews received' })
  reviews: number;
  @Field(() => Float) co2SavedKg: number;
  @Field(() => Float) waterSavedLt: number;
}

@ObjectType()
export class BusinessSeriesPoint {
  @Field(() => String) bucket: string;
  @Field(() => Float) grossSales: number;
  @Field(() => Float) netPayout: number;
  @Field(() => Int) orders: number;
  @Field(() => Int) views: number;
}

@ObjectType({ description: "A business's own figures" })
export class BusinessAnalytics {
  @Field(() => AnalyticsPeriod) period: AnalyticsPeriod;
  @Field(() => BusinessTotals) current: BusinessTotals;
  @Field(() => BusinessTotals) previous: BusinessTotals;
  @Field(() => [BusinessSeriesPoint]) series: BusinessSeriesPoint[];
  @Field(() => Float, {
    nullable: true,
    description: 'Average rating of all its reviews, ever',
  })
  rating: number | null;
}

@ObjectType()
export class BusinessItemPerformance {
  @Field(() => Int) itemId: number;
  @Field(() => String, { description: 'PRODUCT, STORE_PRODUCT or SERVICE' })
  itemType: string;
  @Field(() => String) name: string;
  @Field(() => Boolean) isActive: boolean;
  @Field(() => Int) views: number;
  @Field(() => Int, { description: 'New likes in the period' })
  likes: number;
  @Field(() => Int, { description: 'Likes ever' })
  totalLikes: number;
  @Field(() => Int, { description: 'Units in paid orders, or deals' })
  unitsSold: number;
  @Field(() => Float) revenue: number;
  @Field(() => Int) quoteRequests: number;
  @Field(() => Int) bookings: number;
  @Field(() => Float, { description: 'Sales, quotes and bookings per view' })
  conversionRate: number;
  @Field(() => Float, { nullable: true }) rating: number | null;
  @Field(() => Int) reviews: number;
}

@ObjectType()
export class BusinessSale {
  @Field(() => Int) paymentId: number;
  @Field(() => String, { description: 'When it was paid, or started (ISO)' })
  date: string;
  @Field(() => String, { description: 'ORDER or QUOTATION' })
  type: string;
  @Field(() => Int, { nullable: true }) orderId: number | null;
  @Field(() => Int, { nullable: true }) quotationId: number | null;
  @Field(() => String) status: string;
  @Field(() => Float) amount: number;
  @Field(() => Float) fee: number;
  @Field(() => Float) refunded: number;
  @Field(() => Float, {
    description: 'Amount less fee and refunds; 0 unless paid',
  })
  net: number;
  @Field(() => Int, { description: 'Units in the order' })
  units: number;
}

@ObjectType()
export class BusinessSalesConnection {
  @Field(() => [BusinessSale]) nodes: BusinessSale[];
  @Field(() => SearchAdminPageInfo) pageInfo: SearchAdminPageInfo;
}

@ObjectType()
export class BusinessSearchInsights {
  @Field(() => AnalyticsPeriod) period: AnalyticsPeriod;
  @Field(() => [AnalyticsSearchTerm], {
    description: 'What buyers searched before clicking its items',
  })
  foundBy: AnalyticsSearchTerm[];
  @Field(() => [AnalyticsBreakdown], {
    description:
      'Where the views of its items came from: SEARCH, CATALOG, SELLER, HOME, ITEM, EXTERNAL, OTHER',
  })
  viewsBySource: AnalyticsBreakdown[];
  @Field(() => [AnalyticsSearchTerm], {
    description: 'Most searched on EKORU',
  })
  topSearches: AnalyticsSearchTerm[];
  @Field(() => [AnalyticsSearchTerm], {
    description: 'Searches on EKORU that found nothing: unmet demand',
  })
  unmetSearches: AnalyticsSearchTerm[];
}
