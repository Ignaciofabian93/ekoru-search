import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  SearchResultItem,
  SearchResultType,
} from '../entities/search-result.entity';

@Injectable()
export class FullTextSearchStrategy {
  constructor(private readonly prisma: PrismaService) {}

  async searchProducts(
    searchTerms: string[],
    filters: {
      minPrice?: number;
      maxPrice?: number;
      categories?: string[];
      tags?: string[];
      hasOffer?: boolean;
      minRating?: number;
      excludeSellerId?: string;
    },
  ): Promise<SearchResultItem[]> {
    const searchQuery = searchTerms.join(' & ');

    const minPriceCondition = filters.minPrice
      ? Prisma.sql`AND p.price >= ${filters.minPrice}`
      : Prisma.empty;
    const maxPriceCondition = filters.maxPrice
      ? Prisma.sql`AND p.price <= ${filters.maxPrice}`
      : Prisma.empty;
    // Marketplace products have no offer columns (that's StoreProduct), so the
    // hasOffer filter never applies here.
    const hasOfferCondition = Prisma.empty;
    // Hide the current user's own products from their search results.
    const excludeSellerCondition = filters.excludeSellerId
      ? Prisma.sql`AND p."sellerId" <> ${filters.excludeSellerId}`
      : Prisma.empty;

    const products = await this.prisma.$queryRaw<any[]>`
      SELECT 
        p.id,
        p.name,
        p.description,
        p.price,
        p.images,
        p.brand,
        p."sellerId",
        p.interests as tags,
        p."viewCount",
        pc."productCategoryName" as category,
        ts_rank(
          to_tsvector('spanish', p.name || ' ' || COALESCE(p.description, '') || ' ' || p.brand),
          plainto_tsquery('spanish', ${searchQuery})
        ) as relevance_score
      FROM "Product" p
      LEFT JOIN "ProductCategory" pc ON p."productCategoryId" = pc.id
      WHERE 
        p."isActive" = true 
        AND p."deletedAt" IS NULL
        AND (
          to_tsvector('spanish', p.name || ' ' || COALESCE(p.description, '') || ' ' || p.brand) 
          @@ plainto_tsquery('spanish', ${searchQuery})
        )
        ${minPriceCondition}
        ${maxPriceCondition}
        ${hasOfferCondition}
        ${excludeSellerCondition}
      ORDER BY relevance_score DESC, p."createdAt" DESC
      LIMIT 100
    `;

    return products.map((p) => ({
      id: p.id,
      type: SearchResultType.PRODUCT,
      name: p.name,
      description: p.description,
      price: p.price,
      offerPrice: undefined,
      hasOffer: false,
      images: p.images || [],
      category: p.category,
      subcategory: undefined,
      rating: undefined,
      reviewCount: undefined,
      sellerId: p.sellerId,
      sellerName: undefined,
      tags: p.tags || [],
      relevanceScore: parseFloat(p.relevance_score),
      highlightedName: undefined,
      highlightedDescription: undefined,
    }));
  }

