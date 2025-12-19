# Search Service Improvement Plan

Complete guide to implement production-grade search functionality for Ekoru.

---

## Phase 1: Database Schema Improvements (CRITICAL)

### Step 1.1: Add PostgreSQL Extensions

**Priority: CRITICAL**

1. Create a new migration file:

```bash
npx prisma migrate dev --create-only --name add_search_extensions
```

2. Open the generated migration file in `prisma/migrations/` and add:

```sql
-- Enable trigram similarity search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable unaccent for handling Spanish characters
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Enable full-text search
CREATE EXTENSION IF NOT EXISTS btree_gin;
```

3. Apply the migration:

```bash
npx prisma migrate dev
```

---

### Step 1.2: Add Rating and Analytics Fields to Product

**Priority: HIGH**

1. Update `schema.prisma` - Add to `Product` model:

```prisma
model Product {
  // ... existing fields ...

  // Add these new fields:
  averageRating Float?        @default(0)
  ratingCount   Int           @default(0)
  reviewCount   Int           @default(0)
  viewCount     Int           @default(0)
  saleCount     Int           @default(0)

  // Add relation
  reviews       ProductReview[]

  // ... existing indexes ...

  // Add new indexes:
  @@index([averageRating])
  @@index([saleCount])
  @@index([viewCount])
}
```

2. Run migration:

```bash
npx prisma migrate dev --name add_product_analytics_fields
```

---

### Step 1.3: Create Product Review System

**Priority: HIGH**

1. Add to `schema.prisma`:

```prisma
model ProductReview {
  id                 Int      @id @default(autoincrement())
  productId          Int
  userId             String
  rating             Int      // 1-5
  comment            String?
  images             String[] // Review images
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  isVerifiedPurchase Boolean  @default(false)
  helpfulCount       Int      @default(0)

  product            Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([productId, userId])
  @@index([productId])
  @@index([rating])
  @@index([createdAt])
  @@index([isVerifiedPurchase])
}
```

2. Run migration:

```bash
npx prisma migrate dev --name add_product_reviews
```

---

### Step 1.4: Create Search Analytics Tables

**Priority: HIGH**

1. Update existing `SearchLog` model in `schema.prisma`:

```prisma
model SearchLog {
  id          Int      @id @default(autoincrement())
  query       String
  resultCount Int      @default(0)
  userId      String?
  sessionId   String?
  createdAt   DateTime @default(now())

  // Add relation
  clicks      SearchClick[]

  @@index([query])
  @@index([createdAt(sort: Desc)])
  @@index([userId])
  @@index([sessionId])
}
```

2. Add new analytics models:

```prisma
// Track search result clicks
model SearchClick {
  id         Int       @id @default(autoincrement())
  searchId   Int
  itemId     Int
  itemType   String    // PRODUCT, SERVICE, STORE_PRODUCT
  position   Int       // Position in results (1-based)
  clickedAt  DateTime  @default(now())
  userId     String?

  searchLog  SearchLog @relation(fields: [searchId], references: [id], onDelete: Cascade)

  @@index([searchId])
  @@index([itemId, itemType])
  @@index([clickedAt])
  @@index([userId])
}

// Track item views for recommendations
model ItemView {
  id        Int      @id @default(autoincrement())
  userId    String?
  sessionId String?
  itemId    Int
  itemType  String   // PRODUCT, SERVICE, STORE_PRODUCT
  viewedAt  DateTime @default(now())
  duration  Int?     // Time spent viewing in seconds
  source    String?  // search, recommendation, direct, etc.

  @@index([userId, viewedAt(sort: Desc)])
  @@index([sessionId, viewedAt(sort: Desc)])
  @@index([itemId, itemType])
  @@index([viewedAt])
}

// User search history
model UserSearchHistory {
  id         Int      @id @default(autoincrement())
  userId     String
  query      String
  resultCount Int     @default(0)
  searchedAt DateTime @default(now())

  @@index([userId, searchedAt(sort: Desc)])
  @@index([query])
}

// Track search sessions
model SearchSession {
  id             String    @id @default(cuid())
  userId         String?
  sessionId      String
  startedAt      DateTime  @default(now())
  endedAt        DateTime?
  searchCount    Int       @default(0)
  clickedResults Int       @default(0)

  @@index([userId])
  @@index([sessionId])
  @@index([startedAt])
}
```

