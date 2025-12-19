# Ekoru Search Service - Search Logic Deep Dive

## Overview

This document provides a comprehensive explanation of how the search system works internally, from receiving a user's query to returning ranked results. Understanding this flow is essential for maintaining and improving the search functionality.

---

## Complete Search Flow

```
┌─────────────────┐
│  User Query     │  "gaming laptop"
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  1. Query Normalization & Tokenization  │
└────────┬────────────────────────────────┘
         │  Normalized: "gaming laptop"
         │  Tokens: ["gaming", "laptop"]
         ▼
┌─────────────────────────────────────────┐
│  2. Parallel Full-Text Search Queries   │
│  ┌─────────┐ ┌──────────────┐ ┌────────┐│
│  │Products │ │StoreProducts │ │Services││
│  └─────────┘ └──────────────┘ └────────┘│
└────────┬────────────────────────────────┘
         │  3 separate DB queries running concurrently
         ▼
┌─────────────────────────────────────────┐
│  3. Results Merging                     │
│  - Combine all results                  │
│  - Calculate relevance scores           │
└────────┬────────────────────────────────┘
         │  Combined results with scores
         ▼
┌─────────────────────────────────────────┐
│  4. Filtering & Sorting                 │
│  - Apply price filters                  │
│  - Apply category filters               │
│  - Sort by selected criteria            │
└────────┬────────────────────────────────┘
         │  Filtered & sorted results
         ▼
┌─────────────────────────────────────────┐
│  5. Pagination                          │
│  - Calculate page boundaries            │
│  - Extract current page items           │
└────────┬────────────────────────────────┘
         │  Page of results
         ▼
┌─────────────────────────────────────────┐
│  6. Result Enhancement                  │
│  - Add syntax highlighting              │
│  - Generate facets                      │
│  - Generate suggestions (if needed)     │
└────────┬────────────────────────────────┘
         │  Enhanced results
         ▼
┌─────────────────────────────────────────┐
│  7. Analytics Logging                   │
│  - Log search to SearchLog              │
│  - Update PopularSearch                 │
│  - Update UserSearchHistory             │
└────────┬────────────────────────────────┘
         │  searchId returned
         ▼
┌─────────────────────────────────────────┐
│  8. Response Construction               │
│  - Build SearchResponse object          │
│  - Include pageInfo, facets, etc.       │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Client Gets    │  JSON response with results
│  Search Results │
└─────────────────┘
```

---

## Step-by-Step Breakdown

### Step 1: Query Normalization & Tokenization

**Location**: `SearchService.normalizeQuery()` and `SearchService.tokenize()`

**Purpose**: Clean and prepare the user's raw input for optimal search performance.

#### 1.1 Normalization Process

```typescript
private normalizeQuery(query: string): string {
  return query
    .toLowerCase()                    // "Gaming Laptop" → "gaming laptop"
    .trim()                          // Remove leading/trailing spaces
    .replace(/[^\w\sáéíóúñü]/g, ' ') // Remove special chars, keep Spanish accents
    .replace(/\s+/g, ' ');           // Collapse multiple spaces to one
}
```

**Examples**:

```
Input:  "  Gaming   Laptop!! "
Output: "gaming laptop"

Input:  "búsqueda de computadoras"
Output: "búsqueda de computadoras"

Input:  "phone-case-2024"
Output: "phone case 2024"
```

**Why normalize?**

- Case-insensitive matching
- Removes noise from punctuation
- Standardizes spacing
- Preserves Spanish accents for proper language processing

#### 1.2 Tokenization Process

```typescript
private tokenize(query: string): string[] {
  const stopWords = new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'al',
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for'
  ]);

  return query
    .split(' ')                           // Split on spaces
    .filter(word => word.length > 1)      // Remove single chars
    .filter(word => !stopWords.has(word)); // Remove stop words
}
```

**Examples**:

```
Input:  "looking for a gaming laptop"
Output: ["looking", "gaming", "laptop"]

Input:  "servicios de reparación"
Output: ["servicios", "reparación"]

Input:  "the best phone"
Output: ["best", "phone"]
```

**Why tokenize?**

- Each token becomes a search term
- Stop words add no search value
- Reduces query complexity
- Improves performance

---

### Step 2: Parallel Full-Text Search Queries

