# Typesense Search (as-built)

> Status: implemented 2026-06. Companion to `docs/SEARCH_SCALABILITY_PLAN.md` (the
> design rationale). This document is the **as-built reference**: what changed, how it
> works, how to run it, and what is still missing.

## 1. Summary

The `search` query is now served by **Typesense** (typo-tolerant, multi-language),
behind the **unchanged GraphQL contract**. The legacy PostgreSQL full-text path is kept
and selectable via a flag for rollback. Highlights:

- **Multi-language**: a `language` arg routes the query to a per-locale collection
  (`catalog_es` / `catalog_en` / `catalog_fr`). Typesense provides typo tolerance.
- **Engine is swappable**: resolvers/services depend on a `SearchEngine` port, not on the
  Typesense client. Moving to Typesense Cloud is an env change; replacing the engine is a
  new adapter.
- **Flag-guarded**: `SEARCH_ENGINE=typesense` (default) or `postgres` (rollback).
- **Seller exclusion**: a logged-in user's own listings are excluded from results
  (carried over from the marketplace/stores/services change, applied here as a Typesense
  `filter_by`).
- **Autocomplete / recommendations / trending are unchanged** (still Postgres) and out of
  scope; the broken in-flow "suggestion generation" was removed from `search`.

## 2. Architecture

```
GraphQL  search(input, language)  ─►  SearchService
                                        │  SEARCH_ENGINE=typesense → SearchEngine port (default)
                                        │  SEARCH_ENGINE=postgres  → FullTextSearchStrategy (rollback)
                                        ▼
                                  TypesenseSearchEngine ─►  Typesense (Docker)
                                                             catalog_es | catalog_en | catalog_fr
CatalogIndexerService ── raw SQL (items + seller→country/region → locale) ──► upsert into catalog_<locale>
   • reindexAll()       admin mutation + `npm run reindex` (full load)
   • syncIncremental()  @Cron every 5 min (changed-since window, drops deactivated)
```

- **Collection per language.** Content is single-language per item, so each item lives in
  exactly one collection; the `language` arg picks which collection to query.
- **Namespaced doc ids** (`product_<id>`, `store_<id>`, `service_<id>`) let the three
  sources coexist in one collection; a `type` field supports `SearchType` filtering.

## 3. Files

### Added
| File | Purpose |
|------|---------|
| `docker-compose.yml` | Self-hosted Typesense service (volume + API key). |
| `src/search/engine/search-engine.interface.ts` | `SearchEngine` port, `SEARCH_ENGINE` DI token, `CatalogDocument` shape. |
| `src/search/engine/typesense.engine.ts` | `TypesenseSearchEngine` adapter (schema, query/filter/sort/facet mapping, health). |
| `src/search/indexer/locale.config.ts` | `language → locale` routing and `seller → locale` derivation (onboarding point). |
| `src/search/indexer/catalog-indexer.service.ts` | Full reindex + `@Cron` incremental sync. |
| `src/scripts/reindex.ts` | `npm run reindex` one-shot full load. |
| `src/search/engine/typesense.engine.spec.ts`, `src/search/indexer/locale.config.spec.ts` | Unit tests. |

### Modified
| File | Change |
|------|--------|
| `src/search/search.service.ts` | Branches engine vs Postgres; `searchViaEngine()` maps engine results; removed in-flow `generateSuggestions`/`calculateSimilarity` (`suggestions` now always `[]`). |
| `src/search/search.resolver.ts` | `language` arg on `search`; admin `reindexCatalog` mutation; passes `excludeSellerId` from `ctx.sellerId`. |
| `src/search/search.module.ts` | Registers `TypesenseSearchEngine`, binds `SEARCH_ENGINE`, provides `CatalogIndexerService`. |
| `src/graphql/enums/index.ts` | Local `Language` enum (ES/EN/FR/PT/DE) + `registerEnumType`. |
| `src/config/configuration.ts`, `.env` | `searchEngine` + `typesense.*` config. |
| `src/health/health.controller.ts` | Adds a Typesense liveness ping to `GET /health`. |
| `package.json` | `typesense` dep + `reindex` script. |

## 4. How it works

### 4.1 Query flow (`search`)
1. `SearchResolver.search(input, language=ES, ctx, userId?, sessionId?)` calls
   `SearchService.search({ input, language, userId, sessionId, excludeSellerId: ctx.sellerId })`.
2. `SearchService` checks `SEARCH_ENGINE`. Default → `searchViaEngine`; `postgres` →
   `searchViaPostgres` (legacy).