3. Run migration:

```bash
npx prisma migrate dev --name add_search_analytics_tables
```

---

### Step 1.5: Add Search Enhancement Tables

**Priority: MEDIUM**

1. Add to `schema.prisma`:

```prisma
// Spell check corrections
model SearchCorrection {
  id             Int      @id @default(autoincrement())
  incorrectTerm  String
  correctTerm    String
  frequency      Int      @default(1)
  confidence     Float    @default(1.0) // 0-1 confidence score
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([incorrectTerm, correctTerm])
  @@index([incorrectTerm])
  @@index([frequency(sort: Desc)])
  @@index([isActive])
}

// Search synonyms for better matching
model SearchSynonym {
  id        Int      @id @default(autoincrement())
  term      String
  synonym   String
  weight    Float    @default(1.0) // Relevance weight
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  @@unique([term, synonym])
  @@index([term])
  @@index([isActive])
}

// Popular search terms (auto-updated)
model PopularSearch {
  id            Int      @id @default(autoincrement())
  query         String   @unique
  searchCount   Int      @default(0)
  clickCount    Int      @default(0)
  lastSearched  DateTime @default(now())
  trendingScore Float    @default(0) // Calculated score

  @@index([trendingScore(sort: Desc)])
  @@index([lastSearched(sort: Desc)])
  @@index([searchCount(sort: Desc)])
}
```

2. Run migration:

```bash
npx prisma migrate dev --name add_search_enhancement_tables
```

---

### Step 1.6: Add Full-Text Search Indexes (PostgreSQL)

**Priority: CRITICAL**

1. Create migration:

```bash
npx prisma migrate dev --create-only --name add_fulltext_indexes
```

2. Edit the migration file and add:

```sql
-- Product full-text search
CREATE INDEX product_name_gin_idx ON "Product" USING gin (to_tsvector('spanish', name));
CREATE INDEX product_description_gin_idx ON "Product" USING gin (to_tsvector('spanish', coalesce(description, '')));
CREATE INDEX product_brand_gin_idx ON "Product" USING gin (to_tsvector('spanish', brand));

-- Product trigram indexes for fuzzy matching
CREATE INDEX product_name_trgm_idx ON "Product" USING gin (name gin_trgm_ops);
CREATE INDEX product_description_trgm_idx ON "Product" USING gin (description gin_trgm_ops);
CREATE INDEX product_brand_trgm_idx ON "Product" USING gin (brand gin_trgm_ops);

-- Service full-text search
CREATE INDEX service_name_gin_idx ON "Service" USING gin (to_tsvector('spanish', name));
CREATE INDEX service_description_gin_idx ON "Service" USING gin (to_tsvector('spanish', coalesce(description, '')));

-- Service trigram indexes
CREATE INDEX service_name_trgm_idx ON "Service" USING gin (name gin_trgm_ops);
CREATE INDEX service_description_trgm_idx ON "Service" USING gin (description gin_trgm_ops);

-- Category indexes
CREATE INDEX product_category_name_trgm_idx ON "ProductCategory" USING gin ("productCategoryName" gin_trgm_ops);
CREATE INDEX service_subcategory_trgm_idx ON "ServiceSubCategory" USING gin ("subCategory" gin_trgm_ops);

-- Composite index for common search filters
CREATE INDEX product_search_filter_idx ON "Product" ("isActive", "deletedAt", "productCategoryId", "price");
CREATE INDEX service_search_filter_idx ON "Service" ("isActive", "subcategoryId", "basePrice");
```

3. Apply migration:

```bash
npx prisma migrate dev
```