**Location**: `FullTextSearchStrategy.searchProducts()`, `.searchStoreProducts()`, `.searchServices()`

**Purpose**: Find all matching items across different item types simultaneously.

#### 2.1 Full-Text Search Architecture

The service uses **PostgreSQL Full-Text Search** (not `LIKE` queries) for superior performance:

```typescript
// How it works under the hood:
const searchQuery = searchTerms.join(" & "); // "gaming & laptop"

await prisma.$queryRaw`
  SELECT 
    p.*,
    ts_rank(
      to_tsvector('spanish', p.name || ' ' || COALESCE(p.description, '')),
      plainto_tsquery('spanish', ${searchQuery})
    ) as relevance_score
  FROM "Product" p
  WHERE 
    to_tsvector('spanish', p.name || ' ' || COALESCE(p.description, ''))
    @@ 
    plainto_tsquery('spanish', ${searchQuery})
  ORDER BY relevance_score DESC
  LIMIT 100
`;
```

#### 2.2 Understanding the Query Components

**`to_tsvector('spanish', text)`**:

- Converts text to a searchable format
- Applies Spanish stemming (computadora → comput)
- Removes Spanish stop words
- Creates positional index

**Example**:

```sql
SELECT to_tsvector('spanish', 'Las computadoras gaming son mejores');
-- Result: 'comput':2 'gaming':3 'mejor':5
-- ('las' and 'son' removed as stop words)
```

**`plainto_tsquery('spanish', query)`**:

- Converts user query to search format
- Adds AND logic between words
- Applies same stemming rules

**Example**:

```sql
SELECT plainto_tsquery('spanish', 'gaming laptop');
-- Result: 'gaming' & 'laptop'
```

**`@@` operator**:

- Matches ts_vector against ts_query
- Returns true if document matches

**`ts_rank(vector, query)`**:

- Calculates relevance score (0.0 to 1.0)
- Higher = better match
- Considers term frequency, position, document length

#### 2.3 Search Across Three Types

**Products** (used items):

```typescript
async searchProducts(searchTerms: string[], filters: {...}): Promise<SearchResultItem[]> {
  const searchQuery = searchTerms.join(' & ');

  const products = await this.prisma.$queryRaw`
    SELECT
      p.id, p.name, p.description, p.price, p.offerPrice, p.hasOffer,
      p.images, p.brand, p.sellerId, p.interests as tags,
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
      AND to_tsvector('spanish', ...) @@ plainto_tsquery('spanish', ${searchQuery})
      ${priceFilters}
      ${offerFilters}
    ORDER BY relevance_score DESC, p."createdAt" DESC
    LIMIT 100
  `;

  return products.map(...); // Transform to SearchResultItem
}
```

**Key points**:

- Searches across `name`, `description`, and `brand`
- Only returns active, non-deleted products
- Applies price and offer filters
- Limited to 100 results for performance
- Fallback sort by `createdAt` for equal relevance scores

**StoreProducts** (upcycled/new items):

```typescript
async searchStoreProducts(searchTerms: string[], filters: {...}): Promise<SearchResultItem[]> {
  // Very similar to searchProducts but:
  // - Includes ratings and review counts
  // - Uses StoreSubCategory instead of ProductCategory
  // - Has additional rating filter support
}
```

**Services**:

```typescript
async searchServices(searchTerms: string[], filters: {...}): Promise<SearchResultItem[]> {
  // Similar structure but:
  // - Searches name, description, and tags
  // - Uses basePrice instead of price
  // - Includes ServiceSubCategory
  // - Supports rating filters
}
```

#### 2.4 Why Parallel Execution?

**Sequential execution** (slow):

```
Products: 80ms
  ↓
StoreProducts: 70ms
  ↓
Services: 60ms
  ↓
Total: 210ms
```

**Parallel execution** (fast):

```
Products: 80ms ────┐
StoreProducts: 70ms ┼─→ Total: 80ms (max of three)
Services: 60ms ─────┘
```

**Implementation**:

```typescript
const [productResults, storeProductResults, serviceResults] = await Promise.all(
  [
    this.fullTextSearch.searchProducts(searchTerms, filters),
    this.fullTextSearch.searchStoreProducts(searchTerms, filters),
    this.fullTextSearch.searchServices(searchTerms, filters),
  ]
);
```

