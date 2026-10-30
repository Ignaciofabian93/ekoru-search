import { Args, Query, Resolver } from '@nestjs/graphql';
import { CurrentAdmin } from '../common/decorators/current-seller.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { assertAdminCan, businessAdminSellerId } from '../common/admin-access';
import { Language } from '../graphql/enums';
import { AnalyticsService } from './analytics.service';
import {
  AnalyticsArgs,
  BusinessSalesArgs,
  PlatformAnalyticsArgs,
} from './dto/analytics.args';
import {
  BusinessAnalytics,
  BusinessItemPerformance,
  BusinessSalesConnection,
  BusinessSearchInsights,
  PlatformAnalytics,
} from './entities/analytics.entity';

/**
 * The panel's dashboards. Platform admins with VIEW_ANALYTICS read EKORU's
 * totals; a business's own admins read that business's figures, and nobody
 * else can, platform admins included.
 */
@Resolver()
export class AnalyticsResolver {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  @Query(() => PlatformAnalytics, {
    name: 'platformAnalytics',
    description: 'EKORU-wide totals for the period. VIEW_ANALYTICS.',
  })
  async platformAnalytics(
    @Args() { range, language }: PlatformAnalyticsArgs,
    @CurrentAdmin() adminId?: string,
  ): Promise<PlatformAnalytics> {
    await assertAdminCan(this.prisma, adminId, 'VIEW_ANALYTICS');
    return this.analytics.platform({
      range,
      language: language ?? Language.ES,
    });
  }

  @Query(() => BusinessAnalytics, {
    name: 'businessAnalytics',
    description: "The caller's business: headline figures and series.",
  })
  async businessAnalytics(
    @Args() { range }: AnalyticsArgs,
    @CurrentAdmin() adminId?: string,
  ): Promise<BusinessAnalytics> {
    const sellerId = await businessAdminSellerId(this.prisma, adminId);
    return this.analytics.business({ range, sellerId });
  }

  @Query(() => [BusinessItemPerformance], {
    name: 'businessItemPerformance',
    description: "The caller's business: each item's views, likes and sales.",
  })
  async businessItemPerformance(
    @Args() { range }: AnalyticsArgs,
    @CurrentAdmin() adminId?: string,
  ): Promise<BusinessItemPerformance[]> {
    const sellerId = await businessAdminSellerId(this.prisma, adminId);
    return this.analytics.businessItems({ range, sellerId });
  }

  @Query(() => BusinessSalesConnection, {
    name: 'businessSales',
    description: "The caller's business: its payments, newest first.",
  })
  async businessSales(
    @Args() { range, page, pageSize }: BusinessSalesArgs,
    @CurrentAdmin() adminId?: string,
  ): Promise<BusinessSalesConnection> {
    const sellerId = await businessAdminSellerId(this.prisma, adminId);
    return this.analytics.businessSales({ range, sellerId, page, pageSize });
  }

  @Query(() => BusinessSearchInsights, {
    name: 'businessSearchInsights',
    description:
      "The caller's business: how buyers find it, and what EKORU searches for.",
  })
  async businessSearchInsights(
    @Args() { range }: AnalyticsArgs,
    @CurrentAdmin() adminId?: string,
  ): Promise<BusinessSearchInsights> {
    const sellerId = await businessAdminSellerId(this.prisma, adminId);
    return this.analytics.businessSearch({ range, sellerId });
  }
}