---

## Phase 2: Application Logic Improvements

### Step 2.1: Implement PostgreSQL Full-Text Search

**Priority: CRITICAL**

1. Create `src/search/strategies/fulltext-search.strategy.ts`:

```typescript
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  SearchResultItem,
  SearchResultType,
} from "../entities/search-result.entity";

@Injectable()
export class FullTextSearchStrategy {
  constructor(private readonly prisma: PrismaService) {}

  async searchProducts(
    searchTerms: string[],
    filters: any
  ): Promise<SearchResultItem[]> {
    const searchQuery = searchTerms.join(" & ");

    const products = await this.prisma.$queryRaw<any[]>`
      SELECT 
        p.id,
        p.name,
        p.description,
        p.price,
        p."offerPrice",
        p."hasOffer",
        p.images,
        p.brand,
        p."averageRating",
        p."reviewCount",
        p."sellerId",
        p.interests as tags,
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
        ${filters.minPrice ? Prisma.sql`AND p.price >= ${filters.minPrice}` : Prisma.empty}
        ${filters.maxPrice ? Prisma.sql`AND p.price <= ${filters.maxPrice}` : Prisma.empty}
        ${filters.hasOffer !== undefined ? Prisma.sql`AND p."hasOffer" = ${filters.hasOffer}` : Prisma.empty}
        ${filters.minRating ? Prisma.sql`AND p."averageRating" >= ${filters.minRating}` : Prisma.empty}
      ORDER BY relevance_score DESC, p."createdAt" DESC
      LIMIT 100
    `;

    return products.map((p) => ({
      id: p.id,
      type: SearchResultType.PRODUCT,
      name: p.name,
      description: p.description,
      price: p.price,
      offerPrice: p.offerPrice,
      hasOffer: p.hasOffer,
      images: p.images || [],
      category: p.category,
      rating: p.averageRating,
      reviewCount: p.reviewCount,
      sellerId: p.sellerId,
      tags: p.tags || [],
      relevanceScore: parseFloat(p.relevance_score),
    }));
  }

  async searchServices(
    searchTerms: string[],
    filters: any
  ): Promise<SearchResultItem[]> {
    const searchQuery = searchTerms.join(" & ");

    const services = await this.prisma.$queryRaw<any[]>`
      SELECT 
        s.id,
        s.name,
        s.description,
        s."basePrice" as price,
        s.images,
        s.tags,
        s."sellerId",
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
        ${filters.minPrice ? Prisma.sql`AND s."basePrice" >= ${filters.minPrice}` : Prisma.empty}
        ${filters.maxPrice ? Prisma.sql`AND s."basePrice" <= ${filters.maxPrice}` : Prisma.empty}
      ORDER BY relevance_score DESC, s."createdAt" DESC
      LIMIT 100
    `;

    return services.map((s) => ({
      id: s.id,
      type: SearchResultType.SERVICE,
      name: s.name,
      description: s.description,
      price: s.price,
      hasOffer: false,
      images: s.images || [],
      category: s.category,
      subcategory: s.subcategory,
      sellerId: s.sellerId,
      tags: s.tags || [],
      relevanceScore: parseFloat(s.relevance_score),
    }));
  }
}
```

2. Update `src/search/search.service.ts` to use the new strategy:

```typescript
import { FullTextSearchStrategy } from "./strategies/fulltext-search.strategy";

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fullTextSearch: FullTextSearchStrategy
  ) {}

  async search(input: SearchInput): Promise<SearchResponse> {
    // ... existing code ...

    // Replace the searchProducts and searchServices calls:
    const [productResults, serviceResults] = await Promise.all([
      type !== SearchType.SERVICES
        ? this.fullTextSearch.searchProducts(searchTerms, filters)
        : Promise.resolve([]),
      type !== SearchType.PRODUCTS
        ? this.fullTextSearch.searchServices(searchTerms, filters)
        : Promise.resolve([]),
    ]);

    // ... rest of existing code ...
  }
}
```

