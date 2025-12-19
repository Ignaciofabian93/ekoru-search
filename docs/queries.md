# Ekoru Search Service - GraphQL Queries & Mutations Guide

## Overview

This document provides comprehensive examples and explanations of all GraphQL queries and mutations available in the Ekoru Search Service, with practical usage examples for web applications.

---

## Table of Contents

1. [Search Query](#1-search-query)
2. [Autocomplete Query](#2-autocomplete-query)
3. [Recommendations Query](#3-recommendations-query)
4. [Trending Query](#4-trending-query)
5. [Track Search Click Mutation](#5-track-search-click-mutation)
6. [Track Item View Mutation](#6-track-item-view-mutation)
7. [Complete TypeScript Examples](#complete-typescript-examples)

---

## 1. Search Query

### Purpose

Main search endpoint that returns products, store products, and/or services matching a text query with full-text search capabilities, filtering, sorting, and pagination.

### GraphQL Query

```graphql
query Search($input: SearchInput!, $userId: String, $sessionId: String) {
  search(input: $input, userId: $userId, sessionId: $sessionId) {
    searchId
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
      subcategory
      rating
      reviewCount
      sellerId
      sellerName
      tags
      relevanceScore
      highlightedName
      highlightedDescription
    }
    pageInfo {
      currentPage
      pageSize
      totalItems
      totalPages
      hasNextPage
      hasPreviousPage
    }
    facets {
      categories {
        name
        count
      }
      types {
        name
        count
      }
      tags {
        name
        count
      }
      priceRanges {
        name
        count
      }
    }
    query
    processingTimeMs
    suggestions
    correctedQuery
  }
}
```

### Input Schema

```typescript
interface SearchInput {
  query: string; // Required: Search text
  type?: SearchType; // Optional: ALL | PRODUCTS | SERVICES (default: ALL)
  page?: number; // Optional: Page number, 1-based (default: 1)
  pageSize?: number; // Optional: Results per page, 1-100 (default: 20)
  sortBy?: SearchSortBy; // Optional: Sort order (default: RELEVANCE)
  minPrice?: number; // Optional: Minimum price filter
  maxPrice?: number; // Optional: Maximum price filter
  categories?: string[]; // Optional: Category name filters
  tags?: string[]; // Optional: Tag filters
  hasOffer?: boolean; // Optional: Filter items with offers
  minRating?: number; // Optional: Minimum rating 0-5
}

enum SearchType {
  ALL = "ALL",
  PRODUCTS = "PRODUCTS",
  SERVICES = "SERVICES",
}

enum SearchSortBy {
  RELEVANCE = "RELEVANCE",
  PRICE_ASC = "PRICE_ASC",
  PRICE_DESC = "PRICE_DESC",
  NEWEST = "NEWEST",
  RATING = "RATING",
  POPULARITY = "POPULARITY",
}
```

### Example Variables

**Basic search**:

```json
{
  "input": {
    "query": "gaming laptop"
  }
}
```

**Advanced search with filters**:

```json
{
  "input": {
    "query": "laptop",
    "type": "PRODUCTS",
    "page": 1,
    "pageSize": 20,
    "sortBy": "PRICE_ASC",
    "minPrice": 500,
    "maxPrice": 2000,
    "categories": ["Electronics"],
    "tags": ["gaming", "portable"],
    "hasOffer": true,
    "minRating": 4.0
  },
  "userId": "user-uuid-123",
  "sessionId": "sess-cuid-abc"
}
```

**Search only services**:

```json
{
  "input": {
    "query": "laptop repair",
    "type": "SERVICES",
    "sortBy": "RATING"
  }
}
```

### Response Structure

```typescript
interface SearchResponse {
  searchId?: number; // ID for click tracking
  items: SearchResultItem[]; // Array of results
  pageInfo: SearchPageInfo; // Pagination metadata
  facets: SearchFacets; // Filter aggregations
  query: string; // Original query
  processingTimeMs: number; // Query execution time
  suggestions?: string[]; // Alternative suggestions
  correctedQuery?: string; // Spell-corrected query
}

interface SearchResultItem {
  id: number;
  type: SearchResultType; // PRODUCT | STORE_PRODUCT | SERVICE
  name: string;
  description?: string;
  price?: number;
  offerPrice?: number;
  hasOffer: boolean;
  images?: string[];
  category?: string;
  subcategory?: string;
  rating?: number;
  reviewCount?: number;
  sellerId?: string;
  sellerName?: string;
  tags?: string[];
  relevanceScore: number; // Match quality score
  highlightedName?: string; // Name with <mark> tags
  highlightedDescription?: string; // Description with <mark> tags
}
```

### Example Response

```json
{
  "data": {
    "search": {
      "searchId": 12345,
      "items": [
        {
          "id": 1,
          "type": "PRODUCT",
          "name": "Gaming Laptop XPS 15",
          "highlightedName": "<mark>Gaming</mark> <mark>Laptop</mark> XPS 15",
          "description": "High performance gaming laptop with RTX 4070",
          "highlightedDescription": "High performance <mark>gaming</mark> <mark>laptop</mark> with RTX 4070",
          "price": 1500,
          "offerPrice": 1350,
          "hasOffer": true,
          "images": ["img1.jpg", "img2.jpg"],
          "category": "Electronics",
          "tags": ["gaming", "laptop", "nvidia"],
          "relevanceScore": 145,
          "rating": 4.5,
          "reviewCount": 23
        },
        {
          "id": 2,
          "type": "STORE_PRODUCT",
          "name": "Upcycled Laptop Bag",
          "price": 45,
          "images": ["bag1.jpg"],
          "category": "Accessories",
          "relevanceScore": 75
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
        "categories": [
          { "name": "Electronics", "count": 45 },
          { "name": "Accessories", "count": 12 }
        ],
        "types": [
          { "name": "PRODUCT", "count": 50 },
          { "name": "STORE_PRODUCT", "count": 15 },
          { "name": "SERVICE", "count": 2 }
        ],
        "tags": [
          { "name": "gaming", "count": 35 },
          { "name": "laptop", "count": 28 }
        ],
        "priceRanges": [
          { "name": "$0 - $10,000", "count": 12 },
          { "name": "$10,000 - $50,000", "count": 45 }
        ]
      },
      "query": "gaming laptop",
      "processingTimeMs": 87,
      "suggestions": [],
      "correctedQuery": null
    }
  }
}
```

### React/Next.js Usage Example

```typescript
import { useQuery } from '@apollo/client';
import { SEARCH_QUERY } from './queries';

function SearchPage() {
  const [filters, setFilters] = useState({
    query: '',
    page: 1,
    pageSize: 20,
    sortBy: 'RELEVANCE',
  });

  const { data, loading, error } = useQuery(SEARCH_QUERY, {
    variables: {
      input: filters,
      userId: session?.user?.id,
      sessionId: sessionStorage.getItem('sessionId'),
    },
    skip: !filters.query, // Don't search if no query
  });

  return (
    <div className="search-page">
      <SearchBar
        onSearch={(query) => setFilters({ ...filters, query, page: 1 })}
      />

      {data?.search.correctedQuery && (
        <div className="suggestion">
          Did you mean: <strong>{data.search.correctedQuery}</strong>?
        </div>
      )}

      <div className="layout">
        <Sidebar facets={data?.search.facets} onFilterChange={setFilters} />

        <main>
          <SortControls
            sortBy={filters.sortBy}
            onChange={(sortBy) => setFilters({ ...filters, sortBy, page: 1 })}
          />

          {loading ? (
            <LoadingSpinner />
          ) : (
            <>
              <ResultsGrid
                items={data?.search.items}
                searchId={data?.search.searchId}
              />
              <Pagination
                pageInfo={data?.search.pageInfo}
                onPageChange={(page) => setFilters({ ...filters, page })}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
```

---

## 2. Autocomplete Query

### Purpose

Provides real-time search suggestions as users type, including matching items and popular searches.

### GraphQL Query

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

### Input Schema

```typescript
interface AutocompleteInput {
  query: string; // Required: Partial search text (min 2 chars)
  limit?: number; // Optional: Max suggestions, 1-20 (default: 8)
  type?: SearchType; // Optional: ALL | PRODUCTS | SERVICES (default: ALL)
}
```

### Example Variables

```json
{
  "input": {
    "query": "lap",
    "limit": 8,
    "type": "ALL"
  }
}
```

### Response Structure

```typescript
interface AutocompleteResponse {
  suggestions: AutocompleteItem[];
  recentSearches: string[]; // User's recent searches (empty for now)
  popularSearches: string[]; // Top trending searches
}

interface AutocompleteItem {
  text: string; // Suggestion text
  type: SearchResultType; // Item type
  itemId?: number; // ID of actual item (if matched)
  category?: string; // Item category
  score: number; // Relevance score
}
```

### Example Response

```json
{
  "data": {
    "autocomplete": {
      "suggestions": [
        {
          "text": "Laptop Dell XPS 13",
          "type": "PRODUCT",
          "itemId": 123,
          "category": "Computers",
          "score": 100
        },
        {
          "text": "Laptop HP Pavilion",
          "type": "PRODUCT",
          "itemId": 456,
          "category": "Computers",
          "score": 95
        },
        {
          "text": "Laptop Repair Service",
          "type": "SERVICE",
          "itemId": 789,
          "category": "Tech Support",
          "score": 80
        }
      ],
      "recentSearches": [],
      "popularSearches": ["laptop gaming", "phone cases", "furniture"]
    }
  }
}
```

### React/Next.js Usage Example

```typescript
import { useLazyQuery } from '@apollo/client';
import { debounce } from 'lodash';

function SearchAutocomplete() {
  const [query, setQuery] = useState('');
  const [getAutocomplete, { data, loading }] = useLazyQuery(AUTOCOMPLETE_QUERY);

  // Debounced autocomplete to avoid too many requests
  const handleInputChange = debounce((value: string) => {
    if (value.length >= 2) {
      getAutocomplete({
        variables: {
          input: {
            query: value,
            limit: 8
          }
        }
      });
    }
  }, 300); // Wait 300ms after user stops typing

  return (
    <div className="autocomplete-container">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          handleInputChange(e.target.value);
        }}
        onFocus={() => {
          // Show popular searches when focused with no query
          if (!query) {
            getAutocomplete({
              variables: { input: { query: '', limit: 5 } }
            });
          }
        }}
        placeholder="Search products and services..."
      />

      {data && (
        <div className="suggestions-dropdown">
          {/* Matching items */}
          {data.autocomplete.suggestions.map((item) => (
            <div
              key={`${item.type}-${item.itemId}`}
              className="suggestion-item"
              onClick={() => router.push(`/item/${item.itemId}`)}
            >
              <span className="text">{item.text}</span>
              <span className="category">{item.category}</span>
            </div>
          ))}

          {/* Popular searches when no query */}
          {!query && data.autocomplete.popularSearches.length > 0 && (
            <div className="popular-section">
              <h4>Popular Searches</h4>
              {data.autocomplete.popularSearches.map((search) => (
                <div
                  key={search}
                  className="popular-item"
                  onClick={() => setQuery(search)}
                >
                  {search}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## 3. Recommendations Query

### Purpose

Get personalized item recommendations based on search queries, viewed products, or viewed services.

### GraphQL Query

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
    basedOn
  }
}
```

### Input Schema

```typescript
interface RecommendationInput {
  query?: string; // Optional: Find items similar to query
  viewedProductIds?: number[]; // Optional: Recently viewed product IDs
  viewedServiceIds?: number[]; // Optional: Recently viewed service IDs
  limit?: number; // Optional: Max recommendations, 1-50 (default: 10)
}
```

### Example Variables

**Based on query**:

```json
{
  "input": {
    "query": "gaming laptop",
    "limit": 10
  }
}
```

**Based on browsing history**:

```json
{
  "input": {
    "viewedProductIds": [1, 2, 3],
    "viewedServiceIds": [10, 11],
    "limit": 10
  }
}
```

**Combined**:

```json
{
  "input": {
    "query": "laptop",
    "viewedProductIds": [1, 2],
    "limit": 6
  }
}
```

### Response Structure

```typescript
interface RecommendationResponse {
  items: RecommendationItem[];
  basedOn?: string; // What recommendations are based on
}

interface RecommendationItem {
  id: number;
  type: SearchResultType;
  name: string;
  description?: string;
  price?: number;
  images?: string[];
  rating?: number;
  reason: string; // Why this is recommended
  score: number; // Relevance score
}
```

### Example Response

```json
{
  "data": {
    "recommendations": {
      "items": [
        {
          "id": 5,
          "type": "PRODUCT",
          "name": "HP Gaming Laptop",
          "description": "Similar to what you viewed",
          "price": 1200,
          "images": ["hp1.jpg"],
          "rating": 4.3,
          "reason": "Based on your browsing history",
          "score": 0.85
        },
        {
          "id": 12,
          "type": "SERVICE",
          "name": "Laptop Upgrade Service",
          "description": "Upgrade your laptop performance",
          "price": 150,
          "reason": "Related service",
          "score": 0.75
        }
      ],
      "basedOn": "browsing history"
    }
  }
}
```

### React/Next.js Usage Example

```typescript
// On product detail page
function ProductDetailPage({ productId }: { productId: number }) {
  const { data: recommendations } = useQuery(RECOMMENDATIONS_QUERY, {
    variables: {
      input: {
        viewedProductIds: getRecentlyViewedProducts(), // From localStorage
        limit: 6,
      },
    },
  });

  return (
    <div>
      <ProductDetails id={productId} />

      {recommendations && (
        <section className="recommendations">
          <h2>You Might Also Like</h2>
          <p className="based-on">{recommendations.recommendations.basedOn}</p>

          <div className="grid">
            {recommendations.recommendations.items.map((item) => (
              <RecommendationCard
                key={`${item.type}-${item.id}`}
                item={item}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// Helper to track viewed products
function getRecentlyViewedProducts(): number[] {
  const viewed = localStorage.getItem('recentlyViewed');
  return viewed ? JSON.parse(viewed) : [];
}

function addToRecentlyViewed(productId: number) {
  const viewed = getRecentlyViewedProducts();
  const updated = [productId, ...viewed.filter(id => id !== productId)].slice(0, 10);
  localStorage.setItem('recentlyViewed', JSON.stringify(updated));
}
```

---

## 4. Trending Query

### Purpose

Get trending searches, products, and services based on recent user activity.

### GraphQL Query

```graphql
query Trending {
  trending {
    searches {
      query
      searchCount
      trendScore
    }
    products {
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
    services {
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

### Input

No input parameters required.

### Response Structure

```typescript
interface TrendingResponse {
  searches: TrendingSearch[]; // Top 10 trending queries
  products: RecommendationItem[]; // 6 trending products
  services: RecommendationItem[]; // 6 trending services
}

interface TrendingSearch {
  query: string; // Search query
  searchCount: number; // Times searched recently
  trendScore: number; // Trending score (0-1)
}
```

### Example Response

```json
{
  "data": {
    "trending": {
      "searches": [
        { "query": "gaming laptop", "searchCount": 156, "trendScore": 1.0 },
        { "query": "phone cases", "searchCount": 98, "trendScore": 0.9 },
        { "query": "furniture", "searchCount": 87, "trendScore": 0.8 }
      ],
      "products": [
        {
          "id": 1,
          "type": "PRODUCT",
          "name": "Gaming Laptop XPS",
          "description": "Most viewed this week",
          "price": 1500,
          "images": ["xps1.jpg"],
          "rating": 4.7,
          "reason": "Trending now",
          "score": 1
        }
      ],
      "services": [
        {
          "id": 10,
          "type": "SERVICE",
          "name": "Phone Repair",
          "description": "Popular service",
          "price": 50,
          "reason": "Popular service",
          "score": 1
        }
      ]
    }
  }
}
```

### React/Next.js Usage Example

```typescript
function HomePage() {
  const { data } = useQuery(TRENDING_QUERY);

  return (
    <div className="homepage">
      {/* Hero Section */}
      <Hero />

      {/* Trending Searches */}
      <section className="trending-searches">
        <h2>Trending Searches</h2>
        <div className="search-badges">
          {data?.trending.searches.map((search) => (
            <button
              key={search.query}
              className="search-badge"
              onClick={() => router.push(`/search?q=${search.query}`)}
            >
              🔥 {search.query}
              <span className="count">{search.searchCount}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Trending Products */}
      <section className="trending-products">
        <h2>Trending Products</h2>
        <ProductGrid items={data?.trending.products} />
      </section>

      {/* Popular Services */}
      <section className="popular-services">
        <h2>Popular Services</h2>
        <ServiceGrid items={data?.trending.services} />
      </section>
    </div>
  );
}
```

---

## 5. Track Search Click Mutation

### Purpose

Track when a user clicks on a search result for analytics and relevance improvement.

### GraphQL Mutation

```graphql
mutation TrackSearchClick($input: TrackSearchClickInput!) {
  trackSearchClick(input: $input)
}
```

### Input Schema

```typescript
interface TrackSearchClickInput {
  searchId: number; // Required: searchId from search response
  itemId: number; // Required: ID of clicked item
  itemType: string; // Required: PRODUCT | STORE_PRODUCT | SERVICE
  position: number; // Required: Position in results (1-based)
  userId?: string; // Optional: User ID for personalization
}
```

### Example Variables

```json
{
  "input": {
    "searchId": 12345,
    "itemId": 67890,
    "itemType": "PRODUCT",
    "position": 3,
    "userId": "user-uuid-123"
  }
}
```

### Response

```json
{
  "data": {
    "trackSearchClick": true
  }
}
```

Returns `boolean`: `true` if tracked successfully, `false` otherwise.

### React/Next.js Usage Example

```typescript
function SearchResultCard({ item, searchId, position }: Props) {
  const [trackClick] = useMutation(TRACK_SEARCH_CLICK_MUTATION);

  const handleClick = () => {
    // Track the click
    trackClick({
      variables: {
        input: {
          searchId,
          itemId: item.id,
          itemType: item.type,
          position,
          userId: session?.user?.id,
        },
      },
    }).catch(() => {
      // Fail silently - analytics shouldn't break UX
    });

    // Navigate to item
    router.push(`/item/${item.id}`);
  };

  return (
    <div className="result-card" onClick={handleClick}>
      <img src={item.images[0]} alt={item.name} />
      <h3 dangerouslySetInnerHTML={{ __html: item.highlightedName }} />
      <p className="price">${item.price}</p>
    </div>
  );
}
```

---

## 6. Track Item View Mutation

### Purpose

Track when a user views an item detail page for analytics and recommendation improvement.

### GraphQL Mutation

```graphql
mutation TrackItemView($input: TrackItemViewInput!) {
  trackItemView(input: $input)
}
```

### Input Schema

```typescript
interface TrackItemViewInput {
  itemId: number; // Required: ID of viewed item
  itemType: string; // Required: PRODUCT | STORE_PRODUCT | SERVICE
  userId?: string; // Optional: User ID
  sessionId?: string; // Optional: Session ID
  duration?: number; // Optional: Time spent viewing (seconds)
  source?: string; // Optional: search | recommendation | direct
}
```

### Example Variables

```json
{
  "input": {
    "itemId": 67890,
    "itemType": "PRODUCT",
    "userId": "user-uuid-123",
    "sessionId": "sess-cuid-abc",
    "duration": 45,
    "source": "search"
  }
}
```

### Response

```json
{
  "data": {
    "trackItemView": true
  }
}
```

Returns `boolean`: `true` if tracked successfully.

### React/Next.js Usage Example

```typescript
function ProductDetailPage({ productId, productType }: Props) {
  const [trackView] = useMutation(TRACK_ITEM_VIEW_MUTATION);
  const startTime = useRef(Date.now());

  useEffect(() => {
    // Track view when component unmounts or user navigates away
    return () => {
      const duration = Math.floor((Date.now() - startTime.current) / 1000);

      trackView({
        variables: {
          input: {
            itemId: productId,
            itemType: productType,
            userId: session?.user?.id,
            sessionId: sessionStorage.getItem('sessionId'),
            duration,
            source: router.query.from || 'direct',
          },
        },
      }).catch(() => {
        // Fail silently
      });
    };
  }, [productId]);

  return (
    <div className="product-page">
      <ProductDetails id={productId} />
    </div>
  );
}

// Usage in router link
<Link href={`/product/${item.id}?from=search`}>
  View Product
</Link>
```

---

## Complete TypeScript Examples

### Query Definitions File

```typescript
// queries/search.ts
import { gql } from "@apollo/client";

export const SEARCH_QUERY = gql`
  query Search($input: SearchInput!, $userId: String, $sessionId: String) {
    search(input: $input, userId: $userId, sessionId: $sessionId) {
      searchId
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
        subcategory
        rating
        reviewCount
        sellerId
        tags
        relevanceScore
        highlightedName
        highlightedDescription
      }
      pageInfo {
        currentPage
        pageSize
        totalItems
        totalPages
        hasNextPage
        hasPreviousPage
      }
      facets {
        categories {
          name
          count
        }
        types {
          name
          count
        }
        tags {
          name
          count
        }
        priceRanges {
          name
          count
        }
      }
      query
      processingTimeMs
      suggestions
      correctedQuery
    }
  }
`;

export const AUTOCOMPLETE_QUERY = gql`
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
`;

export const RECOMMENDATIONS_QUERY = gql`
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
      basedOn
    }
  }
`;

export const TRENDING_QUERY = gql`
  query Trending {
    trending {
      searches {
        query
        searchCount
        trendScore
      }
      products {
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
      services {
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
`;

export const TRACK_SEARCH_CLICK_MUTATION = gql`
  mutation TrackSearchClick($input: TrackSearchClickInput!) {
    trackSearchClick(input: $input)
  }
`;

export const TRACK_ITEM_VIEW_MUTATION = gql`
  mutation TrackItemView($input: TrackItemViewInput!) {
    trackItemView(input: $input)
  }
`;
```

### Custom Hook for Search

```typescript
// hooks/useSearch.ts
import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { SEARCH_QUERY, TRACK_SEARCH_CLICK_MUTATION } from "../queries/search";

interface UseSearchOptions {
  userId?: string;
  sessionId?: string;
}

export function useSearch({ userId, sessionId }: UseSearchOptions = {}) {
  const [searchInput, setSearchInput] = useState({
    query: "",
    page: 1,
    pageSize: 20,
    sortBy: "RELEVANCE" as const,
  });

  const { data, loading, error, refetch } = useQuery(SEARCH_QUERY, {
    variables: {
      input: searchInput,
      userId,
      sessionId,
    },
    skip: !searchInput.query,
  });

  const [trackClick] = useMutation(TRACK_SEARCH_CLICK_MUTATION);

  const handleSearch = (query: string) => {
    setSearchInput((prev) => ({ ...prev, query, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setSearchInput((prev) => ({ ...prev, page }));
  };

  const handleSortChange = (sortBy: string) => {
    setSearchInput((prev) => ({ ...prev, sortBy, page: 1 }));
  };

  const handleFilterChange = (filters: Partial<typeof searchInput>) => {
    setSearchInput((prev) => ({ ...prev, ...filters, page: 1 }));
  };

  const handleResultClick = async (item: any, position: number) => {
    if (data?.search.searchId) {
      try {
        await trackClick({
          variables: {
            input: {
              searchId: data.search.searchId,
              itemId: item.id,
              itemType: item.type,
              position,
              userId,
            },
          },
        });
      } catch (error) {
        console.error("Failed to track click:", error);
      }
    }
  };

  return {
    results: data?.search,
    loading,
    error,
    searchInput,
    handleSearch,
    handlePageChange,
    handleSortChange,
    handleFilterChange,
    handleResultClick,
    refetch,
  };
}
```

### Full Search Page Component

```typescript
// pages/search.tsx
import { useSession } from 'next-auth/react';
import { useSearch } from '../hooks/useSearch';
import SearchBar from '../components/SearchBar';
import ResultsGrid from '../components/ResultsGrid';
import Pagination from '../components/Pagination';
import Sidebar from '../components/Sidebar';

export default function SearchPage() {
  const { data: session } = useSession();
  const sessionId = sessionStorage.getItem('sessionId') || generateSessionId();

  const {
    results,
    loading,
    error,
    searchInput,
    handleSearch,
    handlePageChange,
    handleSortChange,
    handleFilterChange,
    handleResultClick,
  } = useSearch({
    userId: session?.user?.id,
    sessionId,
  });

  if (error) {
    return <ErrorPage error={error} />;
  }

  return (
    <div className="search-page">
      <SearchBar
        initialQuery={searchInput.query}
        onSearch={handleSearch}
      />

      {results?.correctedQuery && (
        <div className="spell-correction">
          Did you mean: <strong>{results.correctedQuery}</strong>?
        </div>
      )}

      {results?.suggestions && results.suggestions.length > 0 && (
        <div className="suggestions">
          <p>Try searching for:</p>
          {results.suggestions.map((suggestion) => (
            <button key={suggestion} onClick={() => handleSearch(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <div className="search-layout">
        <Sidebar
          facets={results?.facets}
          onFilterChange={handleFilterChange}
        />

        <main className="search-results">
          <div className="results-header">
            <p>{results?.pageInfo.totalItems || 0} results</p>
            <select
              value={searchInput.sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
            >
              <option value="RELEVANCE">Most Relevant</option>
              <option value="PRICE_ASC">Price: Low to High</option>
              <option value="PRICE_DESC">Price: High to Low</option>
              <option value="RATING">Highest Rated</option>
              <option value="NEWEST">Newest</option>
            </select>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : (
            <>
              <ResultsGrid
                items={results?.items || []}
                searchId={results?.searchId}
                onResultClick={handleResultClick}
              />

              {results?.pageInfo && (
                <Pagination
                  pageInfo={results.pageInfo}
                  onPageChange={handlePageChange}
                />
              )}
            </>
          )}

          {results?.processingTimeMs && (
            <p className="debug-info">
              Search completed in {results.processingTimeMs}ms
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

function generateSessionId(): string {
  const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  sessionStorage.setItem('sessionId', sessionId);
  return sessionId;
}
```

---

_Last Updated: December 2025_
