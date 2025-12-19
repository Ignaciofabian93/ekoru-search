import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { Cron, CronExpression } from "@nestjs/schedule";

@Injectable()
export class TrendingService {
  private readonly logger = new Logger(TrendingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Update trending scores every hour
  @Cron(CronExpression.EVERY_HOUR)
  async updateTrendingScores() {
    try {
      this.logger.log("Updating trending search scores...");
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Calculate trending score based on recent activity
      await this.prisma.$executeRaw`
        UPDATE "PopularSearch"
        SET "trendingScore" = (
          -- Recent searches weighted more heavily (last 24 hours)
          (
            SELECT COALESCE(COUNT(*), 0)
            FROM "SearchLog" 
            WHERE "SearchLog".query = "PopularSearch".query 
            AND "SearchLog"."createdAt" > ${oneDayAgo}
          ) * 10.0
          +
          -- Clicks are valuable (last 7 days)
          (
            SELECT COALESCE(COUNT(*), 0)
            FROM "SearchClick" sc
            JOIN "SearchLog" sl ON sc."searchId" = sl.id
            WHERE sl.query = "PopularSearch".query
            AND sc."clickedAt" > ${oneWeekAgo}
          ) * 5.0
          +
          -- Overall search count (with decay)
          "searchCount" * 0.1
        )
        WHERE "lastSearched" > ${oneWeekAgo}
      `;

      // Reset old trending scores
      const resetCount = await this.prisma.popularSearch.updateMany({
        where: { lastSearched: { lt: oneWeekAgo } },
        data: { trendingScore: 0 },
      });

      this.logger.log(
        `Trending scores updated. Reset ${resetCount.count} old scores.`
      );
    } catch (error) {
      this.logger.error("Error updating trending scores:", error);
    }
  }

  // Clean up old search logs (run daily at midnight)
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldSearchLogs() {
    try {
      this.logger.log("Cleaning up old search logs...");
      const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      // Delete search logs older than 3 months
      const deleted = await this.prisma.searchLog.deleteMany({
        where: {
          createdAt: { lt: threeMonthsAgo },
        },
      });

      this.logger.log(`Deleted ${deleted.count} old search logs.`);
    } catch (error) {
      this.logger.error("Error cleaning up search logs:", error);
    }
  }

  // Update search suggestions based on frequency (run daily)
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async updateSearchSuggestions() {
    try {
      this.logger.log("Updating search suggestions...");
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Get popular queries from the last week
      const popularQueries = await this.prisma.searchLog.groupBy({
        by: ["query"],
        where: {
          createdAt: { gte: oneWeekAgo },
          resultCount: { gt: 0 }, // Only queries that returned results
        },
        _count: {
          query: true,
        },
        orderBy: {
          _count: {
            query: "desc",
          },
        },
        take: 100,
      });

      // Upsert suggestions
      for (const { query, _count } of popularQueries) {
        await this.prisma.searchSuggestion.upsert({
          where: { term: query },
          update: {
            frequency: _count.query,
            updatedAt: new Date(),
          },
          create: {
            term: query,
            frequency: _count.query,
            isActive: true,
          },
        });
      }

      this.logger.log(`Updated ${popularQueries.length} search suggestions.`);
    } catch (error) {
      this.logger.error("Error updating search suggestions:", error);
    }
  }

  // Deactivate unpopular suggestions (run weekly)
  @Cron(CronExpression.EVERY_WEEK)
  async deactivateUnpopularSuggestions() {
    try {
      this.logger.log("Deactivating unpopular search suggestions...");
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      // Deactivate suggestions that haven't been updated in 2 weeks
      const deactivated = await this.prisma.searchSuggestion.updateMany({
        where: {
          updatedAt: { lt: twoWeeksAgo },
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      this.logger.log(
        `Deactivated ${deactivated.count} unpopular suggestions.`
      );
    } catch (error) {
      this.logger.error("Error deactivating suggestions:", error);
    }
  }
}