3. Add the strategy to `search.module.ts`:

```typescript
import { FullTextSearchStrategy } from "./strategies/fulltext-search.strategy";

@Module({
  providers: [SearchService, SearchResolver, FullTextSearchStrategy],
  // ...
})
export class SearchModule {}
```

---

### Step 2.2: Add Search Click Tracking

**Priority: HIGH**

1. Add to `src/search/dto/search.input.ts`:

```typescript
@InputType()
export class TrackSearchClickInput {
  @Field(() => Int)
  searchId: number;

  @Field(() => Int)
  itemId: number;

  @Field(() => String)
  itemType: string;

  @Field(() => Int)
  position: number;

  @Field(() => String, { nullable: true })
  userId?: string;
}
```

2. Add method to `search.service.ts`:

```typescript
async trackClick(input: TrackSearchClickInput): Promise<boolean> {
  try {
    await this.prisma.searchClick.create({
      data: {
        searchId: input.searchId,
        itemId: input.itemId,
        itemType: input.itemType,
        position: input.position,
        userId: input.userId,
        clickedAt: new Date(),
      },
    });

    // Update popular search click count
    const searchLog = await this.prisma.searchLog.findUnique({
      where: { id: input.searchId },
    });

    if (searchLog) {
      await this.prisma.popularSearch.upsert({
        where: { query: searchLog.query },
        update: {
          clickCount: { increment: 1 },
          lastSearched: new Date(),
        },
        create: {
          query: searchLog.query,
          searchCount: 1,
          clickCount: 1,
        },
      });
    }

    return true;
  } catch {
    return false;
  }
}
```

3. Add mutation to `search.resolver.ts`:

```typescript
@Mutation(() => Boolean, {
  name: 'trackSearchClick',
  description: 'Track when a user clicks on a search result',
})
async trackSearchClick(
  @Args('input') input: TrackSearchClickInput,
): Promise<boolean> {
  return this.searchService.trackClick(input);
}
```

---

### Step 2.3: Add Item View Tracking

**Priority: MEDIUM**

1. Add to `src/search/dto/search.input.ts`:

```typescript
@InputType()
export class TrackItemViewInput {
  @Field(() => Int)
  itemId: number;

  @Field(() => String)
  itemType: string;

  @Field(() => String, { nullable: true })
  userId?: string;

  @Field(() => String, { nullable: true })
  sessionId?: string;

  @Field(() => Int, { nullable: true })
  duration?: number;

  @Field(() => String, { nullable: true })
  source?: string;
}
```

2. Add to `search.service.ts`:

```typescript
async trackView(input: TrackItemViewInput): Promise<boolean> {
  try {
    await this.prisma.itemView.create({
      data: {
        itemId: input.itemId,
        itemType: input.itemType,
        userId: input.userId,
        sessionId: input.sessionId,
        duration: input.duration,
        source: input.source,
        viewedAt: new Date(),
      },
    });

    // Update view count
    if (input.itemType === 'PRODUCT') {
      await this.prisma.product.update({
        where: { id: input.itemId },
        data: { viewCount: { increment: 1 } },
      });
    }

    return true;
  } catch {
    return false;
  }
}
```

3. Add mutation to resolver:

```typescript
@Mutation(() => Boolean, {
  name: 'trackItemView',
  description: 'Track when a user views an item',
})
async trackItemView(
  @Args('input') input: TrackItemViewInput,
): Promise<boolean> {
  return this.searchService.trackView(input);
}
```

---

### Step 2.4: Improve Search Logging

**Priority: MEDIUM**

1. Update `logSearch` method in `search.service.ts`:

```typescript
private async logSearch(
  query: string,
  resultCount: number,
  userId?: string,
  sessionId?: string
): Promise<number | null> {
  try {
    const searchLog = await this.prisma.searchLog.create({
      data: {
        query: query.toLowerCase().trim(),
        resultCount,
        userId,
        sessionId,
        createdAt: new Date(),
      },
    });

    // Update user search history
    if (userId) {
      await this.prisma.userSearchHistory.create({
        data: {
          userId,
          query: query.toLowerCase().trim(),
          resultCount,
          searchedAt: new Date(),
        },
      });
    }

    // Update popular searches
    await this.prisma.popularSearch.upsert({
      where: { query: query.toLowerCase().trim() },
      update: {
        searchCount: { increment: 1 },
        lastSearched: new Date(),
      },
      create: {
        query: query.toLowerCase().trim(),
        searchCount: 1,
        clickCount: 0,
      },
    });

    return searchLog.id;
  } catch {
    return null;
  }
}
```

2. Update `search` method to return searchId:

```typescript
async search(input: SearchInput, userId?: string, sessionId?: string): Promise<SearchResponse> {
  // ... existing code ...

  // Log search and get searchId
  const searchId = await this.logSearch(query, totalItems, userId, sessionId);

  // ... existing code ...

  return {
    searchId, // Add this
    items: highlightedResults,
    pageInfo: { /* ... */ },
    // ... rest of response
  };
}
```

3. Update `SearchResponse` entity:

```typescript
@ObjectType()
export class SearchResponse {
  @Field(() => Int, { nullable: true })
  searchId?: number;

  // ... existing fields ...
}
```

---

### Step 2.5: Implement Trending Calculation

**Priority: MEDIUM**

1. Create `src/search/services/trending.service.ts`:

```typescript
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { Cron, CronExpression } from "@nestjs/schedule";

@Injectable()
export class TrendingService {
  constructor(private readonly prisma: PrismaService) {}

  // Update trending scores every hour
  @Cron(CronExpression.EVERY_HOUR)
  async updateTrendingScores() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Calculate trending score based on recent activity
    await this.prisma.$executeRaw`
      UPDATE "PopularSearch"
      SET "trendingScore" = (
        -- Recent searches weighted more heavily
        (SELECT COUNT(*) FROM "SearchLog" 
         WHERE "SearchLog".query = "PopularSearch".query 
         AND "SearchLog"."createdAt" > ${oneDayAgo}) * 10.0
        +
        -- Clicks are valuable
        (SELECT COUNT(*) FROM "SearchClick" sc
         JOIN "SearchLog" sl ON sc."searchId" = sl.id
         WHERE sl.query = "PopularSearch".query
         AND sc."clickedAt" > ${oneWeekAgo}) * 5.0
        +
        -- Overall search count (with decay)
        "searchCount" * 0.1
      )
      WHERE "lastSearched" > ${oneWeekAgo}
    `;

    // Reset old trending scores
    await this.prisma.popularSearch.updateMany({
      where: { lastSearched: { lt: oneWeekAgo } },
      data: { trendingScore: 0 },
    });
  }
}
```

2. Add to `search.module.ts`:

```typescript
import { TrendingService } from "./services/trending.service";

@Module({
  providers: [SearchService, SearchResolver, TrendingService],
  // ...
})
export class SearchModule {}
```

3. Install scheduler:

```bash
npm install @nestjs/schedule
```

4. Add to `app.module.ts`:

```typescript
import { ScheduleModule } from "@nestjs/schedule";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // ... other modules
  ],
})
export class AppModule {}
```

---

## Phase 3: Caching Layer (OPTIONAL)

### Step 3.1: Install Redis

**Priority: MEDIUM**

1. Install dependencies:

```bash
npm install ioredis
npm install -D @types/ioredis
```

2. Create `src/redis/redis.module.ts`:

```typescript
import { Module, Global } from "@nestjs/common";
import { RedisService } from "./redis.service";

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

3. Create `src/redis/redis.service.ts`:

```typescript
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      password: process.env.REDIS_PASSWORD,
    });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