3. `searchViaEngine` resolves the collection via `localeFromLanguage(language)` and calls
   `engine.search({ locale, input, excludeSellerId })`.
4. `TypesenseSearchEngine.search` issues one Typesense query and maps the response back to
   the existing `SearchResultItem[]` / `SearchFacets` / `found` (total).
5. The search is logged (`SearchLog`) for analytics; `suggestions` is always `[]`.

### 4.2 Typesense query mapping
- `q` = the query (empty → `*`, i.e. browse all).
- `query_by` = `name,brand,category,tags,description` with weights `5,3,3,2,1`.
- `filter_by` is built from the input:
  - `excludeSellerId` → `sellerId:!=\`<id>\``
  - `SearchType.PRODUCTS` → `type:[PRODUCT,STORE_PRODUCT]`; `SERVICES` → `type:=SERVICE`
  - `minPrice`/`maxPrice` → `price:>=` / `price:<=`; `hasOffer` → `hasOffer:=`;
    `minRating` → `rating:>=`; `categories`/`tags` → `category:[…]` / `tags:[…]`
- `sort_by` from `SearchSortBy`: `RELEVANCE`→`_text_match:desc,createdAt:desc`,
  `PRICE_ASC/DESC`, `NEWEST`→`createdAt:desc`, `RATING`, `POPULARITY`→`reviewCount:desc`.
- `facet_by` = `type,category,tags` → mapped to `SearchFacets` (priceRanges not produced).
- Typo tolerance uses Typesense defaults.

### 4.3 Collections & locale routing
- Collections: `catalog_es`, `catalog_en`, `catalog_fr` (`SUPPORTED_LOCALES`).
- **Query side**: `localeFromLanguage(language)` — ES/EN/FR map directly; PT/DE fall back to
  the default locale (`es`) until those collections exist.
- **Index side**: `localeFromSeller({ countryId, regionName })` —
  region matching `quebec`/`québec` → `fr`; else `countryId` via `LOCALE_COUNTRY_MAP`; else
  `es`. This is the **single onboarding point** for new markets.
- Collection schema fields: `entityId`, `type`, `name`, `description`, `brand`, `category`,
  `subcategory`, `tags[]`, `images[]` (not indexed), `price`, `offerPrice`, `hasOffer`,
  `rating`, `reviewCount`, `sellerId`, `createdAt` (`default_sorting_field`).

### 4.4 Indexing & sync
- `reindexAll()` — `ensureCollections()` then upserts every active item per locale. Run via
  the admin `reindexCatalog` mutation or `npm run reindex`.
- `syncIncremental()` — `@Cron` every 5 min. Re-reads everything changed in the last ~11
  min (`SYNC_WINDOW_MS`, > 2× the interval) and upserts; deletes items deactivated/soft-
  deleted in that window. The deliberate overlap + idempotent upserts mean **no persisted
  cursor / no extra migration** is needed.
- Item rows are read with raw SQL (the search subgraph shares the DB; its own Prisma schema
  only holds `Search*` analytics tables), joining `Seller → Region` to derive locale.

### 4.5 Seller exclusion
`ctx.sellerId` (from the `x-seller-id` header) → `excludeSellerId` → Typesense
`filter_by: sellerId:!=…`. A user never sees their own listings in search; they remain
visible in their profile via the per-subgraph `get…BySeller` queries.

## 5. Configuration

| Env | Default | Meaning |
|-----|---------|---------|
| `SEARCH_ENGINE` | `typesense` | `typesense` or `postgres` (rollback). |
| `TYPESENSE_HOST` | `localhost` | Typesense host (Cloud: `<cluster>.typesense.net`). |
| `TYPESENSE_PORT` | `8108` | Port (Cloud: `443`). |
| `TYPESENSE_PROTOCOL` | `http` | `http` / `https`. |
| `TYPESENSE_API_KEY` | `dev-typesense-key` | API key (matches `docker-compose.yml`). |
| `TYPESENSE_TIMEOUT` | `5` | Client connection timeout (seconds). |
| `LOCALE_COUNTRY_MAP` | _(empty)_ | `"<countryId>:<locale>,…"`, e.g. `"1:es,2:en"`. Onboarding map. |

## 6. Running & verifying