---

### Step 3: Results Merging & Scoring

**Location**: `SearchService.search()` → combine results → `SearchService.calculateRelevanceScore()`

**Purpose**: Combine results from different sources and calculate final relevance scores.

#### 3.1 Combining Results

```typescript
let allResults = [
  ...productResults, // From Products table
  ...storeProductResults, // From StoreProducts table
  ...serviceResults, // From Services table
];
```

**Result format** at this point:

```typescript
{
  id: 1,
  type: SearchResultType.PRODUCT, // or STORE_PRODUCT, SERVICE
  name: "Gaming Laptop XPS",
  description: "High performance...",
  price: 1500,
  category: "Electronics",
  tags: ["gaming", "laptop"],
  relevanceScore: 0, // Will be calculated next
  // ... other fields
}
```

#### 3.2 Calculating Final Relevance Scores

The base `ts_rank` score is good, but we enhance it with business logic:

```typescript
private calculateRelevanceScore(item: SearchResultItem, searchTerms: string[]): number {
  let score = 0;
  const nameNormalized = item.name.toLowerCase();
  const descNormalized = (item.description || '').toLowerCase();

  for (const term of searchTerms) {
    // EXACT MATCH in name (highest value)
    if (nameNormalized === term) {
      score += 100;
    }
    // Name STARTS WITH term (very relevant)
    else if (nameNormalized.startsWith(term)) {
      score += 50;
    }
    // Name CONTAINS term (relevant)
    else if (nameNormalized.includes(term)) {
      score += 30;
    }

    // Description contains term (somewhat relevant)
    if (descNormalized.includes(term)) {
      score += 10;
    }

    // Tags contain term (helps categorization)
    if (item.tags?.some(t => t.toLowerCase().includes(term))) {
      score += 15;
    }

    // Category matches (contextually relevant)
    if (item.category?.toLowerCase().includes(term)) {
      score += 20;
    }
  }

  // BOOST factors
  if (item.hasOffer) score += 5;           // Promote deals
  if (item.rating && item.rating >= 4) score += 10;  // Promote quality
  if (item.reviewCount && item.reviewCount > 10) score += 5; // Promote popular

  return score;
}
```

**Scoring examples**:

**Query**: "gaming laptop"

**Result 1**: Name = "Gaming Laptop Pro"

```
- "gaming" exact match in name: +100
- "laptop" contains in name: +30
- Has offer: +5
- Rating 4.5: +10
Total: 145
```

**Result 2**: Name = "HP Laptop for Gaming"

```
- "gaming" contains in name: +30
- "laptop" contains in name: +30
- "gaming" in description: +10
- 15 reviews: +5
Total: 75
```

**Result 3**: Name = "Computer Accessories"

```
- "gaming" in tags: +15
- Category "Gaming": +20
Total: 35
```

**Why this scoring?**

- Title matches are most important (users look at titles first)
- Exact matches mean perfect relevance
- Boosts help promote good deals and quality items
- Multiple signals prevent any single factor from dominating

#### 3.3 Applying Scores

```typescript
allResults = allResults.map((item) => ({
  ...item,
  relevanceScore: this.calculateRelevanceScore(item, searchTerms),
}));
```

---

### Step 4: Filtering & Sorting

**Location**: `SearchService.search()` → filters applied in query, sorting in `sortResults()`

**Purpose**: Refine results based on user preferences and order them appropriately.

#### 4.1 Filter Application

Filters are applied **during the database query** (not after) for better performance:

**Price filters**:

```sql
${filters.minPrice ? Prisma.sql`AND p.price >= ${filters.minPrice}` : Prisma.empty}
${filters.maxPrice ? Prisma.sql`AND p.price <= ${filters.maxPrice}` : Prisma.empty}
```

**Category filters**:

```typescript
// Not yet implemented in current version
// Would add: AND p."productCategoryId" IN (...)
```

**Offer filter**:

```sql
${filters.hasOffer !== undefined ? Prisma.sql`AND p."hasOffer" = ${filters.hasOffer}` : Prisma.empty}
```

**Rating filter**:

```sql
${filters.minRating ? Prisma.sql`AND sp.ratings >= ${filters.minRating}` : Prisma.empty}
```

#### 4.2 Sorting Results