```

4. Update `search.service.ts` to use cache:

```typescript
async search(input: SearchInput): Promise<SearchResponse> {
  const cacheKey = `search:${JSON.stringify(input)}`;

  // Try cache
  const cached = await this.redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Execute search
  const result = await this.executeSearch(input);

  // Cache for 5 minutes
  await this.redis.set(cacheKey, JSON.stringify(result), 300);

  return result;
}
```

5. Add to `.env`:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

---

## Phase 4: Advanced Search (OPTIONAL - Future)

### Step 4.1: Integrate Meilisearch

**Priority: LOW (for scale)**

1. Install Meilisearch:

```bash
# Using Docker
docker run -d -p 7700:7700 getmeili/meilisearch:latest

# Or install locally
# See: https://www.meilisearch.com/docs/learn/getting_started/installation
```

2. Install client:

```bash
npm install meilisearch
```

3. Create `src/search/services/meilisearch.service.ts`:

```typescript
import { Injectable, OnModuleInit } from "@nestjs/common";
import { MeiliSearch, Index } from "meilisearch";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class MeilisearchService implements OnModuleInit {
  private client: MeiliSearch;
  private productIndex: Index;
  private serviceIndex: Index;

  constructor(private readonly prisma: PrismaService) {
    this.client = new MeiliSearch({
      host: process.env.MEILI_HOST || "http://127.0.0.1:7700",
      apiKey: process.env.MEILI_MASTER_KEY,
    });
  }

  async onModuleInit() {
    // Create indexes
    this.productIndex = this.client.index("products");
    this.serviceIndex = this.client.index("services");

    // Configure searchable attributes
    await this.productIndex.updateSettings({
      searchableAttributes: ["name", "description", "brand", "category"],
      filterableAttributes: [
        "price",
        "isActive",
        "category",
        "hasOffer",
        "averageRating",
      ],
      sortableAttributes: ["price", "createdAt", "averageRating", "saleCount"],
    });

    await this.serviceIndex.updateSettings({
      searchableAttributes: ["name", "description", "tags", "category"],
      filterableAttributes: ["basePrice", "isActive", "category"],
      sortableAttributes: ["basePrice", "createdAt"],
    });
  }

  async indexProducts() {
    const products = await this.prisma.product.findMany({
      where: { isActive: true, deletedAt: null },
      include: { productCategory: true },
    });

    const documents = products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      brand: p.brand,
      price: p.price,
      hasOffer: p.hasOffer,
      category: p.productCategory?.productCategoryName,
      averageRating: p.averageRating || 0,
      isActive: p.isActive,
      createdAt: p.createdAt.getTime(),
    }));

    await this.productIndex.addDocuments(documents);
  }

  async search(query: string, type: "products" | "services", filters?: any) {
    const index = type === "products" ? this.productIndex : this.serviceIndex;

    return await index.search(query, {
      filter: this.buildFilter(filters),
      sort: this.buildSort(filters?.sortBy),
      limit: 100,
      attributesToHighlight: ["name", "description"],
    });
  }

  private buildFilter(filters: any): string[] {
    const conditions: string[] = ["isActive = true"];

    if (filters?.minPrice) conditions.push(`price >= ${filters.minPrice}`);
    if (filters?.maxPrice) conditions.push(`price <= ${filters.maxPrice}`);
    if (filters?.hasOffer !== undefined)
      conditions.push(`hasOffer = ${filters.hasOffer}`);
    if (filters?.minRating)
      conditions.push(`averageRating >= ${filters.minRating}`);

    return conditions;
  }

  private buildSort(sortBy?: string): string[] {
    switch (sortBy) {
      case "PRICE_ASC":
        return ["price:asc"];
      case "PRICE_DESC":
        return ["price:desc"];
      case "NEWEST":
        return ["createdAt:desc"];
      case "RATING":
        return ["averageRating:desc"];
      case "POPULARITY":
        return ["saleCount:desc"];
      default:
        return [];
    }
  }
}
```

4. Add environment variables:

```env
MEILI_HOST=http://127.0.0.1:7700
MEILI_MASTER_KEY=your_master_key
```

---

## Testing & Validation

### Performance Tests

1. Create `src/search/__tests__/search.performance.spec.ts`:

```typescript
describe("Search Performance", () => {
  it("should return results in < 100ms for simple queries", async () => {
    const start = Date.now();
    await searchService.search({ query: "laptop" });
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100);
  });

  it("should handle concurrent searches", async () => {
    const searches = Array(10)
      .fill(null)
      .map((_, i) => searchService.search({ query: `test ${i}` }));
    await Promise.all(searches);
  });
});
```

2. Run load tests:

```bash
npm install -D @nestjs/testing artillery
```

Create `artillery.yml`:

```yaml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: "Search load test"
    flow:
      - post:
          url: "/graphql"
          json:
            query: 'query { search(input: { query: "laptop" }) { items { id name } } }'
