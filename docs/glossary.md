# Ekoru Search Service - Glossary

## Overview

This glossary defines all key terms, concepts, and components used in the Ekoru Search Service. Understanding these terms is essential for working with the search functionality.

---

## Core Search Concepts

### Full-Text Search (FTS)

A search technique that examines all words in every stored document to find matches. Unlike simple pattern matching (`LIKE '%term%'`), full-text search:

- Uses linguistic rules (stemming, stop words)
- Ranks results by relevance
- Handles multiple word queries intelligently
- Provides fuzzy matching for typos

**Implementation**: PostgreSQL's `to_tsvector` and `ts_rank` functions with GIN indexes.

### ts_vector (Text Search Vector)

A PostgreSQL data type that represents a document in a form optimized for text searching. It contains:

- Normalized words (lexemes)
- Positions of each word in the document
- Weight information for ranking

**Example**:

```sql
-- Input text: "The quick brown fox"
-- Output: 'brown':3 'fox':4 'quick':2
-- (stop words like 'the' are removed)
```

### ts_rank (Text Search Ranking)

A PostgreSQL function that calculates the relevance score of a document match. Returns a float value (typically 0.0 to 1.0) based on:

- Term frequency (how often search terms appear)
- Document length
- Word proximity
- Positional weights

### plainto_tsquery

Converts plain text queries into a format suitable for full-text search. Handles:

- Automatic AND logic between words
- Stop word removal
- Language-specific processing

**Example**:

```sql
-- Input: "gaming laptop"
-- Output: 'gaming' & 'laptop'
```

### GIN Index (Generalized Inverted Index)

A specialized PostgreSQL index type optimized for composite values like arrays and full-text search vectors. For search, it stores:

- Every unique word (lexeme) in the database
- Pointers to all documents containing that word

**Performance**: Enables sub-100ms search on millions of records.

---

## Search Types & Filters

### SearchType

Enum defining what items to search for:

- **ALL**: Search products, store products, and services
- **PRODUCTS**: Only search used products (Product model)
- **SERVICES**: Only search service offerings (Service model)

### SearchResultType

Enum identifying the type of each search result:

- **PRODUCT**: Used product from individual seller
- **STORE_PRODUCT**: New product made from recycled materials (upcycled)
- **SERVICE**: Service offering from seller

### SearchSortBy

Enum defining how to order search results:

- **RELEVANCE**: By calculated relevance score (default)
- **PRICE_ASC**: Lowest price first
- **PRICE_DESC**: Highest price first
- **NEWEST**: Most recently created
- **RATING**: Highest rated first
- **POPULARITY**: Most viewed/reviewed

---

## Scoring & Ranking

### Relevance Score

A calculated number (0.0 to 1.0+) indicating how well a result matches the search query. Calculated using:

**Base Score** (from `ts_rank`):

- Name matches: highest weight
- Description matches: medium weight
- Category/tag matches: lower weight

**Boosting Factors**:

- Exact name match: +100 points
- Name starts with query: +50 points
- Name contains query: +30 points
- Description contains query: +10 points
- Tags match: +15 points
- Category match: +20 points
- Has offer: +5 points
- High rating (4+): +10 points
- Many reviews (10+): +5 points

**Formula**:

```typescript
finalScore = ts_rank_score * (1 + boostFactors);
```

### Trending Score

A calculated metric for popular searches based on:

- Search count (60% weight)
- Click count (30% weight)
- Recency factor (10% weight)
- Time decay (older = lower score)

**Formula**:

```typescript
trendingScore =
  (searchCount * 0.6 + clickCount * 0.3 + recency * 0.1) * decayFactor;
```

---

## Query Processing

### Normalization

Process of cleaning and standardizing user input:

1. Convert to lowercase
2. Trim whitespace
3. Remove special characters (except Spanish accents: á, é, í, ó, ú, ñ, ü)
4. Replace multiple spaces with single space

**Example**:

```
Input:  "  Gaming   Laptop!! "
Output: "gaming laptop"
```

### Tokenization

Breaking a normalized query into individual search terms:

1. Split on whitespace
2. Remove stop words (common words like "the", "el", "la")
3. Filter out single-character terms

**Example**:

```
Input:  "looking for a gaming laptop"
Output: ["looking", "gaming", "laptop"]
```

### Stop Words

Common words that are filtered out because they don't add search value:

**Spanish**: el, la, los, las, un, una, de, del, al, en, con, por, para, y, o, que, es, son
**English**: the, a, an, and, or, of, to, in, for

### Stemming

Reducing words to their root form for better matching (handled by PostgreSQL):

**Examples**:

- "gaming", "games", "gamer" → "game"
- "laptop", "laptops" → "laptop"
- "búsqueda", "buscar", "buscando" → "busc"

---

## Search Features

### Autocomplete

Real-time search suggestions as users type. Provides:

- Matching product/service names
- Popular searches
- User's recent searches (future feature)

**Minimum query length**: 2 characters

### Highlighting

HTML markup showing which parts of a result match the search query using `<mark>` tags.

**Example**:

```
Query: "gaming"
Name:  "Gaming Laptop XPS"
Highlighted: "<mark>Gaming</mark> Laptop XPS"
```

### Facets

Aggregated filter options based on search results:

- **Categories**: Count of results per category
- **Types**: Count per result type (PRODUCT, SERVICE, etc.)
- **Tags**: Count per tag/interest
- **Price Ranges**: Count per predefined price bracket

Used to help users refine searches.

### Suggestions

Alternative search terms shown when few results are found. Generated by:

- Finding similar product/service names
- Using Levenshtein distance for similarity
- Filtering by similarity threshold (> 0.3)

---

## Analytics & Tracking

### Search Analytics

System for tracking and analyzing search behavior to improve results.

**Components**:

- **SearchLog**: Every search query with metadata
- **SearchClick**: Which results users click
- **ItemView**: How long users view items
- **PopularSearch**: Trending queries
- **UserSearchHistory**: Per-user search history

### Click-Through Rate (CTR)

Percentage of search results that get clicked:

```
CTR = (clicks / searches) * 100
```

Used to measure result relevance and quality.

### Position Bias

Users are more likely to click results at the top. Analytics track:

- Which position each clicked result was at
- Click patterns by position
- Whether lower-ranked results are actually better

### Session Tracking

Grouping related searches and actions within a time period:

- Session ID: Unique identifier for a browsing session
- Session start/end times
- Search count per session
- Click count per session

---

## Database Models (Search Subgraph)

### Product

Used products from individual sellers. Fields relevant to search:

- `name`: Product name (indexed for FTS)
- `description`: Product description (indexed for FTS)
- `brand`: Brand name (indexed for FTS)
- `price`: Product price
- `hasOffer`: Whether on sale
- `offerPrice`: Sale price if applicable
- `images`: Product photos
- `interests`: Tags/keywords (searchable)
- `isActive`: Whether product is available
- `deletedAt`: Soft delete timestamp
- `viewCount`: Number of times viewed
- `productCategoryId`: Foreign key to ProductCategory

**Indexes**:

- Full-text: `name`, `description`, `brand`
- Trigram: `name` (fuzzy matching)
- Standard: `price`, `isActive`, `viewCount`, `createdAt`

### StoreProduct

New products made from recycled materials (upcycled). Fields:

- `name`: Product name (indexed for FTS)
- `description`: Product description (indexed for FTS)
- `brand`: Brand name (indexed for FTS)
- `price`: Product price
- `hasOffer`: Whether on sale
- `offerPrice`: Sale price
- `images`: Product photos
- `ratings`: Average rating (0-5)
- `reviewsNumber`: Total review count
- `isActive`: Availability
- `deletedAt`: Soft delete
- `viewCount`: View counter
- `saleCount`: Sales counter
- `subcategoryId`: Foreign key to StoreSubCategory

