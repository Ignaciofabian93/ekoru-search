# Search Improvement & Scalability Plan (ekoru-search)

> Status: planned (not yet implemented). Captured 2026-06. Owner: search subgraph.

## Context / current state

- `ekoru-search` is a NestJS Apollo Federation subgraph. It does **PostgreSQL full-text
  search** via Prisma `$queryRaw` (`to_tsvector`/`plainto_tsquery`/`ts_rank`) in
  `src/search/strategies/fulltext-search.strategy.ts`, orchestrated by
  `src/search/search.service.ts`. **No Elasticsearch today.**
- It reads `Product` / `StoreProduct` / `Service` (+ category tables) directly via raw SQL,
  i.e. it assumes a **shared Postgres** with marketplace/stores/services. Its own Prisma
  schema only holds `Search*` analytics models (logs, clicks, sessions, suggestions,
  synonyms, corrections, popular searches, history, item views).
- Cron maintenance (`@Cron` in `src/search/services/trending.service.ts`) is wired via
  `ScheduleModule`.

### Known gaps (why it doesn't scale / work well today)
1. **No index** — `to_tsvector(...)` is computed inline per row, no GIN index ⇒ sequential
   scan on every search. Biggest perf blocker.
2. Searched tables are owned by other subgraphs (shared-DB coupling; brittle to renames).
3. Language hardcoded to `'spanish'`.
4. Pagination/counts done in memory after `LIMIT 100` per source ⇒ totals cap ~300, facet
   counts only over the truncated set.
5. `categories`/`tags` filters accepted in input but never applied in SQL.
6. Synonyms (`SearchSynonym`) and corrections (`SearchCorrection`) never used in query path.
7. `spellCheck()` is a no-op ⇒ typos return zero results; no `pg_trgm`/fuzzy.
8. Suggestions computed by scanning 100 names in Node (Levenshtein) instead of the
   `SearchSuggestion` table the cron populates.
9. Relevance is muddled: `ts_rank` over flat concat (no `setweight`), then overwritten by a
   second in-app scoring pass.
10. Recommendations are shallow (re-runs text search; ignores `ItemView` history).

## Key domain facts that shape the design

- **Content is territory-specific and single-language.** No product/service translations:
  Chile sellers sell in Chile (es), Canada sellers in Canada (en / fr in Québec). Each item
  has exactly **one locale**. Only *categories* are translated.
- Items (`Product`/`StoreProduct`/`Service`) carry only `sellerId`. An item's locale must be
  **derived from the seller** (`Seller.countryId` / `regionId` in users) at index time:
  `locale = f(country, region)` → Chile=`es`, Canada=`en`, Québec=`fr`.
- Marketplace vs Store: marketplace = individuals selling single items (no stock counter);
  stores = businesses that manage stock.

## Decisions

1. **Engine: Elasticsearch 8, self-hosted in Docker now.** Most cloud-portable managed path
   later (Elastic Cloud runs on AWS/Azure/GCP); identical container runs on IONOS today.
   Apache-2.0 alternative: **OpenSearch** (AWS-managed; self-host anywhere). Kept swappable.
2. **No cloud-proprietary search** (Azure AI Search / AWS Kendra) — portability comes from
   the container + an internal abstraction, not a vendor.
3. **Index per language** (`catalog_es`, `catalog_en`, `catalog_fr`) behind aliases, with
   `country`/`region`/`type`/`category`/`tags` as keyword filter fields. Analyzers stay
   correct per locale; markets are isolated and shard independently.
4. **`SearchEngine` port**: resolvers/service depend on an interface, not the ES client, so
   the engine is a config/adapter detail (self-host ↔ Elastic Cloud ↔ OpenSearch).
5. **GraphQL contract unchanged** — swap the strategy behind `SearchResolver`; gate with
   `SEARCH_ENGINE=es|postgres` and keep the Postgres path for rollback.

## Target architecture

```
marketplace/stores/services ──(events or cron poll)──► Indexer (ekoru-search)
                                                          │ locale = f(seller.country, region)
                                                          ▼
        Elasticsearch:  catalog_es   catalog_en   catalog_fr   (index per language)
                                   ▲
ekoru-search SearchResolver ─► SearchEngine PORT ─► ElasticsearchAdapter (swappable)
```

## Phased plan

- **Phase 0 — Infra (IONOS Docker, cluster-ready).** Add `elasticsearch` service to compose
  on the docker network (single node, `discovery.type=single-node`, JVM heap ≈50% RAM capped,
  persistent volume, security on). Add deps `@elastic/elasticsearch` + `@nestjs/elasticsearch`,
  config/env (`SEARCH_ENGINE`, `ELASTICSEARCH_NODE`, auth). Capture in `terraform/` so the same
  definition provisions EC2/Azure VM or a managed endpoint later.
- **Phase 1 — `SearchEngine` port.** Interface (`index`, `bulk`, `delete`, `search`, `suggest`,
  `autocomplete`) + `ElasticsearchAdapter`; `SearchService` depends on the interface.
- **Phase 2 — Locale-aware index design.** Bootstrap `catalog_<lang>` with correct default
  analyzer, aliases, mapping (analyzed `name`/`description` + `name.ac` search_as_you_type;
  keyword/numeric filters). `country/region → language` config map = single onboarding point.
- **Phase 3 — Indexer.** Read items, join seller→country/region for locale, map categories,
  `_bulk` into `catalog_<lang>`. Admin `reindexCatalog` mutation (`@CurrentAdmin`) + CLI for the
  first load. Reindex into new index, flip alias (zero downtime).
- **Phase 4 — Query path.** `ElasticSearchStrategy` returns existing `SearchResultItem[]`.
  Route to `catalog_<userLang>` + `country` filter; `multi_match` (`name^4, name.ac^2,
  description, category^3, tags^2`) + `fuzziness: AUTO` + `function_score` (rating/offer/recency).
  Facets→aggregations; total/paging→`hits.total`+`from/size`; filters actually applied.
- **Phase 5 — Sync.** v1: `@Cron` incremental by `updatedAt` (+ remove soft-deleted). v2:
  marketplace/stores/services publish `product.created|updated|deleted` to BullMQ (Redis already
  in stack); search consumes → `_bulk`. Decoupled from query latency.
- **Phase 6 — Polish + cutover + ops.** Autocomplete via `name.ac`; did-you-mean via suggester;
  suggestions from ES/`SearchSuggestion`. Shadow-read, flip flag, keep Postgres one release. ES
  health in `health.controller.ts` + monitoring, snapshots, nightly full reindex. Fix pre-existing
  `search.spec.ts` failures + jest config conflict.

## Scaling path
- Search subgraph is stateless ⇒ scale horizontally behind the gateway; ES holds state.
- ES: 1 node (now) → 3-node cluster with `replicas≥1` (HA) → managed (Elastic Cloud on AWS/Azure
  or AWS OpenSearch) by changing `ELASTICSEARCH_NODE`. Per-language indices scale independently.
- Queue-based indexer absorbs write spikes; reindex-behind-alias = zero-downtime mapping changes.

## First milestone
Phases 0–2 + 4 = locale-routed, typo-tolerant, properly-faceted ES search behind the existing
GraphQL API, flag-guarded for rollback. Phases 3 & 5 make it production-fresh.

## Open inputs before build
- RAM the IONOS box can give ES.
- Final engine confirm (Elasticsearch vs OpenSearch) — default Elasticsearch-on-Docker, swappable.