```

---

## Monitoring & Maintenance

### Create Admin Dashboard Queries

1. Add to `search.resolver.ts`:

```typescript
@Query(() => SearchAnalytics)
@UseGuards(AdminGuard)
async searchAnalytics(
  @Args('startDate') startDate: Date,
  @Args('endDate') endDate: Date,
): Promise<SearchAnalytics> {
  return this.searchService.getAnalytics(startDate, endDate);
}
```

2. Implement in `search.service.ts`:

```typescript
async getAnalytics(startDate: Date, endDate: Date) {
  const [totalSearches, avgResultCount, topQueries, clickThrough] = await Promise.all([
    this.prisma.searchLog.count({
      where: { createdAt: { gte: startDate, lte: endDate } },
    }),
    this.prisma.searchLog.aggregate({
      where: { createdAt: { gte: startDate, lte: endDate } },
      _avg: { resultCount: true },
    }),
    this.prisma.searchLog.groupBy({
      by: ['query'],
      where: { createdAt: { gte: startDate, lte: endDate } },
      _count: true,
      orderBy: { _count: { query: 'desc' } },
      take: 20,
    }),
    this.calculateClickThroughRate(startDate, endDate),
  ]);

  return { totalSearches, avgResultCount, topQueries, clickThrough };
}
```

---

## Implementation Checklist

### Must Have (Phase 1 & 2)

- [ ] Step 1.1: PostgreSQL extensions
- [ ] Step 1.2: Product analytics fields
- [ ] Step 1.3: Product reviews
- [ ] Step 1.4: Search analytics tables
- [ ] Step 1.6: Full-text indexes
- [ ] Step 2.1: Full-text search implementation
- [ ] Step 2.2: Click tracking
- [ ] Step 2.4: Improved logging

### Should Have

- [ ] Step 1.5: Search enhancement tables
- [ ] Step 2.3: View tracking
- [ ] Step 2.5: Trending calculation
- [ ] Performance tests
- [ ] Admin analytics

### Nice to Have (Phase 3 & 4)

- [ ] Step 3.1: Redis caching
- [ ] Step 4.1: Meilisearch integration
- [ ] Synonym management UI
- [ ] A/B testing framework

---

## Timeline Estimate

- **Week 1**: Phase 1 (Database schema) - Steps 1.1-1.6
- **Week 2**: Phase 2 Core (Application logic) - Steps 2.1-2.2
- **Week 3**: Phase 2 Advanced - Steps 2.3-2.5, Testing
- **Week 4**: Phase 3 (Caching) - Optional
- **Week 5+**: Phase 4 (Advanced search engine) - Future

---

## Performance Expectations

After implementing Phase 1 & 2:

- Search response time: **50-100ms** (vs current 300-500ms)
- Concurrent users: **100+** (vs current ~20)
- Search accuracy: **85%+** relevance
- Click-through rate: **Measurable** (currently unknown)

After Phase 3:

- Cached queries: **<10ms**
- Concurrent users: **500+**

After Phase 4:

- Search response: **<50ms**
- Typo tolerance: **Excellent**
- Faceted search: **Instant**
- Concurrent users: **1000+**