```typescript
private sortResults(results: SearchResultItem[], sortBy: SearchSortBy): SearchResultItem[] {
  switch (sortBy) {
    case SearchSortBy.RELEVANCE:
      return results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    case SearchSortBy.PRICE_ASC:
      return results.sort((a, b) => (a.price || 0) - (b.price || 0));

    case SearchSortBy.PRICE_DESC:
      return results.sort((a, b) => (b.price || 0) - (a.price || 0));

    case SearchSortBy.RATING:
      return results.sort((a, b) => (b.rating || 0) - (a.rating || 0));

    case SearchSortBy.NEWEST:
      // Would need createdAt field in SearchResultItem
      return results;

    case SearchSortBy.POPULARITY:
      return results.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));

    default:
      return results;
  }
}
```

**Why different sort options?**

- **RELEVANCE**: Best match for what they searched
- **PRICE_ASC**: Budget-conscious shoppers
- **PRICE_DESC**: Premium/luxury seekers
- **RATING**: Quality-focused buyers
- **NEWEST**: Find latest listings
- **POPULARITY**: See what others like

---

### Step 5: Pagination

**Location**: `SearchService.search()` → pagination logic

**Purpose**: Split large result sets into manageable pages.

#### 5.1 Pagination Calculation

```typescript
const page = input.page || 1; // Default to first page
const pageSize = input.pageSize || 20; // Default 20 items per page

const totalItems = allResults.length;
const totalPages = Math.ceil(totalItems / pageSize);

// Calculate which results to return
const skip = (page - 1) * pageSize;
const paginatedResults = allResults.slice(skip, skip + pageSize);
```

**Examples**:

**Page 1** (page=1, pageSize=20):

```
skip = (1-1) * 20 = 0
slice(0, 20) → items [0..19]
```

**Page 2** (page=2, pageSize=20):

```
skip = (2-1) * 20 = 20
slice(20, 40) → items [20..39]
```

**Page 3** (page=3, pageSize=10):

```
skip = (3-1) * 10 = 20
slice(20, 30) → items [20..29]
```

#### 5.2 PageInfo Generation

```typescript
const pageInfo = {
  currentPage: page,
  pageSize,
  totalItems,
  totalPages,
  hasNextPage: page < totalPages,
  hasPreviousPage: page > 1,
};
```

**Example** with 145 total results, page 3, size 20:

```json
{
  "currentPage": 3,
  "pageSize": 20,
  "totalItems": 145,
  "totalPages": 8,
  "hasNextPage": true,
  "hasPreviousPage": true
}
```

**Why pagination?**

- Prevents overwhelming users
- Reduces bandwidth
- Improves page load time
- Standard UX pattern

---

### Step 6: Result Enhancement

**Location**: `SearchService.search()` → `addHighlighting()` and `generateFacets()`

**Purpose**: Make results more useful with highlighting and filter options.

#### 6.1 Highlighting

**Process**: Wrap search terms with `<mark>` tags in result text:

```typescript
private addHighlighting(item: SearchResultItem, searchTerms: string[]): SearchResultItem {
  let highlightedName = item.name;
  let highlightedDescription = item.description || '';

  for (const term of searchTerms) {
    const regex = new RegExp(`(${term})`, 'gi'); // Case-insensitive, global
    highlightedName = highlightedName.replace(regex, '<mark>$1</mark>');
    highlightedDescription = highlightedDescription.replace(regex, '<mark>$1</mark>');
  }

  return {
    ...item,
    highlightedName,
    highlightedDescription: highlightedDescription || undefined,
  };
}
```

**Example**:

```
Query: "gaming laptop"

Input name: "HP Gaming Laptop 15 Pro"
Output: "HP <mark>Gaming</mark> <mark>Laptop</mark> 15 Pro"

Input description: "Powerful laptop for gaming and work"
Output: "Powerful <mark>laptop</mark> for <mark>gaming</mark> and work"
```

**Client rendering**:

```tsx
<div dangerouslySetInnerHTML={{ __html: item.highlightedName }} />
```

#### 6.2 Facet Generation

**Purpose**: Show users how many results match different filters.

