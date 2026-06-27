import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchResultType } from '../entities/search-result.entity';
import {
  SEARCH_ENGINE,
  type SearchEngine,
  type CatalogDocument,
} from '../engine/search-engine.interface';
import { Locale, SUPPORTED_LOCALES, localeFromSeller } from './locale.config';

/**
 * Incremental sync window. The cron runs every 5 min and re-reads everything
 * changed in the last ~11 min (> 2× the interval). Upserts are idempotent, so
 * the deliberate overlap is harmless and means we don't need a persisted
 * "last run" cursor (no extra migration) in v1.
 */
const SYNC_WINDOW_MS = 11 * 60 * 1000;

/** A document plus the locale collection it belongs in. */
interface LocatedDoc {
  locale: Locale;
  doc: CatalogDocument;
}

/** Raw row shared shape (seller locale columns joined onto every source). */
interface SellerLocaleCols {
  sellerId: string | null;
  countryId: number | null;
  regionName: string | null;
}

@Injectable()
export class CatalogIndexerService {
  private readonly logger = new Logger(CatalogIndexerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SEARCH_ENGINE) private readonly engine: SearchEngine,
  ) {}

  /** Full rebuild: (re)create collections and upsert every active item. */
  async reindexAll(): Promise<{ indexed: number }> {
    await this.engine.ensureCollections();
    const located = [
      ...(await this.loadProducts(
        Prisma.sql`p."deletedAt" IS NULL AND p."isActive" = true`,
      )),
      ...(await this.loadStoreProducts(
        Prisma.sql`sp."deletedAt" IS NULL AND sp."isActive" = true`,
      )),
      ...(await this.loadServices(Prisma.sql`s."isActive" = true`)),
    ];
    await this.indexGrouped(located);
    this.logger.log(`Reindex complete: ${located.length} documents`);
    return { indexed: located.length };
  }

  /** Periodic catch-up: upsert recently-changed items, drop deactivated ones. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncIncremental(): Promise<void> {
    try {
      await this.engine.ensureCollections();
      const since = new Date(Date.now() - SYNC_WINDOW_MS);

      const changed = [
        ...(await this.loadProducts(
          Prisma.sql`p."deletedAt" IS NULL AND p."isActive" = true AND p."updatedAt" >= ${since}`,
        )),
        ...(await this.loadStoreProducts(
          Prisma.sql`sp."deletedAt" IS NULL AND sp."isActive" = true AND sp."updatedAt" >= ${since}`,
        )),
        ...(await this.loadServices(
          Prisma.sql`s."isActive" = true AND s."updatedAt" >= ${since}`,
        )),
      ];
      await this.indexGrouped(changed);

      const removedIds = await this.loadDeactivatedIds(since);
      await this.removeFromAllLocales(removedIds);

      if (changed.length || removedIds.length) {
        this.logger.log(
          `Incremental sync: ${changed.length} upserted, ${removedIds.length} removed`,
        );
      }
    } catch (error) {
      this.logger.error('Incremental catalog sync failed:', error);
    }
  }

  // ---- grouping / engine calls --------------------------------------------

  private async indexGrouped(located: LocatedDoc[]): Promise<void> {
    for (const locale of SUPPORTED_LOCALES) {
      const docs = located.filter((l) => l.locale === locale).map((l) => l.doc);
      await this.engine.indexDocuments(locale, docs);
    }
  }

  /** A removed item's locale may be unknown, so delete from every collection. */
  private async removeFromAllLocales(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const locale of SUPPORTED_LOCALES) {
      await this.engine.deleteDocuments(locale, ids);
    }
  }

  // ---- loaders (reuse FullTextSearchStrategy SELECT shapes) ----------------

  private async loadProducts(where: Prisma.Sql): Promise<LocatedDoc[]> {
    const rows = await this.prisma.$queryRaw<
      (SellerLocaleCols & {
        id: number;
        name: string;
        description: string | null;
        price: number | null;
        offerPrice: number | null;
        hasOffer: boolean | null;
        images: string[] | null;
        brand: string | null;
        tags: string[] | null;
        category: string | null;
        createdAt: Date;
      })[]
    >`
      SELECT p.id, p.name, p.description, p.price, p."offerPrice", p."hasOffer",
             p.images, p.brand, p.interests AS tags, p."createdAt",
             pc."productCategoryName" AS category,
             p."sellerId", s."countryId", r.region AS "regionName"
      FROM "Product" p
      LEFT JOIN "ProductCategory" pc ON p."productCategoryId" = pc.id
      LEFT JOIN "Seller" s ON p."sellerId" = s.id
      LEFT JOIN "Region" r ON s."regionId" = r.id
      WHERE ${where}
    `;

    return rows.map((row) => ({
      locale: localeFromSeller(row),
      doc: {
        id: `product_${row.id}`,
        entityId: row.id,
        type: SearchResultType.PRODUCT,
        name: row.name,
        description: row.description ?? undefined,
        brand: row.brand ?? undefined,
        category: row.category ?? undefined,
        tags: row.tags ?? [],
        images: row.images ?? [],
        price: row.price ?? undefined,
        offerPrice: row.offerPrice ?? undefined,
        hasOffer: row.hasOffer ?? false,
        sellerId: row.sellerId ?? undefined,
        createdAt: this.toUnix(row.createdAt),
      },
    }));
  }

  private async loadStoreProducts(where: Prisma.Sql): Promise<LocatedDoc[]> {
    const rows = await this.prisma.$queryRaw<
      (SellerLocaleCols & {
        id: number;
        name: string;
        description: string | null;
        price: number | null;
        offerPrice: number | null;
        hasOffer: boolean | null;
        images: string[] | null;
        brand: string | null;
        tags: string[] | null;
        rating: number | null;
        reviewCount: number | null;
        category: string | null;
        subcategory: string | null;
        createdAt: Date;
      })[]
    >`
      SELECT sp.id, sp.name, sp.description, sp.price, sp."offerPrice", sp."hasOffer",
             sp.images, sp.brand, sp.tags, sp.ratings AS rating,
             sp."reviewsNumber" AS "reviewCount", sp."createdAt",
             ssc."subCategory" AS subcategory, sc.category AS category,
             sp."sellerId", s."countryId", r.region AS "regionName"
      FROM "StoreProduct" sp
      LEFT JOIN "StoreSubCategory" ssc ON sp."subcategoryId" = ssc.id
      LEFT JOIN "StoreCategory" sc ON ssc."storeCategoryId" = sc.id
      LEFT JOIN "Seller" s ON sp."sellerId" = s.id
      LEFT JOIN "Region" r ON s."regionId" = r.id
      WHERE ${where}
    `;

    return rows.map((row) => ({
      locale: localeFromSeller(row),
      doc: {
        id: `store_${row.id}`,
        entityId: row.id,
        type: SearchResultType.STORE_PRODUCT,
        name: row.name,
        description: row.description ?? undefined,
        brand: row.brand ?? undefined,
        category: row.category ?? undefined,
        subcategory: row.subcategory ?? undefined,
        tags: row.tags ?? [],
        images: row.images ?? [],
        price: row.price ?? undefined,
        offerPrice: row.offerPrice ?? undefined,
        hasOffer: row.hasOffer ?? false,
        rating: row.rating ?? undefined,
        reviewCount: row.reviewCount ?? undefined,
        sellerId: row.sellerId ?? undefined,
        createdAt: this.toUnix(row.createdAt),
      },
    }));
  }

  private async loadServices(where: Prisma.Sql): Promise<LocatedDoc[]> {
    const rows = await this.prisma.$queryRaw<
      (SellerLocaleCols & {
        id: number;
        name: string;
        description: string | null;
        price: number | null;
        images: string[] | null;
        tags: string[] | null;
        rating: number | null;
        category: string | null;
        subcategory: string | null;
        createdAt: Date;
      })[]
    >`
      SELECT s.id, s.name, s.description, s."basePrice" AS price, s.images, s.tags,
             s."averageRating" AS rating, s."createdAt",
             sc."subCategory" AS subcategory, scat.category AS category,
             s."sellerId", sel."countryId", r.region AS "regionName"
      FROM "Service" s
      LEFT JOIN "ServiceSubCategory" sc ON s."subcategoryId" = sc.id
      LEFT JOIN "ServiceCategory" scat ON sc."serviceCategoryId" = scat.id
      LEFT JOIN "Seller" sel ON s."sellerId" = sel.id
      LEFT JOIN "Region" r ON sel."regionId" = r.id
      WHERE ${where}
    `;

    return rows.map((row) => ({
      locale: localeFromSeller(row),
      doc: {
        id: `service_${row.id}`,
        entityId: row.id,
        type: SearchResultType.SERVICE,
        name: row.name,
        description: row.description ?? undefined,
        category: row.category ?? undefined,
        subcategory: row.subcategory ?? undefined,
        tags: row.tags ?? [],
        images: row.images ?? [],
        price: row.price ?? undefined,
        hasOffer: false,
        rating: row.rating ?? undefined,
        sellerId: row.sellerId ?? undefined,
        createdAt: this.toUnix(row.createdAt),
      },
    }));
  }

  /**
   * Namespaced ids of items deactivated/soft-deleted since `since`, to evict
   * from the index. (Hard-deleted services disappear from SQL and are cleaned
   * up by the next full reindex.)
   */
  private async loadDeactivatedIds(since: Date): Promise<string[]> {
    const products = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Product"
      WHERE "updatedAt" >= ${since} AND ("deletedAt" IS NOT NULL OR "isActive" = false)
    `;
    const storeProducts = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM "StoreProduct"
      WHERE "updatedAt" >= ${since} AND ("deletedAt" IS NOT NULL OR "isActive" = false)
    `;
    const services = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Service"
      WHERE "updatedAt" >= ${since} AND "isActive" = false
    `;

    return [
      ...products.map((r) => `product_${r.id}`),
      ...storeProducts.map((r) => `store_${r.id}`),
      ...services.map((r) => `service_${r.id}`),
    ];
  }

  private toUnix(date: Date): number {
    return Math.floor(new Date(date).getTime() / 1000);
  }
}