**Indexes**: Same as Product plus `ratings`, `saleCount`

### Service

Service offerings from sellers. Fields:

- `name`: Service name (indexed for FTS)
- `description`: Service description (indexed for FTS)
- `basePrice`: Starting price
- `priceRange`: Price range text
- `tags`: Service tags/keywords (searchable)
- `images`: Service photos
- `isActive`: Availability
- `viewCount`: View counter
- `averageRating`: Average rating
- `subcategoryId`: Foreign key to ServiceSubCategory

**Indexes**: Full-text on `name`, `description`, plus `viewCount`, `averageRating`

### ProductCategory

Categories for used products:

- `productCategoryName`: Category name (searchable)
- `keywords`: Associated keywords (searchable)
- `size`: Typical product size
- `averageWeight`: Typical weight
- `materials`: Related materials (via junction table)

### StoreSubCategory

Categories for store products:

- `subCategory`: Category name (searchable)
- `storeCategoryId`: Parent category
- `materials`: Material composition (via junction table)

### ServiceSubCategory

Categories for services:

- `subCategory`: Category name (searchable)
- `serviceCategoryId`: Parent category

### SearchLog

Records every search query:

- `id`: Unique search ID (returned to client)
- `query`: Normalized search query
- `resultCount`: Number of results found
- `userId`: User who searched (optional)
- `sessionId`: Session identifier (optional)
- `createdAt`: Timestamp

**Indexes**: `query`, `createdAt`, `userId`, `sessionId`

### SearchClick

Tracks clicks on search results:

- `searchId`: Links to SearchLog
- `itemId`: Clicked item ID
- `itemType`: Type (PRODUCT/STORE_PRODUCT/SERVICE)
- `position`: Position in results (1-based)
- `userId`: User who clicked (optional)
- `clickedAt`: Timestamp

**Used for**: CTR analysis, ranking improvements

### ItemView

Tracks item detail page views:

- `itemId`: Viewed item ID
- `itemType`: Item type
- `userId`: Viewer (optional)
- `sessionId`: Session (optional)
- `duration`: Time spent viewing (seconds)
- `source`: Where user came from (search/recommendation/direct)
- `viewedAt`: Timestamp

**Used for**: Recommendations, trending detection

### PopularSearch

Aggregated trending search data:

- `query`: Search query (unique)
- `searchCount`: Total times searched
- `clickCount`: Total clicks on results
- `lastSearched`: Most recent search
- `trendingScore`: Calculated trending score

**Updated**: Real-time on search + hourly cron job

### UserSearchHistory

Per-user search history:

- `userId`: User ID
- `query`: Search query
- `resultCount`: Results found
- `searchedAt`: Timestamp

**Used for**: Recent searches feature (future)

### SearchSession

Groups related searches:

- `sessionId`: Session identifier
- `userId`: User (optional)
- `startedAt`: Session start
- `endedAt`: Session end
- `searchCount`: Searches in session
- `clickedResults`: Clicks in session

### SearchCorrection

Spell correction mappings:

- `incorrectTerm`: Misspelled word
- `correctTerm`: Correct spelling
- `frequency`: Times this correction occurred
- `confidence`: Confidence score (0-1)
- `isActive`: Whether to use

**Example**: "laptap" → "laptop"

### SearchSynonym

Query expansion with synonyms:

- `term`: Original term
- `synonym`: Synonym term
- `weight`: Relevance weight
- `isActive`: Whether to use

**Example**: "laptop" ↔ "notebook", "computer"

### SearchSuggestion

Autocomplete suggestion terms:

- `term`: Suggestion text
- `frequency`: Times suggested/selected
- `isActive`: Whether to show
- `updatedAt`: Last update

### StoreProductReview

Reviews for store products:

- `storeProductId`: Product being reviewed
- `userId`: Reviewer
- `rating`: Rating (1-5)
- `comment`: Review text
- `images`: Review photos
- `isVerifiedPurchase`: Purchased through platform
- `helpfulCount`: Helpful votes