  async searchStoreProducts(
    searchTerms: string[],
    filters: {
      minPrice?: number;
      maxPrice?: number;
      categories?: string[];
      tags?: string[];
      hasOffer?: boolean;
      minRating?: number;
      excludeSellerId?: string;
    },
  ): Promise<SearchResultItem[]> {
    const searchQuery = searchTerms.join(' & ');

    const minPriceCondition = filters.minPrice
      ? Prisma.sql`AND sp.price >= ${filters.minPrice}`
      : Prisma.empty;
    const maxPriceCondition = filters.maxPrice
      ? Prisma.sql`AND sp.price <= ${filters.maxPrice}`
      : Prisma.empty;
    const hasOfferCondition =
      filters.hasOffer !== undefined
        ? Prisma.sql`AND sp."hasOffer" = ${filters.hasOffer}`
        : Prisma.empty;
    const minRatingCondition = filters.minRating
      ? Prisma.sql`AND sp.ratings >= ${filters.minRating}`
      : Prisma.empty;
    // Hide the current user's own store products from their search results.
    const excludeSellerCondition = filters.excludeSellerId
      ? Prisma.sql`AND sp."sellerId" <> ${filters.excludeSellerId}`
      : Prisma.empty;

    const storeProducts = await this.prisma.$queryRaw<any[]>`
      SELECT 
        sp.id,
        sp.name,
        sp.description,
        sp.price,
        sp."offerPrice",
        sp."hasOffer",
        sp.images,
        sp.brand,
        sp.ratings as "averageRating",
        sp."reviewsNumber" as "reviewCount",
        sp."sellerId",
        sp."viewCount",
        sp."saleCount",
        ssc."subCategory" as subcategory,
        sc.category,
        ts_rank(
          to_tsvector('spanish', sp.name || ' ' || sp.description || ' ' || COALESCE(sp.brand, '')),
          plainto_tsquery('spanish', ${searchQuery})
        ) as relevance_score
      FROM "StoreProduct" sp
      LEFT JOIN "StoreSubCategory" ssc ON sp."subcategoryId" = ssc.id
      LEFT JOIN "StoreCategory" sc ON ssc."storeCategoryId" = sc.id
      WHERE 
        sp."isActive" = true 
        AND sp."deletedAt" IS NULL
        AND (
          to_tsvector('spanish', sp.name || ' ' || sp.description || ' ' || COALESCE(sp.brand, '')) 
          @@ plainto_tsquery('spanish', ${searchQuery})
        )
        ${minPriceCondition}
        ${maxPriceCondition}
        ${hasOfferCondition}
        ${minRatingCondition}
        ${excludeSellerCondition}
      ORDER BY relevance_score DESC, sp."createdAt" DESC
      LIMIT 100
    `;

    return storeProducts.map((sp) => ({
      id: sp.id,
      type: SearchResultType.STORE_PRODUCT,
      name: sp.name,
      description: sp.description,
      price: sp.price,
      offerPrice: sp.offerPrice,
      hasOffer: sp.hasOffer,
      images: sp.images || [],
      category: sp.category,
      subcategory: sp.subcategory,
      rating: sp.averageRating,
      reviewCount: sp.reviewCount,
      sellerId: sp.sellerId,
      sellerName: undefined,
      tags: [],
      relevanceScore: parseFloat(sp.relevance_score),
      highlightedName: undefined,
      highlightedDescription: undefined,
    }));
  }

  async searchServices(
    searchTerms: string[],
    filters: {
      minPrice?: number;
      maxPrice?: number;
      categories?: string[];
      tags?: string[];
      minRating?: number;
      excludeSellerId?: string;
    },
  ): Promise<SearchResultItem[]> {
    const searchQuery = searchTerms.join(' & ');

    const minPriceCondition = filters.minPrice
      ? Prisma.sql`AND s."basePrice" >= ${filters.minPrice}`
      : Prisma.empty;
    const maxPriceCondition = filters.maxPrice
      ? Prisma.sql`AND s."basePrice" <= ${filters.maxPrice}`
      : Prisma.empty;
    const minRatingCondition = filters.minRating
      ? Prisma.sql`AND s."averageRating" >= ${filters.minRating}`
      : Prisma.empty;
    // Hide the current user's own services from their search results.
    const excludeSellerCondition = filters.excludeSellerId
      ? Prisma.sql`AND s."sellerId" <> ${filters.excludeSellerId}`
      : Prisma.empty;

    const services = await this.prisma.$queryRaw<any[]>`
      SELECT 
        s.id,
        s.name,
        s.description,
        s."basePrice" as price,
        s.images,
        s.tags,
        s."sellerId",
        s."viewCount",
        s."averageRating",
        sc."subCategory" as subcategory,
        scat.category,
        ts_rank(
          to_tsvector('spanish', s.name || ' ' || COALESCE(s.description, '')),
          plainto_tsquery('spanish', ${searchQuery})
        ) as relevance_score
      FROM "Service" s
      LEFT JOIN "ServiceSubCategory" sc ON s."subcategoryId" = sc.id
      LEFT JOIN "ServiceCategory" scat ON sc."serviceCategoryId" = scat.id
      WHERE 
        s."isActive" = true
        AND (
          to_tsvector('spanish', s.name || ' ' || COALESCE(s.description, '')) 
          @@ plainto_tsquery('spanish', ${searchQuery})
        )
        ${minPriceCondition}
        ${maxPriceCondition}
        ${minRatingCondition}
        ${excludeSellerCondition}
      ORDER BY relevance_score DESC, s."createdAt" DESC
      LIMIT 100
    `;

    return services.map((s) => ({
      id: s.id,
      type: SearchResultType.SERVICE,
      name: s.name,
      description: s.description,
      price: s.price,
      offerPrice: undefined,
      hasOffer: false,
      images: s.images || [],
      category: s.category,
      subcategory: s.subcategory,
      rating: s.averageRating,
      reviewCount: undefined,
      sellerId: s.sellerId,
      sellerName: undefined,
      tags: s.tags || [],
      relevanceScore: parseFloat(s.relevance_score),
      highlightedName: undefined,
      highlightedDescription: undefined,
    }));
  }
}
