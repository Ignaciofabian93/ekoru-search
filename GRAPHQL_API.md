# ekoru-search — GraphQL API Reference

> **Subgraph**: Search & discovery — full-text search, autocomplete, personalized recommendations, trending items, and analytics tracking.

---

## Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | Optional | `Bearer <jwt_token>` — enables personalized results |

---

## Enums

```graphql
enum SearchType {
  ALL        # Search both products and services (default)
  PRODUCTS   # Marketplace + store products only
  SERVICES   # Services only
}

enum SearchSortBy {
  RELEVANCE   # Default — by relevance score
  PRICE_ASC   # Lowest price first
  PRICE_DESC  # Highest price first
  NEWEST      # Most recently added
  RATING      # Highest rated
  POPULARITY  # Most popular/viewed
}

enum SearchResultType {
  PRODUCT        # Marketplace product
  STORE_PRODUCT  # Store product
  SERVICE        # Service
}
```

---

## Fragments

```graphql
fragment SearchPageInfoFields on SearchPageInfo {
  currentPage
  pageSize
  totalItems
  totalPages
  hasNextPage
  hasPreviousPage
}

fragment SearchFacetsFields on SearchFacets {
  categories { name count }
  priceRanges { name count }
  tags { name count }
  types { name count }
}

fragment SearchResultItemFields on SearchResultItem {
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

fragment RecommendationItemFields on RecommendationItem {
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
```

---

## Queries

### search

Full-text search across marketplace products, store products, and services. Returns ranked results with facets for filtering.

```graphql
query Search(
  $input: SearchInput!
  $userId: String
  $sessionId: String
) {
  search(input: $input, userId: $userId, sessionId: $sessionId) {
    searchId
    query
    correctedQuery
    suggestions
    processingTimeMs
    items {
      ...SearchResultItemFields
    }
    pageInfo {
      ...SearchPageInfoFields
    }
    facets {
      ...SearchFacetsFields
    }
  }
}
```

**Variables**
```json
{
  "input": {
    "query": "iPhone 15",
    "type": "ALL",
    "page": 1,
    "pageSize": 20,
    "sortBy": "RELEVANCE",
    "minPrice": 500000,
    "maxPrice": 2000000,
    "categories": ["smartphones"],
    "tags": ["apple"],
    "hasOffer": false,
    "minRating": 4.0
  },
  "userId": "seller-uuid-here",
  "sessionId": "session-abc123"
}
```

---

### autocomplete

Get search suggestions as the user types. Returns matching items plus recent and popular searches.

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

**Variables**
```json
{
  "input": {
    "query": "iPh",
    "limit": 8,
    "type": "ALL"
  }
}
```

---

### recommendations

Get personalized item recommendations based on user activity, recent searches, and viewed items.

```graphql
query Recommendations($input: RecommendationInput!) {
  recommendations(input: $input) {
    basedOn
    items {
      ...RecommendationItemFields
    }
  }
}
```

**Variables**
```json
{
  "input": {
    "query": "smartphones",
    "recentSearches": ["iPhone", "Samsung Galaxy"],
    "viewedProductIds": [42, 55, 103],
    "viewedServiceIds": [7, 12],
    "limit": 10
  }
}
```

---

### trending

Get trending searches, products, and services across the platform.

```graphql
query Trending {
  trending {
    searches {
      query
      searchCount
      trendScore
    }
    products {
      ...RecommendationItemFields
    }
    services {
      ...RecommendationItemFields
    }
  }
}
```

---

## Mutations

### trackSearchClick

Track when a user clicks on a search result. Used to improve search relevance.

```graphql
mutation TrackSearchClick($input: TrackSearchClickInput!) {
  trackSearchClick(input: $input)
}
```

**Variables**
```json
{
  "input": {
    "searchId": 1234,
    "itemId": 42,
    "itemType": "PRODUCT",
    "position": 3,
    "userId": "seller-uuid-here"
  }
}
```

---

### trackItemView

Track when a user views an item detail page. Used for recommendations and personalization.

```graphql
mutation TrackItemView($input: TrackItemViewInput!) {
  trackItemView(input: $input)
}
```

**Variables**
```json
{
  "input": {
    "itemId": 42,
    "itemType": "STORE_PRODUCT",
    "userId": "seller-uuid-here",
    "sessionId": "session-abc123",
    "duration": 45,
    "source": "search"
  }
}
```

---

## Input Types

### SearchInput

```graphql
input SearchInput {
  query: String!
  type: SearchType          # ALL | PRODUCTS | SERVICES (default: ALL)
  page: Int                 # Default: 1, Min: 1
  pageSize: Int             # Default: 20, Min: 1, Max: 100
  sortBy: SearchSortBy      # RELEVANCE | PRICE_ASC | PRICE_DESC | NEWEST | RATING | POPULARITY (default: RELEVANCE)
  minPrice: Float
  maxPrice: Float
  categories: [String!]
  tags: [String!]
  hasOffer: Boolean
  minRating: Float          # 0–5
}
```

### AutocompleteInput

```graphql
input AutocompleteInput {
  query: String!
  limit: Int       # Default: 8, Min: 1, Max: 20
  type: SearchType # ALL | PRODUCTS | SERVICES (default: ALL)
}
```

### RecommendationInput

```graphql
input RecommendationInput {
  query: String
  recentSearches: [String!]
  viewedProductIds: [Int!]
  viewedServiceIds: [Int!]
  limit: Int          # Default: 10, Min: 1, Max: 50
}
```

### TrackSearchClickInput

```graphql
input TrackSearchClickInput {
  searchId: Int!     # ID from SearchResponse.searchId
  itemId: Int!
  itemType: String!  # PRODUCT | STORE_PRODUCT | SERVICE
  position: Int!     # 1-based position in results (Min: 1)
  userId: String
}
```

### TrackItemViewInput

```graphql
input TrackItemViewInput {
  itemId: Int!
  itemType: String!  # PRODUCT | STORE_PRODUCT | SERVICE
  userId: String
  sessionId: String
  duration: Int      # View duration in seconds (Min: 0)
  source: String     # e.g. "search", "recommendation", "trending"
}
```