```typescript
private generateFacets(results: SearchResultItem[]): SearchFacets {
  const categoryCount = new Map<string, number>();
  const typeCount = new Map<string, number>();
  const tagCount = new Map<string, number>();

  // Count occurrences
  for (const item of results) {
    if (item.category) {
      categoryCount.set(item.category, (categoryCount.get(item.category) || 0) + 1);
    }
    typeCount.set(item.type, (typeCount.get(item.type) || 0) + 1);
    item.tags?.forEach(tag => {
      tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    });
  }

  return {
    categories: Array.from(categoryCount.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10), // Top 10 categories

    types: Array.from(typeCount.entries())
      .map(([name, count]) => ({ name, count })),

    tags: Array.from(tagCount.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15), // Top 15 tags

    priceRanges: this.generatePriceRanges(results),
  };
}
```

**Example facets**:

```json
{
  "categories": [
    { "name": "Electronics", "count": 45 },
    { "name": "Computers", "count": 23 },
    { "name": "Gaming", "count": 12 }
  ],
  "types": [
    { "name": "PRODUCT", "count": 50 },
    { "name": "STORE_PRODUCT", "count": 20 },
    { "name": "SERVICE", "count": 10 }
  ],
  "tags": [
    { "name": "gaming", "count": 35 },
    { "name": "laptop", "count": 28 },
    { "name": "portable", "count": 15 }
  ],
  "priceRanges": [
    { "name": "$0 - $10,000", "count": 12 },
    { "name": "$10,000 - $50,000", "count": 45 },
    { "name": "$50,000 - $100,000", "count": 18 },
    { "name": "$100,000+", "count": 5 }
  ]
}
```

**Client usage**:

```tsx
<Sidebar>
  <h3>Categories</h3>
  {facets.categories.map((cat) => (
    <Checkbox key={cat.name} label={`${cat.name} (${cat.count})`} />
  ))}

  <h3>Price Range</h3>
  {facets.priceRanges.map((range) => (
    <Checkbox key={range.name} label={`${range.name} (${range.count})`} />
  ))}
</Sidebar>
```

#### 6.3 Suggestion Generation

**When**: Only when results are very few (< 5)

**How**: Find similar product/service names using Levenshtein distance:

```typescript
private async generateSuggestions(query: string): Promise<string[]> {
  // Get all product and service names
  const products = await this.prisma.product.findMany({
    where: { isActive: true, deletedAt: null },
    select: { name: true },
    take: 100,
  });

  const services = await this.prisma.service.findMany({
    where: { isActive: true },
    select: { name: true },
    take: 100,
  });

  const allNames = [...products.map(p => p.name), ...services.map(s => s.name)];

  // Calculate similarity to query
  const suggestions = allNames
    .map(name => ({
      name,
      similarity: this.calculateSimilarity(query, name.toLowerCase()),
    }))
    .filter(s => s.similarity > 0.3) // Only reasonably similar
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)
    .map(s => s.name);

  return suggestions;
}
```

**Levenshtein distance** (edit distance):

- Measures how many edits needed to transform one string to another
- Used to find "similar" words

**Example**:

```
Query: "laptap" (typo)

calculateSimilarity("laptap", "laptop")
→ 0.83 (1 character different out of 6)

Result: Suggest "laptop"
```

---

### Step 7: Analytics Logging

**Location**: `SearchService.logSearch()`, auto-triggered on every search

**Purpose**: Track search behavior for improvements and trending detection.

#### 7.1 SearchLog Creation

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

    return searchLog.id; // Return searchId to client
  } catch {
    return null; // Silently fail if analytics fails
  }
}
```

**Stored data**:

```json
{
  "id": 12345,
  "query": "gaming laptop",
  "resultCount": 67,
  "userId": "user-uuid-here",
  "sessionId": "session-cuid-here",
  "createdAt": "2025-12-19T10:30:00Z"
}
```

#### 7.2 PopularSearch Update

```typescript
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
```

**What this does**:

- If query exists: increment count, update timestamp
- If new query: create new record

#### 7.3 UserSearchHistory (Optional)

If table exists and userId provided:

```typescript
await this.prisma.userSearchHistory.create({
  data: {
    userId,
    query: query.toLowerCase().trim(),
    resultCount,
    searchedAt: new Date(),
  },
});
```

**Why log everything?**

- Detect trending searches
- Improve spell correction
- Personalize results (future)
- Analyze search quality
- Identify gaps in catalog

---

### Step 8: Response Construction

**Location**: `SearchService.search()` → return statement

**Purpose**: Build the final GraphQL response object.

```typescript
const processingTimeMs = Date.now() - startTime;

