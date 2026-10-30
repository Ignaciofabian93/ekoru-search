import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsResolver } from './analytics.resolver';
import { AnalyticsService } from './analytics.service';

/** The panel's dashboards: EKORU totals and each business's own figures. */
@Module({
  imports: [PrismaModule],
  providers: [AnalyticsService, AnalyticsResolver],
})
export class AnalyticsModule {}
