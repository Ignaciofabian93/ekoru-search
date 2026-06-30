# Search reindex & deploy runbook

How to (re)build the Typesense catalog and verify the search subgraph in each
environment. The live `search` query reads Typesense directly and does **not**
create the collection — only a reindex (or the 5‑min sync cron) does. So after a
fresh deploy you must index once, or every `search` 500s / returns empty.

> Names differ per env:
> | | container | Typesense host | network | DB |
> |---|---|---|---|---|
> | **staging** | `ekoru-search-staging` | `ekoru-typesense-staging` | `ekoru-staging-network` | `ekoru-dev` |
> | **prod** | `ekoru-search` | `ekoru-typesense` | `ekoru-network` | `ekoru` |

Substitute the right column below. Examples use **prod**.

## 1. Verify the container has the Typesense env

The app falls back to `localhost` / `dev-typesense-key` when these are unset, so
check the *running process*, not just the file:

```bash
docker exec ekoru-search printenv | grep -iE 'TYPESENSE|SEARCH_ENGINE|COUNTRY_LANGUAGE'
```

Expect (unquoted): `TYPESENSE_HOST=ekoru-typesense`, the real `TYPESENSE_API_KEY`,
`SEARCH_ENGINE=typesense`, `COUNTRY_LANGUAGE_MAP=1:es,2:en,3:en,4:es,5:fr`.

If it's empty/wrong, the container is stale. **Editing `.env.*` does not make
`docker compose up -d` recreate it** — force it:

```bash
docker compose -f compose.prod.yml up -d --force-recreate
```

> The durable source for deploys is `/opt/ekoru/secrets/ekoru-search/.env.<env>`
> (Jenkins copies it into the workspace). Update *that* file, not just a local copy.

## 2. Verify Typesense connectivity

```bash
docker exec ekoru-search wget -qO- http://ekoru-typesense:8108/health   # → {"ok":true}
```

If the name doesn't resolve, the Typesense container isn't up / not on the
network. It's deployed separately from the app (independent lifecycle):

```bash
docker compose -f typesense.prod.yml up -d
docker network inspect ekoru-network   # both ekoru-search and ekoru-typesense attached
```

## 3. Make sure the DB migration is applied

The indexer selects `Seller.contentLanguage`. staging (`ekoru-dev`) and prod
(`ekoru`) are **separate databases**, so a migration on one is not on the other.
From the repo root, against the target DB:

```bash
npx prisma migrate deploy   # with DATABASE_URL pointing at that env's DB
```

If missing, the reindex fails with `column ... does not exist`.

## 4. Reindex

```bash
docker exec ekoru-search node dist/src/scripts/reindex.js
```

Full rebuild: creates the `catalog` collection and indexes every active
product / store product / service. Expect `Reindex finished: N documents indexed.`
Afterwards the cron keeps it in sync every 5 minutes.

> `npm run reindex` works locally (it builds first), but local `.env` points at
> Docker-network hostnames, so run it **inside the container** as above.

Alternative without a shell — the admin GraphQL mutation, run in the live service:

```graphql
mutation { reindexCatalog }
```

(send with the `x-admin-id` header the gateway sets for an authenticated admin)

## 5. Smoke-test

```bash
docker exec ekoru-search wget -qO- http://localhost:4106/health   # staging: 4006
```

Then run a `search` query through the gateway with `language` + `country`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ECONNREFUSED localhost:8108`, key `dev-typesense-key` | container has no `TYPESENSE_*` env | step 1 — `--force-recreate` |
| `Error while fetching subquery from service "search"` (gateway) | real error is in the search container | `docker logs <search>` |
| `database "ekoru-production" does not exist` | wrong DB name in `DATABASE_URL` | prod DB is `ekoru` |
| `column ... does not exist` on reindex | migration not applied to that env's DB | step 3 |
| reindex OK but `search` empty | collection just created/empty, or wrong `country`/`language` args | confirm client sends both |