### Local dev
```bash
# 1. start Typesense (dev defaults: localhost:8108, key "dev-typesense-key")
docker compose -f docker-compose.yml up -d typesense

# 2. set env (SEARCH_ENGINE=typesense, TYPESENSE_*), then full load
npm run reindex          # or call the reindexCatalog mutation with an x-admin-id header

# 3. query (GraphQL)
#    search(input: { query: "camion" }, language: ES) { items { id name } pageInfo { totalItems } }
#    - typo-tolerant; try language: EN against an English item
#    - with x-seller-id set, your own listings are excluded

# 4. rollback check
#    SEARCH_ENGINE=postgres -> the legacy full-text path serves

# health
curl localhost:<PORT>/health    # { "status": "ok", "typesense": "ok" }
```

### Server (staging / prod)
Typesense runs as a **standalone, long-lived stack**, separate from the app deploy, so
that `docker compose -f compose.prod.yml up -d --force-recreate` (run on every code deploy)
never restarts the search engine. The app and Typesense communicate over the shared
external docker network the app already uses (`ekoru-network` prod / `ekoru-staging-network`
staging); Typesense publishes **no host port**.

1. **Bring Typesense up once per server** (not in the Jenkinsfile, not in `compose.*.yml`):
   ```bash
   # place .env.typesense.<env> next to the file with TYPESENSE_API_KEY=...
   docker compose -f typesense.prod.yml up -d        # or typesense.staging.yml
   ```
   Container name: `ekoru-typesense` (prod) / `ekoru-typesense-staging` (staging).
   Data persists in the `typesense-*-data` volume across app deploys.

2. **Point the app at it** via its server-side env file
   (`/opt/ekoru/secrets/ekoru-search/.env.{staging,prod}`):
   ```
   SEARCH_ENGINE=typesense
   TYPESENSE_HOST=ekoru-typesense           # ekoru-typesense-staging on staging
   TYPESENSE_PORT=8108
   TYPESENSE_PROTOCOL=http
   TYPESENSE_API_KEY=<same key as .env.typesense.*>
   LOCALE_COUNTRY_MAP=<countryId:locale,...>   # see §8 onboarding
   ```
   The app deploys normally through Jenkins (`compose.staging.yml` / `compose.prod.yml`);
   no Typesense changes are needed in the pipeline.

3. **Initial index load.** The prod image is built without devDependencies, so
   `npm run reindex` (ts-node) is **not** available in the container. Trigger the load via
   the GraphQL mutation instead, once after the first deploy:
   ```
   mutation { reindexCatalog }      # send header x-admin-id: <admin>
   ```
   Thereafter the `@Cron` keeps the index in sync.

## 7. GraphQL surface

- `query search(input: SearchInput!, language: Language = ES, userId, sessionId): SearchResponse`
  — multi-language, typo-tolerant; excludes the caller's own listings.
- `mutation reindexCatalog: Int` — **admin only** (requires `x-admin-id`); returns the
  number of documents indexed.
- Unchanged: `autocomplete`, `recommendations`, `trending`, `trackSearchClick`,
  `trackItemView` (still Postgres-backed).

## 8. What's missing / follow-ups

**Needed to be production-real**
- **Locale onboarding**: until `LOCALE_COUNTRY_MAP` (or the Québec-region rule) is set, all
  items index into `catalog_es`, so `language: EN/FR` return nothing. Configure the country
  map with real country ids.
- **Hard-deleted services** aren't evicted incrementally (they vanish from SQL); they clear
  on the next full `reindexAll()`. Products/store-products soft-delete and are handled.
- **Event-driven sync (BullMQ)**: currently cron + admin reindex only. For near-real-time,
  have marketplace/stores/services publish `product.*` events (Phase 5 in the plan).

**Known gaps / not addressed**
- `categories` / `tags` filters are applied on the Typesense path but **still ignored on the
  Postgres fallback** path.
- Autocomplete / recommendations / trending remain Postgres-backed and were not improved.
- No accent-folding config beyond Typesense defaults; revisit if accent-insensitive matching
  is required for the fallback path.
- **Typesense schema migrations**: changing the collection schema requires a reindex
  (create new collection, reindex, swap) — not yet automated (alias/zero-downtime flip).
- `terraform/` does not yet capture the Typesense service (compose only).

**Testing caveats**
- New/changed tests pass: `typesense.engine.spec.ts`, `locale.config.spec.ts`, and the
  rewritten `search` block in `search.spec.ts`.
- The rest of `search.spec.ts` has **pre-existing failures** unrelated to this work: the mock
  `PrismaService` lacks `$queryRaw`/`$executeRaw`, so `autocomplete`/`recommendations`/
  `trending`/`trackView` tests fail. There is also a jest config conflict (`jest` key in
  `package.json` **and** `jest.config.js`) — run tests with `--config jest.config.js`.
```
