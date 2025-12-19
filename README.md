# Ekoru Search Service

A GraphQL-based search microservice for the Ekoru marketplace, providing intelligent search, autocomplete, recommendations, and trending functionality for products and services.

## Overview

The search service implements a sophisticated full-text search system with the following key features:

- **Intelligent Search**: Multi-field text matching with relevance scoring
- **Autocomplete**: Real-time search suggestions as users type
- **Recommendations**: Personalized content based on browsing history
- **Trending**: Popular searches and items
- **Faceted Filtering**: Category, price range, ratings, and more
- **Spell Correction**: Query normalization and corrections
- **Multi-language Support**: Spanish and English stop words

## Architecture

### Technology Stack

- **Framework**: NestJS
- **Database**: PostgreSQL via Prisma ORM
- **API**: GraphQL
- **Language**: TypeScript

### Core Components

```
src/search/
├── search.service.ts       # Core search logic
├── search.resolver.ts      # GraphQL queries
├── dto/
│   └── search.input.ts     # Input types and enums
└── entities/
    └── search-result.entity.ts  # Response types
```

## GraphQL API

### 1. Search Query

Main search endpoint for products and services.

```graphql
query Search($input: SearchInput!) {
  search(input: $input) {
    items {
      id
      type
      name
      description
      price
      offerPrice
      hasOffer
      images
      category
      rating
      relevanceScore
    }
    pageInfo {
      currentPage
      totalItems
      totalPages
      hasNextPage
    }
    facets {
      categories {
        name
        count
      }
      priceRanges {
        name
        count
      }
      ratings {
        name
        count
      }
    }
    processingTimeMs
    suggestions
    correctedQuery
  }
}
```

**Input Parameters:**

- `query` (required): Search text
- `type`: Filter by ALL, PRODUCTS, or SERVICES (default: ALL)
- `page`: Page number (default: 1)
- `pageSize`: Results per page (1-100, default: 20)
- `sortBy`: RELEVANCE, PRICE_ASC, PRICE_DESC, NEWEST, RATING, POPULARITY
- `minPrice`, `maxPrice`: Price range filters
- `categories`: Array of category names
- `tags`: Array of tag filters
- `hasOffer`: Filter for items with offers
- `minRating`: Minimum rating filter (0-5)

### 2. Autocomplete Query

Provides search suggestions as users type.

```graphql
query Autocomplete($input: AutocompleteInput!) {
  autocomplete(input: $input) {
    suggestions {
      text
      type
      itemId
      category
      score
    }
    recentSearches
    popularSearches
  }
}
```

**Input Parameters:**

- `query` (required): Partial search text (minimum 2 characters)
- `limit`: Maximum suggestions (default: 8)
- `type`: Filter by ALL, PRODUCTS, or SERVICES

### 3. Recommendations Query

Personalized recommendations based on user activity.

```graphql
query Recommendations($input: RecommendationInput!) {
  recommendations(input: $input) {
    items {
      id
      type
      name
      description
      price
      images
      rating
      reason
      score
    }
  }
}
```

**Input Parameters:**

- `query`: Text to find similar items
- `recentSearches`: Array of recent search queries
- `viewedProductIds`: Array of viewed product IDs
- `viewedServiceIds`: Array of viewed service IDs
- `limit`: Maximum recommendations (default: 10)

### 4. Trending Query

Get trending searches and popular items.

```graphql
query Trending {
  trending {
    searches {
      query
      count
      score
    }
    products {
      id
      name
      price
      images
      rating
      score
    }
    services {
      id
      name
      price
      images
      rating
      score
    }
  }
}
```

## How Search Works

### 1. Query Processing Pipeline

```
User Query → Normalization → Tokenization → Search → Scoring → Sorting → Pagination
```

#### Normalization

- Converts to lowercase
- Removes special characters
- Handles Spanish characters (á, é, í, ó, ú, ñ, ü)
- Collapses multiple spaces

#### Tokenization

- Splits query into individual terms
- Removes stop words (common words like "the", "el", "la", "de")
- Filters out single-character terms

#### Spell Checking

- Detects common misspellings
- Suggests corrected queries when results are limited

### 2. Search Execution

The service searches across multiple fields in parallel:

**For Products:**

- Product name
- Description
- Brand
- Category name
- Category keywords

**For Services:**

- Service name
- Description
- Tags
- Subcategory name

### 3. Relevance Scoring

Each result is scored based on:

- **Exact matches** (highest priority): 10 points
- **Name matches**: 5 points per term
- **Description matches**: 2 points per term
- **Tag/category matches**: 3 points per term
- **Prefix matches**: Bonus for word-start matches
- **Rating boost**: 0-1 points based on rating
- **Recency boost**: Higher score for newer items

### 4. Filtering

Results are filtered by:

- Price range (min/max)
- Categories
- Tags
- Offer availability
- Minimum rating
- Active status
- Deletion status

### 5. Sorting Options

- **RELEVANCE** (default): By calculated relevance score
- **PRICE_ASC**: Lowest price first
- **PRICE_DESC**: Highest price first
- **NEWEST**: Most recently created
- **RATING**: Highest rated first
- **POPULARITY**: Based on view/sale metrics

### 6. Result Highlighting

Search terms are highlighted in results for better UX:

- Matches wrapped with `<mark>` tags
- Applied to name and description fields

### 7. Faceted Navigation

The service generates facets for:

- **Categories**: Available categories with result counts
- **Price Ranges**: Predefined price brackets
- **Ratings**: Rating levels (4+, 3+, 2+)

### 8. Search Analytics

All searches are logged for:

- Query tracking
- Result count analysis
- Performance monitoring
- Trend identification

## Autocomplete Implementation

Autocomplete provides instant feedback with:

1. **Item Matching**: Searches product/service names and brands
2. **Scoring**: Ranks suggestions by match quality
3. **Type Filtering**: Separate PRODUCT/SERVICE results
4. **Popular Searches**: Shows trending queries when input is minimal
5. **Category Context**: Displays category for each suggestion

Minimum query length: **2 characters**

## Recommendation Algorithm

Recommendations are generated using:

1. **Query-Based**: Similar items matching search terms
2. **Browsing History**: Items from viewed product categories
3. **Interest Matching**: Products with overlapping interests/tags
4. **Category Similarity**: Services in related subcategories
5. **Hybrid Scoring**: Combines relevance and popularity

## Trending Analysis

Trending data is calculated based on:

- Recent search frequency
- Item view counts
- Recent creation dates
- Rating quality

## Performance Optimization

- **Parallel Queries**: Products and services searched concurrently
- **Database Indexing**: Prisma indexes on searchable fields
- **Result Limiting**: Maximum 100 results per type before pagination
- **Processing Time Tracking**: Response includes `processingTimeMs`

## Environment Configuration

The service connects to PostgreSQL via environment variables:

```env
DATABASE_URL="postgresql://user:password@host:port/database"
NODE_ENV="development" # or "production"
```

## Development

### Running the Service

```bash
# Install dependencies
npm install

# Run database migrations
npx prisma migrate dev

# Start development server
npm run start:dev
```

### GraphQL Playground

Access the GraphQL playground at: `http://localhost:3000/graphql`

## Database Schema

The service queries these Prisma models:

- `Product`: Marketplace products
- `Service`: Service offerings
- `ProductCategory`: Product categorization
- `ServiceCategory`: Service categorization
- `Seller`: Product/service owners

See `prisma/schema.prisma` for full schema details.

## Future Enhancements

- Vector-based semantic search
- Machine learning ranking
- Multi-language search support
- Advanced synonym handling
- Real-time search analytics dashboard
- A/B testing for ranking algorithms