return {
  searchId: searchId ?? undefined, // For click tracking
  items: highlightedResults, // Paginated, enhanced results
  pageInfo: {
    currentPage: page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  },
  facets, // Filter options
  query, // Original query
  processingTimeMs, // Performance metric
  suggestions:
    totalItems < 5 ? await this.generateSuggestions(normalizedQuery) : [],
  correctedQuery:
    correctedQuery !== normalizedQuery ? correctedQuery : undefined,
};
```

**Complete response example**:

```json
{
  "searchId": 12345,
  "items": [
    {
      "id": 1,
      "type": "PRODUCT",
      "name": "Gaming Laptop XPS",
      "highlightedName": "<mark>Gaming</mark> <mark>Laptop</mark> XPS",
      "description": "High performance gaming laptop",
      "price": 1500,
      "images": ["img1.jpg"],
      "category": "Electronics",
      "relevanceScore": 145,
      "tags": ["gaming", "laptop"]
    }
  ],
  "pageInfo": {
    "currentPage": 1,
    "pageSize": 20,
    "totalItems": 67,
    "totalPages": 4,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "facets": {
    "categories": [{ "name": "Electronics", "count": 45 }],
    "types": [{ "name": "PRODUCT", "count": 50 }],
    "tags": [{ "name": "gaming", "count": 35 }],
    "priceRanges": [{ "name": "$0 - $10,000", "count": 12 }]
  },
  "query": "gaming laptop",
  "processingTimeMs": 87,
  "suggestions": [],
  "correctedQuery": null
}
```

---

## Performance Optimizations

### 1. Database Indexes

**GIN indexes** for full-text search:

```sql
CREATE INDEX idx_product_name_fts ON "Product"
  USING GIN (to_tsvector('spanish', name));

CREATE INDEX idx_product_description_fts ON "Product"
  USING GIN (to_tsvector('spanish', description));
```

**Trigram indexes** for fuzzy matching:

```sql
CREATE INDEX idx_product_name_trgm ON "Product"
  USING GIN (name gin_trgm_ops);
```

**Standard indexes** for filters:

```sql
CREATE INDEX idx_product_price ON "Product" (price);
CREATE INDEX idx_product_active ON "Product" (isActive, deletedAt);
```

### 2. Query Limits

- Each search type limited to 100 results
- Prevents overwhelming database
- Pagination applied after merging

### 3. Parallel Execution

- Products, StoreProducts, Services searched simultaneously
- Reduces latency by ~66%
- Uses `Promise.all()`

### 4. Conditional Queries

- Filters only applied when provided
- Uses `Prisma.sql` and `Prisma.empty` for dynamic SQL
- Avoids unnecessary WHERE clauses

### 5. Result Limiting

- Only return requested page
- Don't process all results if not needed
- Generate facets from full set but return subset

---

## Error Handling

### Silent Failures

Analytics operations fail silently to not break search:

```typescript
try {
  await this.logSearch(...);
} catch {
  return null; // Don't throw error
}
```

### Graceful Degradation

- If suggestions fail, return empty array
- If facets fail, return empty object
- Core search must always work

### Input Validation

- Page number: minimum 1
- Page size: 1-100
- Filters: type checking via GraphQL schema

---

## Future Improvements

### 1. Caching

Cache popular searches in Redis:

```typescript
const cacheKey = `search:${query}:${filters}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

// ... perform search ...

await redis.setex(cacheKey, 300, JSON.stringify(results)); // 5min TTL
```

### 2. Machine Learning Ranking

Train ML model on click data:

- Learn which results users prefer
- Personalize by user behavior
- Improve relevance over time

### 3. Semantic Search

Use vector embeddings (pgvector):

- Understand intent, not just keywords
- "affordable laptop" → find budget options
- "powerful computer" → find high-spec items

### 4. Query Expansion

Automatically add synonyms:

- "laptop" → also search "notebook", "computer"
- "phone" → also "smartphone", "móvil"

### 5. A/B Testing

Test different ranking algorithms:

- Show variant A to 50% of users
- Show variant B to 50%
- Measure which gets more clicks
- Deploy winner

---

_Last Updated: December 2025_