**Used for**: Product ratings in search results

---

## Technical Terms

### Prisma

TypeScript ORM (Object-Relational Mapping) for database access. Provides:

- Type-safe database queries
- Schema definition
- Migrations
- Client generation

### GraphQL

API query language used by the search service. Features:

- Strongly typed schema
- Client specifies exact data needed
- Single endpoint for all operations
- Real-time subscriptions (not used yet)

### Apollo Federation

GraphQL composition approach where multiple services expose schemas that combine into one unified API.

**In Ekoru**: Search service is a federated subgraph.

### NestJS

TypeScript framework for building scalable server applications. Provides:

- Dependency injection
- Module system
- Decorators
- GraphQL integration

### Cron Job

Scheduled task that runs automatically at specified intervals. Search service uses:

- **Hourly**: Update trending scores
- **Daily**: Cleanup old logs, update suggestions
- **Weekly**: Remove unused suggestions

### Soft Delete

Marking records as deleted without actually removing them from the database.

- Sets `deletedAt` timestamp
- Preserves data for analytics
- Allows restoration if needed
- Excluded from search by default

### Pagination

Dividing large result sets into pages:

- **Offset-based**: Skip N records, take M records
- **Page**: Current page number (1-based)
- **Page Size**: Results per page (default: 20, max: 100)

**Formula**:

```typescript
skip = (page - 1) * pageSize;
```

### Parallel Queries

Executing multiple database queries simultaneously instead of sequentially. In search:

- Products, StoreProducts, and Services searched in parallel
- Reduces total query time by ~66%

### Migration

Database schema version control:

- Creates/modifies tables
- Adds/removes columns
- Creates indexes
- Runs SQL scripts

**Tool**: Prisma Migrate

---

## Performance Metrics

### Processing Time

Time taken to execute a search query from start to finish. Measured in milliseconds (ms).

**Target**: < 100ms
**Returned**: `processingTimeMs` field in response

### Query Plan

PostgreSQL's execution strategy for a query. Analyzed with `EXPLAIN ANALYZE` to optimize performance.

### Index Scan

Fast lookup using an index. Opposite of sequential scan (slow, reads entire table).

### Connection Pool

Reusable database connections managed by Prisma:

- Avoids creating new connection per query
- Limits concurrent connections
- Improves performance

---

## Spanish Language Support

### Spanish Stemming

PostgreSQL's Spanish text search configuration that:

- Removes Spanish stop words
- Stems Spanish verbs/nouns
- Handles Spanish accents
- Provides Spanish-specific ranking

**Configuration**: `'spanish'` in `to_tsvector()` and `plainto_tsquery()`

### Accent Handling

Spanish characters (á, é, í, ó, ú, ñ, ü) are preserved in:

- Normalization (not removed)
- Storage (kept as-is)
- Search (PostgreSQL handles accent folding)

---

## Future Concepts

### Vector Search

Semantic search using machine learning embeddings (not implemented yet):

- Understands meaning, not just keywords
- Finds conceptually similar items
- Uses pgvector extension

### Machine Learning Ranking

Personalized result ordering based on:

- User's past behavior
- Click patterns
- Purchase history
- Learned preferences

### A/B Testing

Comparing different ranking algorithms:

- Show variant A to 50% of users
- Show variant B to 50% of users
- Measure which performs better
- Deploy winner to everyone

---

## Acronyms

- **FTS**: Full-Text Search
- **CTR**: Click-Through Rate
- **GIN**: Generalized Inverted Index
- **ORM**: Object-Relational Mapping
- **API**: Application Programming Interface
- **SQL**: Structured Query Language
- **UUID**: Universally Unique Identifier
- **CUID**: Collision-resistant Unique Identifier
- **TTL**: Time To Live (cache duration)
- **NLP**: Natural Language Processing

---

_Last Updated: December 2025_
